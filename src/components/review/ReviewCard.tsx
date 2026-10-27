'use client';

/**
 * 一张卡的正反面
 *
 * 翻面状态由父组件持有（父组件要用它决定「评分条出不出现」），
 * 回忆面板的状态留在这里（因为它是这张卡的私事）。
 *
 * 关键点：父组件用 `key={card.id}` 渲染这个组件，
 * 换卡时整块重新挂载，`checked` / `score` 自然归零。
 * 这样就不需要「换卡时用 effect 重置一堆状态」——
 * 那种写法每加一个状态就要多改一次 effect，漏一个就串到下一张卡上。
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { Card } from '@/lib/db';
import { CARD_TYPE_LABEL, type CardType } from '@/lib/learning/types';
import {
  calculateLCS,
  describeMatch,
  highlightMatchedText,
  stripHtml,
} from '@/lib/learning/recall';
import TypePrompt from './TypePrompt';
import RecallPanel from './RecallPanel';

interface ReviewCardProps {
  card: Card;
  flipped: boolean;
  /** 是否开启「先说后看」 */
  recallEnabled: boolean;
  onPickType: (cardType: CardType) => void;
  onSkipType: () => void;
}

export default function ReviewCard({
  card,
  flipped,
  recallEnabled,
  onPickType,
  onSkipType,
}: ReviewCardProps) {
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [recallText, setRecallText] = useState('');

  const handleRecallSubmit = (text: string) => {
    // 比对的是纯文本答案；卡片背面可能是 HTML
    setScore(calculateLCS(text, stripHtml(card.back)));
    setRecallText(text);
    setChecked(true);
  };

  const handleRecallSkip = () => {
    setScore(0);
    setRecallText('');
    setChecked(true);
  };

  const showRecallPanel = recallEnabled && !checked;

  return (
    <div className="w-full perspective-[1000px]" style={{ height: 340 }}>
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
        className="relative w-full h-full preserve-3d"
      >
        {/* ---------- 正面 ---------- */}
        <div className="surface-card absolute inset-0 backface-hidden p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-widest text-text-secondary uppercase">
              正面 · 问题
            </span>
            {card.type && (
              <span className="text-[9px] font-mono text-text-secondary/70 uppercase tracking-wider">
                {CARD_TYPE_LABEL[card.type]}
              </span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center py-3 overflow-y-auto">
            <p className="text-base md:text-lg font-semibold text-text-primary leading-relaxed text-center px-2">
              {card.front}
            </p>
          </div>

          {/* 翻面前的必答一步 */}
          <TypePrompt
            current={card.type}
            onPick={onPickType}
            onSkip={onSkipType}
          />
        </div>

        {/* ---------- 背面 ---------- */}
        <div
          className="surface-card absolute inset-0 backface-hidden p-5 flex flex-col"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <div className="flex items-center justify-between flex-shrink-0 mb-2">
            <span className="text-[10px] font-mono tracking-widest text-ai-blue font-bold uppercase">
              背面 · 答案
            </span>
            {checked && score !== null && (
              <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                覆盖 {score}%
              </span>
            )}
          </div>

          {showRecallPanel ? (
            <div className="flex-1 min-h-0">
              <RecallPanel
                onSubmit={handleRecallSubmit}
                onSkip={handleRecallSkip}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <div
                className="text-sm text-text-primary leading-relaxed prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: card.back }}
              />

              {card.example && (
                <div className="rounded-lg bg-surface-2/60 border border-border-subtle p-2.5">
                  <span className="text-[9px] text-text-secondary uppercase tracking-widest font-bold block mb-1">
                    我的例子
                  </span>
                  <p className="text-[11px] text-text-primary leading-relaxed">
                    {card.example}
                  </p>
                </div>
              )}

              {checked && score !== null && (
                <div className="rounded-lg bg-surface-2/60 border border-border-subtle p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-text-secondary uppercase tracking-widest font-bold">
                      你刚才说的
                    </span>
                    <span className="text-[9px] text-text-secondary">
                      {describeMatch(score)}
                    </span>
                  </div>
                  {recallText ? (
                    <div
                      className="text-[11px] text-text-primary leading-relaxed break-all max-h-[72px] overflow-y-auto"
                      dangerouslySetInnerHTML={{
                        __html: highlightMatchedText(
                          recallText,
                          stripHtml(card.back),
                        ),
                      }}
                    />
                  ) : (
                    <p className="text-[11px] text-text-secondary">
                      这次没写。
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
