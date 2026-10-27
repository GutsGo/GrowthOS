'use client';

/**
 * 今日门禁（首屏唯一的主角）
 *
 * 这一块只允许出现三样东西：
 * ① 一句话：今天有多少要做
 * ② 一个按钮：先复习一张
 * ③ 一句话：断了不补
 *
 * 任何想往这里加第四个元素的想法，都应该先问一句「它比『先复习一张』更重要吗」。
 * 老项目首屏有 6 张卡 + 1 个强制弹窗，就是从「顺手加一个」开始的。
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, PenLine } from 'lucide-react';
import type { TodayGate } from '@/lib/learning/gate';

interface TaskGateProps {
  gate: TodayGate;
  /** 近 30 天出勤天数，0 时不显示（新用户不该被「0 天」打击） */
  activeDays30: number;
  onPrimary: () => void;
}

export default function TaskGate({
  gate,
  activeDays30,
  onPrimary,
}: TaskGateProps) {
  const isCreate = gate.action === 'create';

  return (
    <section className="surface-card relative overflow-hidden">
      {/* 一点极轻的主色光晕，用来把注意力压到按钮上 */}
      <div className="pointer-events-none absolute -top-24 -right-16 w-56 h-56 rounded-full bg-primary/8 blur-3xl" />

      <div className="relative p-6 md:p-8">
        {/* 大标题用衬线：首屏只有这一句话，衬线让它更像「一句话」而不是一块界面文案 */}
        {/* 页面级 h1 在 TodayView，这里降为 h2——一个页面只有一个 h1 */}
        <h2 className="font-serif text-[26px] md:text-[30px] leading-[1.25] font-bold tracking-tight text-text-primary">
          {gate.headline}
        </h2>

        <p className="text-sm text-text-secondary mt-1.5">{gate.detail}</p>

        <motion.button
          type="button"
          onClick={onPrimary}
          whileTap={{ scale: 0.985 }}
          className="btn btn-lg btn-primary mt-6 w-full font-bold shadow-[0_4px_18px_rgba(29,185,84,0.22)]"
        >
          {isCreate ? <PenLine className="w-4 h-4" /> : null}
          {gate.primaryLabel}
          {!isCreate && <ArrowRight className="w-4 h-4" />}
        </motion.button>

        <p className="text-center text-[11px] text-text-secondary mt-2.5">
          {gate.primaryHint}
        </p>

        {gate.showQuotaNote && (
          <p className="text-center text-[10px] text-text-secondary/70 mt-1.5 font-mono">
            {gate.quotaNote}
          </p>
        )}

        <div className="mt-6 pt-4 border-t border-border-subtle/60">
          <p className="text-[11px] text-text-secondary leading-relaxed">
            断了不补。今天复习一张，就接上了。
            {activeDays30 > 0 && (
              <span className="text-text-secondary/70">
                {' '}
                近 30 天来了 {activeDays30} 天。
              </span>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
