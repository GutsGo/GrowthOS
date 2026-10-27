'use client';

/**
 * 输出完成态
 *
 * 老项目这一屏是一个大分数（85 分 · A-）加三条 AI 建议。
 * 分数会让人记住「我得了 85」，然后什么都不改。
 *
 * 这里只留两样东西：你自己标出来的卡壳点，和**一条**待补卡建议。
 * 并且明确写出「系统不会替你建卡」——提取这一步必须由人完成，
 * 因为提取本身就是学习，代劳等于把最有效的一步删掉。
 */

import React, { useState } from 'react';
import { ArrowRight, ClipboardCheck, Copy, Loader2, RotateCcw } from 'lucide-react';
import type { CardSuggestion } from '@/lib/learning/feynman';
import type { FollowUp } from '@/lib/ai/contract';

export type FollowUpState = 'idle' | 'loading' | 'done' | 'fallback';

interface OutputDoneProps {
  concept: string;
  stuckPoints: string[];
  plainSummary: string;
  suggestion: CardSuggestion | null;
  /** AI 的追问结果。它到得比存盘晚，所以这一屏要能不依赖它先渲染出来。 */
  followUp: FollowUp | null;
  followUpState: FollowUpState;
  onGoBrain: () => void;
  onRestart: () => void;
}

export default function OutputDone({
  concept,
  stuckPoints,
  plainSummary,
  suggestion,
  followUp,
  followUpState,
  onGoBrain,
  onRestart,
}: OutputDoneProps) {
  const [copied, setCopied] = useState(false);

  const copyFront = async () => {
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestion.front);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板被拒（非 https / 权限）时降级成「请手动选中复制」，不假装成功
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-widest text-primary">
          OUTPUT SAVED
        </p>
        <h2 className="text-xl font-extrabold tracking-tight text-text-primary">
          「{concept}」讲完了
        </h2>
        <p className="text-[11px] text-text-secondary leading-relaxed">
          {stuckPoints.length > 0
            ? `留下 ${stuckPoints.length} 处卡壳、一段 ${plainSummary.replace(/\s/g, '').length} 字的大白话。`
            : '这次没有卡壳点，不用补卡。讲顺不等于懂了。'}
        </p>
      </div>

      {/* AI 追问：只指出漏了什么，不打分。
          分数放在这一屏最显眼的位置，人就会记住分数然后什么都不改。 */}
      <div className="rounded-xl border border-border-subtle bg-surface-1">
        <div className="px-4 py-2.5 border-b border-border-subtle/60 flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-ai-blue">
            AI 追问 · 漏讲点
          </span>
          <span className="text-[10px] text-neutral-gray">不是评分</span>
        </div>

        <div className="p-4">
          {followUpState === 'loading' || followUpState === 'idle' ? (
            <div className="flex items-center gap-2 py-2 text-text-secondary">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-[11px]">正在找漏讲点…</span>
            </div>
          ) : followUp && followUp.gaps.length > 0 ? (
            <ul className="space-y-2.5">
              {followUp.gaps.map((gap, i) => (
                <li key={i} className="border-l-2 border-ai-blue/40 pl-2.5">
                  <p className="text-[12px] text-text-primary leading-relaxed">
                    {gap.point}
                  </p>
                  {gap.why && (
                    <p className="text-[10px] text-text-secondary leading-relaxed mt-0.5">
                      {gap.why}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-text-secondary leading-relaxed">
              {followUpState === 'fallback'
                ? '未接上 AI，没有漏讲点。本地只查术语，没提示不等于讲对了。'
                : 'AI 没挑出漏讲点，不等于讲对了。'}
            </p>
          )}

          {followUp && followUp.terms.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-subtle/50">
              <p className="text-[10px] text-text-secondary leading-relaxed">
                这几个词你用到了但没解释：
                <span className="text-amber-500 font-semibold">
                  {followUp.terms.join('、')}
                </span>
                挑一个，用一句人话讲。
              </p>
            </div>
          )}

          {followUp?.score !== null && followUp?.score !== undefined && (
            <p className="mt-2 text-[10px] text-neutral-gray font-mono">
              参照分数 {followUp.score}/100（不构成结论）
            </p>
          )}
        </div>
      </div>

      {suggestion ? (
        <div className="surface-card !border-primary/35 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border-subtle/60 bg-primary/8 flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
              待补卡 · 只建议一张
            </span>
            <span className="text-[10px] text-neutral-gray">不会自动建卡</span>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-widest text-neutral-gray mb-1">
                正面
              </p>
              <p className="text-sm font-semibold text-text-primary leading-relaxed">
                {suggestion.front}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-mono uppercase tracking-widest text-neutral-gray mb-1">
                背面（你自己的话）
              </p>
              <p className="text-[12px] text-text-secondary leading-relaxed">
                {suggestion.back}
              </p>
            </div>
            <p className="text-[10px] text-neutral-gray leading-relaxed border-t border-border-subtle/50 pt-2.5">
              {suggestion.reason}
            </p>
          </div>

          <div className="px-4 py-3 border-t border-border-subtle/60 flex items-center gap-2">
            <button
              onClick={copyFront}
              className="btn btn-sm btn-secondary"
            >
              {copied ? (
                <>
                  <ClipboardCheck className="w-3.5 h-3.5 text-primary" /> 已复制
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> 复制正面
                </>
              )}
            </button>
            <button
              onClick={onGoBrain}
              className="btn btn-sm btn-primary"
            >
              去制卡 <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="surface-card p-4">
          <p className="text-[11px] text-text-secondary leading-relaxed">
            没有卡壳点，不建议补卡。
          </p>
        </div>
      )}

      <button
        onClick={onRestart}
        className="btn btn-sm btn-ghost -ml-2"
      >
        <RotateCcw className="w-3.5 h-3.5" /> 再讲一个
      </button>
    </div>
  );
}
