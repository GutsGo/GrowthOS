'use client';

/**
 * 候选池（Phase 4）
 *
 * 这里放的东西**不是卡片**，是「AI 出给你的、还没答的题」。
 * 一次提取产出的 3 个追问进这里等你回来自己答——因为提取本身就是学习，
 * 让 AI 把提取也做了，你就只剩「点一下」这个动作。
 *
 * 三条设计判断：
 *
 * 1. **空的时候整块不出现。** 一个永远显示「0 条待处理」的面板，
 *    唯一作用就是制造欠账感。
 * 2. **可以整条丢掉，不需要理由。** 攒了三个月的追问，用户早就忘了
 *    当初在读什么，留着只会让他不想打开这一页。
 * 3. **接走之后才从池子消失。** 点「我来答」只是把问题填进制卡表单，
 *    真正把它移出池子是在卡片保存之后——不然用户点一下关掉页面，
 *    这条追问就凭空蒸发了。
 */

import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, PenLine, X } from 'lucide-react';
import { db } from '@/lib/db';
import { pendingCandidates, type CardCandidate } from '@/lib/learning/probe';

interface CandidatePoolProps {
  /** 点「我来答」：只把追问预填成卡片正面，答案留空 */
  onAdopt: (candidate: CardCandidate) => void;
}

export default function CandidatePool({ onAdopt }: CandidatePoolProps) {
  const all = useLiveQuery(() => db.cardCandidates.toArray());
  const [open, setOpen] = useState(true);

  const pending = useMemo(() => pendingCandidates(all ?? []), [all]);

  // 加载中、或池子空着，都不占位置
  if (!all || pending.length === 0) return null;

  const drop = async (candidate: CardCandidate) => {
    await db.cardCandidates.delete(candidate.id);
  };

  return (
    <section className="surface-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-12 px-4 flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />
          )}
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-secondary">
            候选池 · 还没答的追问
          </span>
          <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            {pending.length}
          </span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[10px] text-text-secondary/70 leading-relaxed">
            AI 出的题，没有答案。答的时候别翻原文。
          </p>

          {pending.map((candidate) => (
            <div
              key={candidate.id}
              className="group flex items-start gap-2 p-2.5 rounded-lg bg-surface-2/60 border border-border-subtle"
            >
              <p className="flex-1 text-[11px] text-text-primary leading-relaxed">
                {candidate.question}
              </p>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onAdopt(candidate)}
                  className="btn btn-xs !border-transparent !bg-primary/15 !text-primary hover:!bg-primary/25"
                  title="填入制卡表单"
                >
                  <PenLine className="w-2.5 h-2.5" /> 我来答
                </button>
                <button
                  type="button"
                  onClick={() => void drop(candidate)}
                  className="p-1 rounded-md text-text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                  title="丢掉这条"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
