'use client';

/**
 * 第一步：讲一遍
 *
 * 只有一个输入框。刻意**不做**语音转写：这一版要验证的是「三步流程是否走得通」，
 * 加语音会让变量变多（权限、识别率、标点），第一次用的人一旦卡在麦克风上，
 * 他就再也不会进第二步。语音放 Phase 4 再接（RecallPanel 已经有现成实现）。
 */

import React from 'react';
import { ArrowRight, Lightbulb } from 'lucide-react';

interface StepSpeakProps {
  concept: string;
  text: string;
  /** 从项目难题带过来的解法提示。只提示，不预填正文——预填等于替他讲 */
  seed?: string;
  onConceptChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onNext: () => void;
  /** 当前步骤的阻塞原因（由 checkDraft 给出），为空则可继续 */
  blocker?: string;
}

export default function StepSpeak({
  concept,
  text,
  seed,
  onConceptChange,
  onTextChange,
  onNext,
  blocker,
}: StepSpeakProps) {
  const charCount = text.trim().replace(/\s/g, '').length;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-secondary">
          要讲的概念
        </label>
        <input
          value={concept}
          onChange={(e) => onConceptChange(e.target.value)}
          placeholder="例如：为什么 IndexedDB 事务里读不到刚写的数据"
          className="field !h-[42px]"
        />
      </div>

      {seed && (
        <div className="flex gap-2 p-3 rounded-xl bg-surface-2/60 border border-border-subtle">
          <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-text-secondary">
            你当时记下的解法：{seed}
            <span className="block mt-1 text-neutral-gray">
              别照着念。先说清问题为什么难。
            </span>
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-secondary">
            讲出来（不看卡片）
          </label>
          <span className="text-[10px] font-mono text-neutral-gray">
            {charCount} 字
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={9}
          placeholder="想到哪说到哪。卡住就写「这里我讲不清」。"
          className="field field-area !min-h-[180px] leading-relaxed"
        />
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          {blocker ?? '不用回头改错别字。'}
        </p>
        <button
          onClick={onNext}
          disabled={Boolean(blocker)}
          className="btn btn-md btn-primary shrink-0"
        >
          下一步：标卡壳 <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
