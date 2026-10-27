'use client';

/**
 * 主动回忆面板（语音 + 打字 + LCS 比对）
 *
 * 这是 GrowthOS 相对普通闪卡工具的真正优势，重构时必须留住：
 * 它不要求你「答对」，只要求你**先把话说出来**，然后把你说的话
 * 和标准答案做最长公共子序列比对，给出一个覆盖率。
 *
 * 分数的作用不是判分，是让「我以为我会了」和「我真的讲得出来」之间的差距
 * 变得可见。看见差距本身，就是提取练习的全部价值。
 *
 * 两个工程细节：
 * 1. **不做能力嗅探**。老代码在 effect 里检测 SpeechRecognition 支持并 setState，
 *    既触发了 `set-state-in-effect`，又会在 SSR/CSR 之间造成水合不一致。
 *    现在改成「点了才知道」：start() 里拿不到构造函数就降级提示打字。
 * 2. **文本一律当纯文本处理**。比对后再转义上色（见 recall.ts），
 *    绝不把用户口述内容原样塞进 innerHTML。
 */

import React, { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';

/* ---------- Web Speech API 的最小类型 ----------
 * 浏览器原生类型在 lib.dom 里并不完整（webkit 前缀版本更是完全没有），
 * 所以这里手写一份够用的声明。刻意不写 `any`：
 * 语音事件的形状一旦写错，是运行时才炸的那种错。 */

interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}
interface SpeechResultEvent {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}
interface SpeechErrorEvent {
  readonly error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Safari 只暴露 webkit 前缀版本，两个都要找 */
function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface RecallPanelProps {
  /** 点「核对」时把用户说的原话交出去，由父组件算分并揭示答案 */
  onSubmit: (text: string) => void;
  /** 放弃回忆，直接看答案（分数按 0 计） */
  onSkip: () => void;
}

export default function RecallPanel({ onSubmit, onSkip }: RecallPanelProps) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // 卸载时确保麦克风关掉，否则浏览器地址栏的录音图标会一直亮着
  useEffect(() => {
    const recognition = recognitionRef.current;
    return () => {
      recognition?.stop();
    };
  }, []);

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('此浏览器不支持语音识别，可直接打字。');
      return;
    }

    try {
      const recognition: SpeechRecognitionLike = new Ctor();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let buffer = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          buffer += event.results[i][0].transcript;
        }
        setText(buffer.trim());
      };

      recognition.onerror = (event) => {
        // 「no-speech」是没听到声音，不是错误，别吓用户
        if (event.error && event.error !== 'no-speech') {
          setError('麦克风未开启，可直接打字。');
        }
        setListening(false);
      };

      recognition.onend = () => setListening(false);

      recognition.start();
      recognitionRef.current = recognition;
      setError(null);
      setListening(true);
    } catch {
      setError('麦克风启动失败，可直接打字。');
      setListening(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="text-center space-y-1">
        <p className="text-xs font-bold text-text-primary">
          先别翻。说一遍答案。
        </p>
        <p className="text-[10px] text-text-secondary">
          说不全没关系，说不出来才有信息。
        </p>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={toggleListening}
          className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all duration-200 relative ${
            listening
              ? 'bg-primary border-primary text-black animate-pulse'
              : 'bg-surface-2 border-border-subtle text-text-secondary hover:text-text-primary hover:border-text-secondary'
          }`}
        >
          <Mic className="w-4 h-4" />
          {listening && (
            <span className="absolute inset-0 rounded-full border border-primary animate-ping opacity-50" />
          )}
        </button>
        <span className="text-[9px] text-text-secondary font-mono">
          {listening ? '正在听… 再点一次停止' : '开始说'}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="说出的内容会出现在这里，也可直接打字"
        className="field field-area w-full flex-1 !min-h-[96px] resize-none"
      />

      {error && (
        <p className="text-[10px] text-amber-500 leading-relaxed">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            stopListening();
            onSubmit(text);
          }}
          className="btn btn-md btn-primary flex-1"
        >
          核对一下
        </button>
        <button
          type="button"
          onClick={() => {
            stopListening();
            onSkip();
          }}
          className="btn btn-md btn-secondary"
        >
          直接看
        </button>
      </div>
    </div>
  );
}
