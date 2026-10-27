'use client';

/**
 * 「先复习一张」的收尾
 *
 * 为什么不能复用 SessionDone：
 * 那句话是「今天的队列清空了」。只做了一张时这么说，是在替用户宣布
 * 一件没发生的事——明天他自己打开会看到还剩一张，第一次被骗就够毁掉信任了。
 *
 * 所以这里只陈述两个事实：这一张评完了、今天还剩几张。
 * 不庆祝（一张不是成就），也不催（「明天再回来也行」才是真话），
 * 两条出路并列：继续做 / 回今日。默认不把用户推向任何一边——
 * 手册里最反对的是让「已经做了一点」变成「必须做完」。
 */

import React from 'react';

interface SingleCardDoneProps {
  /** 今天还剩几张（不含刚复习完的这张） */
  rest: number;
  onContinue: () => void;
  onBack: () => void;
}

export default function SingleCardDone({
  rest,
  onContinue,
  onBack,
}: SingleCardDoneProps) {
  return (
    <div className="surface-card w-full p-7 space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-xl font-extrabold tracking-tight text-text-primary">
          这一张复习完了
        </h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          今天还有 {rest} 张。现在接着复习也行，明天回来也行。
        </p>
      </div>

      <p className="text-[10px] text-text-secondary/70 leading-relaxed">
        断了不补。复习过一张，今天就接上了。
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="btn btn-md btn-primary flex-1"
        >
          接着复习
        </button>
        <button
          type="button"
          onClick={onBack}
          className="btn btn-md btn-secondary"
        >
          回今日
        </button>
      </div>
    </div>
  );
}
