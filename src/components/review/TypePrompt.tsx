'use client';

/**
 * 「这题在考什么」——翻面前的必答一步
 *
 * 为什么值得多加这一下点击：
 * 翻开答案之后再问「这题考什么」是没有意义的，那时你已经看见了。
 * 只有**在信息不足时**先判断一次，才能真正练到「识别题型」这件事——
 * 而识别题型正是考试和面试里最先要用到的能力（看清在问什么，比会答更重要）。
 *
 * 顺带解决了 Phase 3 的前置依赖：交错练习需要知道每张卡属于哪一类，
 * 才能把概念/面试/错题混排。让用户在复习时顺手押一次，
 * 比在制卡页逼他下拉选一个可靠得多——制卡时人往往还没想清这卡在考什么。
 *
 * 「直接看答案」是刻意保留的逃生门。不给逃生门的强制步骤，
 * 用户会用别的方式逃（关页面），那时连数据都没有了。
 */

import React from 'react';
import { CARD_TYPE_LABEL, CARD_TYPES, type CardType } from '@/lib/learning/types';

interface TypePromptProps {
  /** 卡片当前的题型（可能是制卡时填的，也可能是上次复习押的） */
  current?: CardType;
  onPick: (cardType: CardType) => void;
  onSkip: () => void;
}

export default function TypePrompt({ current, onPick, onSkip }: TypePromptProps) {
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-text-secondary text-center">
        这题在考什么？
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {CARD_TYPES.map((type) => {
          const isCurrent = current === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onPick(type)}
              className={`chip ${isCurrent ? 'chip-active' : ''}`}
            >
              {CARD_TYPE_LABEL[type]}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="btn btn-xs btn-ghost w-full"
      >
        说不清，直接看答案
      </button>
    </div>
  );
}
