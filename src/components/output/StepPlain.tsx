'use client';

/**
 * 第三步：写 100 字大白话
 *
 * 判据不靠 AI，靠两条可验证的规则：字数在 40–130 之间，且没有术语。
 * 术语检测的意义不是「挑错」，而是**替你看不见的省略**：
 * 写出「底层逻辑」的时候，你自己以为说清楚了，读者什么都没拿到。
 */

import React from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import {
  PLAIN_MAX_CHARS,
  PLAIN_MIN_CHARS,
  type PlainSummaryCheck,
} from '@/lib/learning/feynman';

interface StepPlainProps {
  value: string;
  check: PlainSummaryCheck;
  onChange: (value: string) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}

export default function StepPlain({
  value,
  check,
  onChange,
  onBack,
  onFinish,
  saving,
}: StepPlainProps) {
  const ratio = Math.min(1, check.length / PLAIN_MAX_CHARS);
  const tone = check.ok
    ? 'text-primary'
    : check.length > PLAIN_MAX_CHARS
      ? 'text-amber-400'
      : 'text-text-secondary';

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          写给一个完全不懂的人。一个术语都不许用。
        </p>
        <span className={`text-[10px] font-mono ${tone}`}>
          {check.length} / {PLAIN_MAX_CHARS}
        </span>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder={`至少 ${PLAIN_MIN_CHARS} 字，最多 ${PLAIN_MAX_CHARS} 字。`}
        className="field field-area !min-h-[150px] leading-relaxed"
      />

      {/* 进度条只表示「长度是否到位」，不表示质量——质量没有进度条 */}
      <div className="h-1 rounded-full bg-surface-3 overflow-hidden -mt-2">
        <div
          className={`h-full transition-all ${check.ok ? 'bg-primary' : 'bg-text-secondary/50'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>

      <div
        className={`px-3 py-2.5 rounded-xl border text-[11px] leading-relaxed ${
          check.ok
            ? 'border-primary/35 bg-primary/8 text-text-primary'
            : 'border-border-subtle bg-surface-2 text-text-secondary'
        }`}
      >
        {check.message}
      </div>

      <div className="flex items-center justify-between gap-4 pt-1 border-t border-border-subtle/60">
        <button
          onClick={onBack}
          className="btn btn-sm btn-ghost -ml-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 回上一屏
        </button>
        <button
          onClick={onFinish}
          disabled={!check.ok || saving}
          className="btn btn-md btn-primary shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          {saving ? '保存中…' : '完成这次输出'}
        </button>
      </div>
    </div>
  );
}
