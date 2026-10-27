'use client';

/**
 * 第二步：标卡壳
 *
 * 把你自己讲的话切成句子摆出来，让你点。
 *
 * 为什么不让用户在空白框里回想：让他回想「刚才哪里卡了」，答案通常是「都还行」。
 * 把句子摆出来后，他会认出来「第三句当时是跳过去的」——识别比回忆容易得多，
 * 但识别只有在你自己的原话面前才起效。
 */

import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-react';

interface StepStuckProps {
  /** 从正文切出来的候选句 */
  sentences: string[];
  stuckPoints: string[];
  onToggle: (sentence: string) => void;
  onAdd: (sentence: string) => void;
  onBack: () => void;
  onNext: () => void;
  /** 当前步骤的提示（没标卡壳点时的提醒，不阻塞） */
  hint?: string;
}

export default function StepStuck({
  sentences,
  stuckPoints,
  onToggle,
  onAdd,
  onBack,
  onNext,
  hint,
}: StepStuckProps) {
  const [manual, setManual] = useState('');
  /** 手动加的句子不在候选列表里，单独渲染，避免「加了却看不见」 */
  const manualPoints = stuckPoints.filter((p) => !sentences.includes(p));

  const submitManual = () => {
    const clean = manual.trim();
    if (!clean) return;
    onAdd(clean);
    setManual('');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          点出含糊过去的地方。一张卡只补一处。
        </p>
        <span className="text-[10px] font-mono text-neutral-gray shrink-0">
          已标 {stuckPoints.length}
        </span>
      </div>

      {sentences.length === 0 ? (
        <p className="text-xs text-neutral-gray py-6 text-center">
          内容太短，没切出完整句子。可在下面手写。
        </p>
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {sentences.map((sentence) => {
            const selected = stuckPoints.includes(sentence);
            return (
              <button
                key={sentence}
                onClick={() => onToggle(sentence)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-[12px] leading-relaxed transition-all ${
                  selected
                    ? 'border-primary/50 bg-primary/10 text-text-primary'
                    : 'border-border-subtle bg-surface-2 text-text-secondary hover:border-text-secondary/40'
                }`}
              >
                <span className={selected ? 'text-primary mr-1.5' : 'mr-1.5 opacity-30'}>
                  ●
                </span>
                {sentence}
              </button>
            );
          })}
        </div>
      )}

      {manualPoints.length > 0 && (
        <div className="space-y-2">
          {manualPoints.map((point) => (
            <div
              key={point}
              className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-primary/40 bg-primary/10"
            >
              <span className="text-[12px] leading-relaxed text-text-primary flex-1">
                {point}
              </span>
              <button
                onClick={() => onToggle(point)}
                className="text-neutral-gray hover:text-text-primary transition-colors shrink-0"
                aria-label="去掉这一条"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitManual();
            }
          }}
          placeholder="还有没讲清的？写一句"
          className="field flex-1"
        />
        <button
          onClick={submitManual}
          disabled={!manual.trim()}
          className="btn btn-md btn-soft !w-[38px] !px-0"
          aria-label="添加卡壳点"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 pt-1 border-t border-border-subtle/60">
        <button
          onClick={onBack}
          className="btn btn-sm btn-ghost -ml-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 回上一屏
        </button>

        <div className="flex items-center gap-3">
          <p className="text-[10px] text-neutral-gray text-right leading-relaxed max-w-[220px]">
            {stuckPoints.length === 0 ? hint : '标完往下走。'}
          </p>
          <button
            onClick={onNext}
            className="btn btn-md btn-primary shrink-0"
          >
            下一步：写 100 字 <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
