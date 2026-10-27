'use client';

/**
 * 考官追问（Phase 4）· 纯展示
 *
 * 复习时最大的自欺是「看一眼答案，觉得眼熟，就点良好」。眼熟 ≠ 能答。
 * 这个面板在翻面**之前**多要两轮回答，把「眼熟」暴露成「其实说不清」。
 *
 * 请求逻辑不在这里，在 ReviewsView 里。这样做有两个原因：
 * 1. 面板不持有网络状态，挂载/重挂载都不会重复发请求；
 * 2. 「首问」发生在用户点击的那一刻，而不是 mount 之后——
 *    在 effect 里发首问，既会触发 `set-state-in-effect`，
 *    也确实会出现「点开面板先闪一下空白再出现问题」。
 *
 * 三条产品判断：
 * 1. **最多两轮，且随时可以直接看答案。** 没有逃生门的强制步骤，
 *    用户会用关页面来逃，那时连数据都留不下。
 * 2. **考官只问，不给答案。** 一给答案就变成「AI 讲给你听」，
 *    那和看卡片背面没有区别，还多绕一圈。
 * 3. **两轮答完自动翻面。** 刚答完的那一刻最想知道自己漏了什么，
 *    再点一次「看答案」纯属浪费。
 */

import React, { useState } from 'react';
import { ArrowRight, Eye, Loader2 } from 'lucide-react';
import { EXAM_MAX_ROUNDS, examProgress, thinAnswerHint } from '@/lib/learning/exam';

interface ExaminerPanelProps {
  /** 当前这一轮的问题；null 表示还在等 */
  question: string | null;
  loading: boolean;
  /** 问题来自本地降级（没配 AI）时为 true */
  fallback: boolean;
  answeredCount: number;
  onSubmit: (answer: string) => void;
  onSkip: () => void;
}

export default function ExaminerPanel({
  question,
  loading,
  fallback,
  answeredCount,
  onSubmit,
  onSkip,
}: ExaminerPanelProps) {
  const [draft, setDraft] = useState('');
  const { answered } = examProgress(
    Array.from({ length: answeredCount }, () => ({ question: '', answer: '' })),
  );
  const hint = thinAnswerHint(draft);

  const submit = () => {
    const answer = draft.trim();
    if (!answer || loading) return;
    setDraft('');
    onSubmit(answer);
  };

  return (
    <div className="w-full surface-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-ai-blue font-bold">
            考官追问
          </span>
          <span className="flex items-center gap-1">
            {Array.from({ length: EXAM_MAX_ROUNDS }).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  i < answered ? 'bg-ai-blue' : 'bg-surface-3'
                }`}
              />
            ))}
          </span>
          <span className="text-[10px] text-text-secondary font-mono tabular-nums">
            {answered}/{EXAM_MAX_ROUNDS}
          </span>
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-text-primary transition-colors"
        >
          <Eye className="w-3 h-3" /> 直接看答案
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 justify-center text-text-secondary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-[11px]">正在生成下一个问题…</span>
        </div>
      ) : (
        <p className="text-sm font-semibold text-text-primary leading-relaxed">
          {question}
        </p>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
        }}
        placeholder="不看答案，想到什么说什么。说不出来才有信息。"
        rows={3}
        className="field field-area !min-h-[84px] resize-none leading-relaxed"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] text-text-secondary/70 min-w-0 truncate">
          {hint ??
            (answeredCount < EXAM_MAX_ROUNDS
              ? `还剩 ${EXAM_MAX_ROUNDS - answeredCount} 轮，答完自动翻面。`
              : '')}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || loading}
          className="btn btn-sm btn-ai shrink-0"
        >
          回答 <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {fallback && (
        <p className="text-[10px] text-text-secondary/50">
          本地追问（未配置 AI），不会针对你的答案深挖。
        </p>
      )}
    </div>
  );
}
