'use client';

/**
 * AI 每日任务排程（从 DashboardView 拆出 + 折叠）
 *
 * 改造前：它是首屏右栏的常驻大卡，外加一个「生成今日排程」的蓝按钮，
 * 用户一进来就会先点它——等于把「决定做什么」外包给模型，
 * 而手册的核心是「自己提取」。
 *
 * 改造后：默认折叠成一行，只在用户主动展开时才出现，且不主动索取注意力。
 * 逻辑（生成 / 勾选 / 落库）与老实现保持一致，只是换了容器。
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, RefreshCw, ChevronDown } from 'lucide-react';
import { upsertDailyRecord, db, type DailyRecord, type Habit } from '@/lib/db';
import { apiFetch } from '@/lib/api';

interface AiTasksPanelProps {
  record: DailyRecord | undefined;
  currentDate: string;
  energy: number;
  habits: Habit[];
}

interface TaskParticle {
  id: number;
  angle: number;
  speed: number;
  color: string;
}

/** /api/generate-tasks 返回的任务形状（不含本地状态字段） */
interface GeneratedTask {
  id: string;
  name: string;
  reason: string;
  energyDemand: 'high' | 'medium' | 'low';
}

export default function AiTasksPanel({
  record,
  currentDate,
  energy,
  habits,
}: AiTasksPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [particles, setParticles] = useState<Record<string, TaskParticle[]>>({});

  const tasks = record?.aiTasks ?? [];
  const doneCount = tasks.filter((t) => t.isCompleted).length;

  const getPast7DaysStats = async () => {
    const last7Days: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      last7Days.push(`${year}-${month}-${date}`);
    }
    const logs = await db.habitLogs.where('date').anyOf(last7Days).toArray();
    return habits.map((habit) => {
      const count = logs.filter((l) => l.habitId === habit.id).length;
      return {
        habitId: habit.id,
        name: habit.name,
        completedCount: count,
        totalCount: 7,
        rate: count / 7,
      };
    });
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const historyStats = await getPast7DaysStats();
      const res = await apiFetch('/api/generate-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          energy,
          woopWish: record?.woopWish || '',
          woopPlan: record?.woopPlan || '',
          historyStats,
        }),
      });
      if (!res.ok) throw new Error('生成失败');
      const data = (await res.json()) as { tasks: GeneratedTask[] };
      await upsertDailyRecord(currentDate, {
        aiTasks: data.tasks.map((t) => ({ ...t, isCompleted: false })),
        aiTasksGeneratedAt: new Date(),
      });
    } catch (e) {
      console.error(e);
      alert('排程生成失败，可重试或直接做卡。');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTask = async (taskId: string) => {
    if (!record?.aiTasks) return;
    const updated = record.aiTasks.map((t) => {
      if (t.id !== taskId) return t;
      const next = !t.isCompleted;
      if (next) {
        const colors = ['#3b82f6', '#60a5fa', '#1DB954', '#10b981'];
        const newParticles = Array.from({ length: 12 }).map((_, idx) => ({
          id: idx,
          angle: (idx / 12) * Math.PI * 2,
          speed: 4 + Math.random() * 5,
          color: colors[Math.floor(Math.random() * colors.length)],
        }));
        setParticles((prev) => ({ ...prev, [taskId]: newParticles }));
        setTimeout(() => {
          setParticles((prev) => {
            const copy = { ...prev };
            delete copy[taskId];
            return copy;
          });
        }, 1000);
      }
      return {
        ...t,
        isCompleted: next,
        completedAt: next ? new Date() : undefined,
      };
    });
    await upsertDailyRecord(currentDate, { aiTasks: updated });
  };

  return (
    <section className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between h-12 px-4 text-left hover:bg-surface-2/40 transition-colors"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
          <Sparkles className="w-3.5 h-3.5 text-ai-blue" />
          今日排程
          {tasks.length > 0 && (
            <span className="text-[10px] font-mono text-text-secondary/70">
              {doneCount}/{tasks.length}
            </span>
          )}
          {tasks.length === 0 && (
            <span className="text-[10px] font-mono text-text-secondary/50">
              选填
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border-subtle/60 pt-3">
              {isGenerating ? (
                <div className="space-y-2">
                  <div className="h-3.5 bg-surface-3 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-surface-3 rounded animate-pulse w-full" />
                  <p className="text-[10px] text-text-secondary font-mono">
                    基于近 7 天打卡趋势生成中…
                  </p>
                </div>
              ) : tasks.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => toggleTask(task.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          task.isCompleted
                            ? 'border-primary/20 opacity-55 bg-surface-2/20'
                            : 'border-border-subtle hover:border-ai-blue/50 bg-surface-2/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded uppercase ${
                                  task.energyDemand === 'high'
                                    ? 'bg-error/15 text-error'
                                    : task.energyDemand === 'medium'
                                      ? 'bg-amber-500/15 text-amber-500'
                                      : 'bg-primary/15 text-primary'
                                }`}
                              >
                                {task.energyDemand}
                              </span>
                              <p
                                className={`text-xs font-semibold text-text-primary ${task.isCompleted ? 'line-through text-text-secondary' : ''}`}
                              >
                                {task.name}
                              </p>
                            </div>
                            <p className="text-[10px] text-text-secondary mt-1 leading-relaxed">
                              {task.reason}
                            </p>
                          </div>
                          <div className="relative w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                            {particles[task.id]?.map((p) => (
                              <motion.div
                                key={p.id}
                                className="absolute w-1 h-1 rounded-full pointer-events-none"
                                style={{ backgroundColor: p.color }}
                                animate={{
                                  x: Math.cos(p.angle) * p.speed * 3.5,
                                  y: Math.sin(p.angle) * p.speed * 3.5,
                                  opacity: [1, 1, 0],
                                }}
                                transition={{ duration: 0.8 }}
                              />
                            ))}
                            <div
                              className={`w-full h-full rounded-full border flex items-center justify-center ${
                                task.isCompleted
                                  ? 'bg-primary border-primary text-primary-text'
                                  : 'border-muted-gray'
                              }`}
                            >
                              {task.isCompleted && (
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="btn btn-xs btn-ghost !h-6 !px-1.5 gap-1 font-mono"
                  >
                    <RefreshCw className="w-3 h-3" /> 重新编排
                  </button>
                </>
              ) : (
                <div className="space-y-3 py-1">
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    按今日能量与近 7 天趋势排几件事。
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="btn btn-md btn-ai w-full"
                  >
                    生成今日排程
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
