'use client';

/**
 * 单个习惯卡（从 HabitGrid 抽出，只为把主文件控制在 300 行内）
 *
 * 纯展示 + 一个 onToggle 回调。所有判定（是否已打卡、是否推荐、是否被前置习惯锁住）
 * 都由父组件算好传进来——这样这张卡本身不碰数据库，也不会因为一次打卡
 * 触发整棵树的 Dexie 订阅。
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  Code,
  MessageSquare,
  Activity,
  User,
  Target,
  Check,
  Lock,
} from 'lucide-react';
import type { Habit } from '@/lib/db';
import SpotlightCard from '../reactbits/SpotlightCard';

const MotionSpotlightCard = motion.create(SpotlightCard);

const HABIT_ICONS: Record<string, React.ReactNode> = {
  Code: <Code className="w-5 h-5" />,
  MessageSquare: <MessageSquare className="w-5 h-5" />,
  Activity: <Activity className="w-5 h-5" />,
  User: <User className="w-5 h-5" />,
};

export interface HabitParticle {
  id: number;
  angle: number;
  speed: number;
  color: string;
}

interface HabitCardProps {
  habit: Habit;
  isLogged: boolean;
  isRecommended: boolean;
  isLocked: boolean;
  parentName?: string;
  particles: HabitParticle[];
  onToggle: () => void;
}

export default function HabitCard({
  habit,
  isLogged,
  isRecommended,
  isLocked,
  parentName,
  particles,
  onToggle,
}: HabitCardProps) {
  return (
    <MotionSpotlightCard
      whileHover={isLocked ? {} : { scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={() => !isLocked && onToggle()}
      spotlightColor={
        isLogged
          ? 'rgba(29, 185, 84, 0.25)'
          : isRecommended
            ? 'rgba(29, 185, 84, 0.3)'
            : 'rgba(29, 185, 84, 0.1)'
      }
      className={`relative rounded-xl border select-none overflow-hidden transition-all ${
        isLocked
          ? 'border-border-subtle opacity-45 cursor-not-allowed'
          : isLogged
            ? 'border-primary/40 cursor-pointer'
            : isRecommended
              ? 'border-primary/70 cursor-pointer'
              : 'border-border-subtle hover:border-text-secondary/40 cursor-pointer'
      }`}
    >
      <div className="flex items-center justify-between p-3.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
              isLocked
                ? 'bg-surface-2 text-neutral-gray'
                : isLogged
                  ? 'bg-primary text-primary-text'
                  : 'bg-surface-3 text-text-secondary'
            }`}
          >
            {HABIT_ICONS[habit.icon] ?? <Target className="w-5 h-5" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-text-primary truncate">
                {habit.name}
              </p>
              {isRecommended && !isLocked && (
                <span className="text-[9px] bg-primary/20 text-primary font-bold font-mono px-1.5 py-0.5 rounded uppercase flex-shrink-0">
                  最宜
                </span>
              )}
              {isLocked && <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />}
            </div>
            <span className="text-[10px] text-text-secondary font-mono block mt-0.5 truncate">
              {isLocked
                ? `先完成：${parentName ?? '前置习惯'}`
                : `${habit.energyDemand} 能量 · ${
                    habit.customFormType && habit.customFormType !== 'none'
                      ? '特化'
                      : '常规'
                  }`}
            </span>
          </div>
        </div>

        <div className="relative flex items-center justify-center w-6 h-6 flex-shrink-0 ml-2">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute w-1 h-1 rounded-full pointer-events-none z-10"
              style={{ backgroundColor: p.color }}
              animate={{
                x: Math.cos(p.angle) * p.speed * 3.5,
                y: Math.sin(p.angle) * p.speed * 3.5,
                scale: [1, 1.2, 0.1],
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          ))}
          <div
            className={`w-full h-full rounded-full border flex items-center justify-center transition-all ${
              isLogged
                ? 'bg-primary border-primary text-primary-text'
                : 'border-muted-gray bg-transparent'
            }`}
          >
            {isLogged && <Check className="w-3.5 h-3.5 stroke-[3]" />}
          </div>
        </div>
      </div>
    </MotionSpotlightCard>
  );
}
