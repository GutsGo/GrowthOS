'use client';

/**
 * 习惯打卡矩阵（从 DashboardView 拆出，行为保持不变）
 *
 * 唯一的产品改动：它从首屏右上「必须看见」的位置，挪到了「今日门禁」下方的第二屏。
 * 打卡是记录，不是入场券——先让人把今天那一张卡做完，再看习惯。
 *
 * 单个卡片的渲染在 HabitCard.tsx；本文件只负责状态、依赖校验与拖拽排序。
 */

import React, { useMemo, useState } from 'react';
import { Reorder } from 'framer-motion';
import { ArrowUpDown } from 'lucide-react';
import { db, trackDeletion, type Habit, type HabitLog } from '@/lib/db';
import type { HabitCustomData } from '@/lib/habit-data';
import HabitCard, { type HabitParticle } from './HabitCard';
import SpecializedRecordModal from '../SpecializedRecordModal';

interface HabitGridProps {
  habits: Habit[];
  todayLogs: HabitLog[];
  currentDate: string;
  energy: number;
}

export default function HabitGrid({
  habits,
  todayLogs,
  currentDate,
  energy,
}: HabitGridProps) {
  // 拖拽中的临时顺序（只存 id）。落库成功后 liveQuery 会带回新的 order，
  // 所以不需要把 Habit 对象复制进 state，也就不需要 effect 去同步。
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [isSorting, setIsSorting] = useState(false);
  const [particles, setParticles] = useState<Record<string, HabitParticle[]>>({});
  const [isSpecializedOpen, setIsSpecializedOpen] = useState(false);
  const [activeSpecializedHabit, setActiveSpecializedHabit] =
    useState<Habit | null>(null);

  const sortedHabits = useMemo(() => {
    const byOrder = [...habits].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!dragOrder) return byOrder;
    const map = new Map(habits.map((h) => [h.id, h]));
    const dragged = dragOrder
      .map((id) => map.get(id))
      .filter((h): h is Habit => Boolean(h));
    // 库里有新增而拖拽快照没覆盖到时，把漏掉的补在后面
    const missing = byOrder.filter((h) => !dragOrder.includes(h.id));
    return [...dragged, ...missing];
  }, [habits, dragOrder]);

  const loggedHabitIds = useMemo(
    () => new Set(todayLogs.map((l) => l.habitId)),
    [todayLogs],
  );

  const recommendedDemand = useMemo(() => {
    if (energy >= 7) return 'high';
    if (energy >= 5) return 'medium';
    return 'low';
  }, [energy]);

  const burst = (habitId: string) => {
    const colors = ['#1DB954', '#1ED760', '#3b82f6', '#10b981'];
    const next: HabitParticle[] = Array.from({ length: 15 }).map((_, idx) => ({
      id: idx,
      angle: (idx / 15) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
      speed: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    setParticles((prev) => ({ ...prev, [habitId]: next }));
    setTimeout(() => {
      setParticles((prev) => {
        const copy = { ...prev };
        delete copy[habitId];
        return copy;
      });
    }, 1000);
  };

  const handleSortEnd = async (list: Habit[]) => {
    setDragOrder(list.map((h) => h.id));
    for (let i = 0; i < list.length; i++) {
      await db.habits.update(list[i].id, { order: i });
    }
  };

  const toggleHabitLog = async (habitId: string) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;

    // 前置依赖：行为链
    if (habit.dependsOn && !loggedHabitIds.has(habit.dependsOn)) {
      const parent = habits.find((h) => h.id === habit.dependsOn);
      alert(`先完成【${parent?.name || '前置习惯'}】`);
      return;
    }

    // 特化表单打卡走弹窗
    if (habit.customFormType && habit.customFormType !== 'none') {
      if (loggedHabitIds.has(habitId)) {
        const existing = await db.habitLogs
          .where({ habitId, date: currentDate })
          .first();
        if (existing) {
          await db.habitLogs.delete(existing.id);
          await trackDeletion('habitLogs', existing.id);
        }
      } else {
        setActiveSpecializedHabit(habit);
        setIsSpecializedOpen(true);
      }
      return;
    }

    const existing = await db.habitLogs
      .where({ habitId, date: currentDate })
      .first();
    if (existing) {
      await db.habitLogs.delete(existing.id);
      await trackDeletion('habitLogs', existing.id);
    } else {
      await db.habitLogs.add({
        id: crypto.randomUUID(),
        habitId,
        date: currentDate,
        createdAt: new Date(),
      });
      burst(habitId);
    }
  };

  const handleSaveSpecializedLog = async (
    customData: HabitCustomData,
    imageUrl?: string,
  ) => {
    if (!activeSpecializedHabit) return;
    const habitId = activeSpecializedHabit.id;
    await db.habitLogs.add({
      id: crypto.randomUUID(),
      habitId,
      date: currentDate,
      customData,
      imageUrl,
      createdAt: new Date(),
    });
    burst(habitId);
    setIsSpecializedOpen(false);
    setActiveSpecializedHabit(null);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title">
          习惯 · {habits.filter((h) => loggedHabitIds.has(h.id)).length}/
          {habits.length}
        </h2>
        {habits.length > 1 && (
          <button
            type="button"
            onClick={() => setIsSorting(!isSorting)}
            className="btn btn-xs btn-ghost gap-1 uppercase font-mono"
          >
            <ArrowUpDown className="w-3 h-3" />
            {isSorting ? '完成' : '排序'}
          </button>
        )}
      </div>

      {habits.length === 0 ? (
        <div className="surface-card text-center py-6 text-xs text-text-secondary">
          还没有习惯。在设置里添加。
        </div>
      ) : isSorting ? (
        <Reorder.Group
          values={sortedHabits}
          onReorder={handleSortEnd}
          className="space-y-2"
        >
          {sortedHabits.map((habit) => (
            <Reorder.Item key={habit.id} value={habit} className="outline-none">
              <div className="bg-surface-1 border border-border-subtle p-3 rounded-xl flex items-center justify-between cursor-grab active:cursor-grabbing select-none">
                <span className="text-xs font-bold text-text-primary">
                  {habit.name}
                </span>
                <ArrowUpDown className="w-4 h-4 text-text-secondary" />
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sortedHabits.map((habit) => {
            const isLogged = loggedHabitIds.has(habit.id);
            const parentHabit = habit.dependsOn
              ? habits.find((h) => h.id === habit.dependsOn)
              : null;
            const isLocked = parentHabit
              ? !loggedHabitIds.has(parentHabit.id)
              : false;

            return (
              <HabitCard
                key={habit.id}
                habit={habit}
                isLogged={isLogged}
                isRecommended={
                  habit.energyDemand === recommendedDemand && !isLogged
                }
                isLocked={isLocked}
                parentName={parentHabit?.name}
                particles={particles[habit.id] ?? []}
                onToggle={() => toggleHabitLog(habit.id)}
              />
            );
          })}
        </div>
      )}

      {/*
        key 里带上「开关状态 + 习惯 id」：打开、切换习惯、再次打开都会换 key，
        组件直接重挂载，表单回到初始值。
        这替代了组件内部那个「isOpen 变化就把 9 个 state 重置一遍」的 useEffect
        —— 那种写法每开一次多渲染一轮，且漏写一个字段就会把上次的输入带进这次。
      */}
      <SpecializedRecordModal
        key={`${activeSpecializedHabit?.id ?? "none"}-${isSpecializedOpen}`}
        isOpen={isSpecializedOpen}
        onClose={() => {
          setIsSpecializedOpen(false);
          setActiveSpecializedHabit(null);
        }}
        habit={activeSpecializedHabit}
        onSave={handleSaveSpecializedLog}
      />
    </section>
  );
}
