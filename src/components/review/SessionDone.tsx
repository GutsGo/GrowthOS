'use client';

/**
 * 复习完成页
 *
 * 刻意不做庆祝动画、不给「击败了遗忘曲线」这类评语。
 * 理由：复习完成是一件日常小事，把它做成颁奖典礼，
 * 等于暗示「坚持很了不起」，反过来就是说「不坚持很差劲」。
 * 而断一天对长期轨迹没有显著影响（手册第七章），所以这里只说事实：
 * 你今天评了几张、忘了几张、明天还有几张。
 *
 * 「忘了几张」是唯一被单独标出来的数字，而且是中性色不是红色——
 * 忘记是算法正常运转的证据（它把卡重新拉回你面前），不是失败。
 * 如果忘记让人羞耻，下次人就会瞒着系统点「良好」，间隔全乱。
 */

import React from 'react';

interface SessionDoneProps {
  rated: number;
  lapsed: number;
  introduced: number;
  /** 因超出新卡配额被顺延到明天的新卡数 */
  deferredNew: number;
  /** 其中翻面前先答了两轮考官的卡数 */
  examined: number;
  onBack: () => void;
  onMakeCard: () => void;
}

export default function SessionDone({
  rated,
  lapsed,
  introduced,
  deferredNew,
  examined,
  onBack,
  onMakeCard,
}: SessionDoneProps) {
  return (
    <div className="surface-card w-full p-7 space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-extrabold tracking-tight text-text-primary">
          今天的队列清空了
        </h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          下次复习已排好，明天会自动出现。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="评了" value={rated} unit="张" />
        <Stat label="忘了" value={lapsed} unit="张" />
        <Stat label="新卡" value={introduced} unit="张" />
      </div>

      {examined > 0 && (
        <p className="text-[11px] text-text-secondary leading-relaxed">
          其中 <span className="text-text-primary font-bold">{examined}</span> 张在翻面前
          先答了两轮。答得费劲的，才是要重做的。
        </p>
      )}

      {deferredNew > 0 && (
        <p className="text-[11px] text-text-secondary leading-relaxed bg-surface-2/60 border border-border-subtle rounded-lg p-2.5">
          还有 <span className="text-amber-500 font-bold">{deferredNew}</span>{' '}
          张新卡排在明天。
        </p>
      )}

      <p className="text-[10px] text-text-secondary/70 leading-relaxed">
        断一天不改长期轨迹。
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="btn btn-md btn-primary flex-1"
        >
          回今日
        </button>
        <button
          type="button"
          onClick={onMakeCard}
          className="btn btn-md btn-secondary"
        >
          再制一张
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="rounded-xl bg-surface-2/60 border border-border-subtle px-2 py-3 text-center">
      <div className="text-lg font-extrabold font-mono tabular-nums text-text-primary">
        {value}
      </div>
      <div className="text-[9px] text-text-secondary mt-0.5">
        {label}（{unit}）
      </div>
    </div>
  );
}
