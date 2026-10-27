'use client';

/**
 * 今日（Phase 1 的新首屏）
 *
 * 结构只有一层：门禁 + 四张往下的卡。
 *
 *   ┌── 今日门禁：今天有几张、一个按钮、断了不补 ──┐
 *   │                                              │
 *   ├── 意图（可选，默认折叠/一行）                  │
 *   ├── 习惯（第二屏，滚动可见）                     │
 *   ├── AI 排程（默认折叠）                         │
 *   └── 晚间复盘（默认折叠）                        │
 *
 * 和老 DashboardView 的关键差别：**打开即知道该做什么**。
 * 老版本要依次过 WOOP 强弹窗 → 能量 → 习惯矩阵 → AI 任务 → 待复习 → 复盘，
 * 六次决策之后才碰到第一张卡。这里是一次点击。
 */

import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, upsertDailyRecord } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import { buildTodayGate } from '@/lib/learning/gate';
import {
  buildAttendanceWindow,
  collectActiveDays,
} from '@/lib/learning/attendance';
import { useDailyQueue } from '@/lib/learning/use-daily-queue';
import {
  updateLearningSettings,
  useLearningSettings,
} from '@/lib/learning/settings';
import TaskGate from './TaskGate';
import WoopCard from './WoopCard';
import EnergySlider from './EnergySlider';
import HabitGrid from './HabitGrid';
import AiTasksPanel from './AiTasksPanel';
import NightReflection from './NightReflection';
import FocusPanel from './FocusPanel';

interface TodayViewProps {
  isWoopModalOpen: boolean;
  setIsWoopModalOpen: (open: boolean) => void;
}

export default function TodayView({
  isWoopModalOpen,
  setIsWoopModalOpen,
}: TodayViewProps) {
  const { currentDate, setActiveTab, startReview } = useAppStore();

  // 队列口径与复习页共用一份实现，见 use-daily-queue.ts
  const { queue, cards, events, newLimit, ready } = useDailyQueue();

  const settings = useLearningSettings();
  const habits = useLiveQuery(() => db.habits.toArray());
  const todayLogs = useLiveQuery(
    () => db.habitLogs.where({ date: currentDate }).toArray(),
    [currentDate],
  );
  const todayRecord = useLiveQuery(
    () => db.dailyRecords.get(currentDate),
    [currentDate],
  );
  const allHabitLogs = useLiveQuery(() => db.habitLogs.toArray());
  const allRecords = useLiveQuery(() => db.dailyRecords.toArray());

  /**
   * 能量：用「本地覆盖 + 库里回填」派生，不用 effect 同步。
   * 用户拖动时立刻写覆盖值并落库；未拖动时显示当天记录。
   * 这样既没有 effect 级联渲染，也不会出现「记录回写把滑块弹回去」。
   */
  const [energyOverride, setEnergyOverride] = useState<number | null>(null);
  const energy = energyOverride ?? todayRecord?.energyLevel ?? 5;

  const handleEnergyChange = async (value: number) => {
    setEnergyOverride(value);
    await upsertDailyRecord(currentDate, { energyLevel: value });
  };

  const gate = useMemo(
    () =>
      buildTodayGate(queue, {
        hasAnyCards: (cards?.length ?? 0) > 0,
        newLimit,
      }),
    [queue, cards?.length, newLimit],
  );

  const attendance = useMemo(() => {
    const active = collectActiveDays({
      habitDates: (allHabitLogs ?? []).map((l) => l.date),
      dailyRecords: allRecords ?? [],
      reviewEventAts: (events ?? []).map((e) => e.at),
    });
    return buildAttendanceWindow(active, { days: 30 });
  }, [allHabitLogs, allRecords, events]);

  const handlePrimary = () => {
    // 有卡就进复习，没卡就去制卡。没有第三条路——
    // 首屏按下去必须有结果，不能是「点了没反应」。
    if (gate.action !== 'review') {
      setActiveTab('brain');
      return;
    }
    // 按钮写的是「先复习一张」，所以进复习页时带上「只复习一张」的意图。
    // 直接用 setActiveTab('review') 等于默认整队，落地页会立刻摆出
    // 「0 / 2」的进度——一句话之内就自相矛盾。
    startReview('one');
  };

  const dateLabel = useMemo(() => {
    // 加 T00:00:00 是为了按**本地时区**解析；直接 new Date("2026-10-26")
    // 会按 UTC 解析，在负时区会把日期显示成前一天。
    return new Date(`${currentDate}T00:00:00`).toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  }, [currentDate]);

  const isLoading = !ready;

  return (
    <div className="page-scroll">
      <div className="page-shell space-y-4">
        {/* 页面头：六个页面同一个形状——眉标 / 标题 /（可选）说明 / 右侧操作。
            之前这里只有一句 14px 的「今日」+ 一行日期，和输出、设置的 24/30px
            标题放在一起像是两个产品。 */}
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow" suppressHydrationWarning>
              Today · {dateLabel}
            </p>
            <h1 className="page-title mt-1">今日</h1>
          </div>
          <EnergySlider energy={energy} onChange={handleEnergyChange} />
        </header>

        {isLoading ? (
          <div className="surface-card p-8 space-y-4">
            <div className="h-3 w-24 bg-surface-3 rounded animate-pulse" />
            <div className="h-8 w-2/3 bg-surface-3 rounded animate-pulse" />
            <div className="h-12 w-full bg-surface-3 rounded-xl animate-pulse" />
          </div>
        ) : (
          <TaskGate
            gate={gate}
            activeDays30={attendance.activeDays}
            onPrimary={handlePrimary}
          />
        )}

        <WoopCard
          record={todayRecord}
          currentDate={currentDate}
          isModalOpen={isWoopModalOpen}
          setModalOpen={setIsWoopModalOpen}
          settings={settings}
          onFirstPromptHandled={() => {
            void updateLearningSettings({ woopPromptedOnce: true });
          }}
        />

        <HabitGrid
          habits={habits ?? []}
          todayLogs={todayLogs ?? []}
          currentDate={currentDate}
          energy={energy}
        />

        <div className="grid grid-cols-1 gap-3">
          <AiTasksPanel
            record={todayRecord}
            currentDate={currentDate}
            energy={energy}
            habits={habits ?? []}
          />
          <NightReflection
            record={todayRecord}
            currentDate={currentDate}
            energy={energy}
            habits={habits ?? []}
            todayLogs={todayLogs ?? []}
            dueCount={queue.due.length}
          />
          {/* 番茄钟从一级 tab 降级到这里：它是工具，不是目的地 */}
          <FocusPanel />
        </div>
      </div>
    </div>
  );
}
