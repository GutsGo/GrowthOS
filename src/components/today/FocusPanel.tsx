'use client';

/**
 * 专注面板（番茄钟 + 白噪音）
 *
 * 从 FlowView 里搬出来，并降级为「今日」页底部的一个折叠卡。
 * 理由很简单：番茄钟是**工具**，不是**页面**。
 * 老项目把它做成独立一级 tab，于是「专注」变成了一个要去的地方，
 * 而不是做卡时顺手按的按钮。
 *
 * 逻辑与老实现一致（倒计时、蜂鸣、系统通知、白噪音循环与音量），
 * 只是不再独占一屏，也不再承载复习与费曼。
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clock, Pause, Play, RotateCcw } from 'lucide-react';
import { useAppStore } from '@/lib/store';

const NOISE_SOURCES = {
  rain: 'https://www.soundjay.com/nature/sounds/rain-07.mp3',
  cafe: 'https://www.soundjay.com/misc/sounds/ambient-dining-room-1.mp3',
} as const;

type NoiseType = 'none' | 'rain' | 'cafe';

export default function FocusPanel() {
  const { flowTimerMinutes, setFlowTimerMinutes } = useAppStore();

  const [open, setOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(flowTimerMinutes * 60);
  const [isActive, setIsActive] = useState(false);
  const [noiseType, setNoiseType] = useState<NoiseType>('none');
  const [noiseVolume, setNoiseVolume] = useState(0.4);
  const [isPlayingNoise, setIsPlayingNoise] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * 切换时长：在这里直接重置，不用 effect 监听 flowTimerMinutes。
   * 用 effect 会出现「点 45M → 渲染一次旧值 → effect 再改一次」的闪动，
   * 而且同步 setState 会触发级联渲染。
   */
  const pickMinutes = (mins: number) => {
    setFlowTimerMinutes(mins);
    setSecondsLeft(mins * 60);
    setIsActive(false);
  };

  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        if (timerRef.current) clearInterval(timerRef.current);
        setIsActive(false);
        beep();
        notify();
        return 0;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // 白噪音：切换音源 / 播放状态 / 音量
  useEffect(() => {
    if (!open || noiseType === 'none') {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new Audio(NOISE_SOURCES[noiseType]);
      audioRef.current.loop = true;
    } else if (!audioRef.current.src.endsWith(NOISE_SOURCES[noiseType])) {
      audioRef.current.src = NOISE_SOURCES[noiseType];
    }
    audioRef.current.volume = noiseVolume;
    if (isPlayingNoise) {
      // 浏览器要求先有交互才能播；被拒时不弹错，静音降级即可
      audioRef.current.play().catch(() => setIsPlayingNoise(false));
    } else {
      audioRef.current.pause();
    }
  }, [open, noiseType, isPlayingNoise, noiseVolume]);

  // 卸载时停掉声音——没人希望切走之后耳机里还有雨声
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  /** 收起面板：顺手把声音停掉。放在事件里做，避免在 effect 里同步 setState。 */
  const closePanel = () => {
    setOpen(false);
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlayingNoise(false);
  };

  const toggleTimer = () => {
    if (secondsLeft === 0) setSecondsLeft(flowTimerMinutes * 60);
    // 在用户点击时才申请通知权限：一进页面就弹权限框，多数人会直接点拒绝
    if (
      !isActive &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => {});
    }
    setIsActive((v) => !v);
  };

  const reset = () => {
    setIsActive(false);
    setSecondsLeft(flowTimerMinutes * 60);
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <section className="surface-card overflow-hidden">
      <button
        onClick={() => (open ? closePanel() : setOpen(true))}
        className="w-full h-12 px-4 flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-text-secondary" />
          <span className="text-xs font-semibold text-text-secondary">专注</span>
          <span className="text-[10px] text-neutral-gray font-mono">
            {isActive ? `${mm}:${ss} 进行中` : `${flowTimerMinutes} 分钟`}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-neutral-gray transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border-subtle/60 pt-4">
          <div className="flex items-center gap-4">
            <span className="text-3xl font-mono font-extrabold tracking-wider text-text-primary tabular-nums">
              {mm}:{ss}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTimer}
                className={`btn btn-sm ${isActive ? 'btn-soft' : 'btn-primary'}`}
              >
                {isActive ? (
                  <>
                    <Pause className="w-3 h-3 fill-current" /> 暂停
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" /> 开始
                  </>
                )}
              </button>
              <button
                onClick={reset}
                className="btn btn-sm btn-soft !px-0 w-8"
                aria-label="重置计时"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex gap-1 ml-auto">
              {[15, 25, 45].map((mins) => (
                <button
                  key={mins}
                  onClick={() => pickMinutes(mins)}
                  className={`btn btn-xs !px-2 font-mono ${flowTimerMinutes === mins ? 'text-primary border-primary/50 bg-primary/10' : 'text-neutral-gray border-transparent hover:text-text-primary'}`}
                >
                  {mins}M
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-secondary font-mono">环境音</span>
            {(['none', 'rain', 'cafe'] as NoiseType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setNoiseType(type);
                  setIsPlayingNoise(type !== 'none');
                }}
                className={`btn btn-xs !px-2 ${noiseType === type ? 'text-primary border-primary/40 bg-primary/10' : 'text-text-secondary border-border-subtle'}`}
              >
                {type === 'none' ? '无' : type === 'rain' ? '雨声' : '咖啡馆'}
              </button>
            ))}

            {noiseType !== 'none' && (
              <>
                <button
                  onClick={() => setIsPlayingNoise((v) => !v)}
                  className="btn btn-xs !px-2 btn-soft"
                >
                  {isPlayingNoise ? '暂停' : '播放'}
                </button>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={noiseVolume}
                  onChange={(e) => setNoiseVolume(Number(e.target.value))}
                  className="flex-1 h-1 accent-primary cursor-pointer"
                  aria-label="音量"
                />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** 三声上行蜂鸣。用 Web Audio 现合成，不额外加载音频文件。 */
function beep() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    [
      [0, 523.25],
      [0.5, 523.25],
      [1.0, 659.25],
    ].forEach(([delay, freq]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + delay + 0.4,
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.4);
    });
  } catch {
    // 没有音频上下文就算了，不打断计时
  }
}

function notify() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  new Notification('专注结束', {
    body: '起来走两步。',
  });
}
