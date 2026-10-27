'use client';

/**
 * 晚间复盘（从 DashboardView 拆出 + 折叠）
 *
 * 与老实现的区别只有两点：
 * 1. 默认折叠，不再在首屏占一整张卡（21:00 之后会把标题染成主色提醒一次）
 * 2. 去掉「严厉的 AI 灵魂教练」这种施压措辞——手册第 3 号弃坑机制就是「欠账感」，
 *    复盘的作用是收尾，不是审判。提问逻辑与落库字段完全保持原样。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ChevronDown, Check } from 'lucide-react';
import { upsertDailyRecord, type DailyRecord, type Habit, type HabitLog } from '@/lib/db';
import { apiFetch } from '@/lib/api';

interface NightReflectionProps {
  record: DailyRecord | undefined;
  currentDate: string;
  energy: number;
  habits: Habit[];
  todayLogs: HabitLog[];
  dueCount: number;
}

export default function NightReflection({
  record,
  currentDate,
  energy,
  habits,
  todayLogs,
  dueCount,
}: NightReflectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [isAfterReviewTime, setIsAfterReviewTime] = useState(false);

  const isDone = Boolean(record?.reviewCompletedAt);
  const loggedIds = useMemo(
    () => new Set(todayLogs.map((l) => l.habitId)),
    [todayLogs],
  );

  useEffect(() => {
    const check = () => setIsAfterReviewTime(new Date().getHours() >= 21);
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);

  const startReview = async () => {
    setIsOpen(true);
    setIsAnswering(true);
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: currentDate,
          woop: {
            wish: record?.woopWish || '',
            outcome: record?.woopOutcome || '',
            obstacle: record?.woopObstacle || '',
            plan: record?.woopPlan || '',
          },
          energy,
          habits: habits.map((h) => {
            const log = todayLogs.find((l) => l.habitId === h.id);
            return {
              name: h.name,
              logged: !!log,
              customData: log?.customData || null,
              customFormType: h.customFormType || 'none',
            };
          }),
          cardsCount: dueCount,
          aiTasks: record?.aiTasks || [],
        }),
      });
      if (!res.ok) throw new Error('获取复盘问题失败');
      const data = (await res.json()) as { questions: string[] };
      setQuestions(data.questions || []);
    } catch {
      // 本地降级：不依赖网络也能收尾
      const total = habits.length;
      const completed = habits.filter((h) => loggedIds.has(h.id)).length;
      const rate = total > 0 ? completed / total : 1;
      setQuestions([
        `今天习惯完成 ${completed}/${total}，能量 ${energy}/10。哪一步最费力？`,
        `今天学会的一个点是什么？一句话。`,
        rate === 1
          ? '状态不错。明天往前推哪一个？'
          : '明天先补哪一个？挑 2 分钟内能开始的。',
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const submit = async () => {
    if (answers.some((a) => !a.trim())) {
      alert('三个问题，各写一句。');
      return;
    }
    await upsertDailyRecord(currentDate, {
      reviewQuestions: questions,
      reviewAnswers: answers,
      reviewCompletedAt: new Date(),
    });
    setIsAnswering(false);
    setIsOpen(false);
    setAnswers(['', '', '']);
  };

  const badge = isDone ? (
    <span className="text-[10px] bg-primary/15 text-primary font-bold px-2 py-0.5 rounded-full">
      已写
    </span>
  ) : isAfterReviewTime ? (
    <span className="text-[10px] bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full">
      可以写了
    </span>
  ) : (
    <span className="text-[10px] text-text-secondary/60 font-mono">21:00 后</span>
  );

  return (
    <section
      className={`surface-card overflow-hidden transition-colors ${
        isAfterReviewTime && !isDone
          ? '!border-primary/30'
          : ''
      }`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between h-12 px-4 text-left hover:bg-surface-2/40 transition-colors"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
          <Target className="w-3.5 h-3.5 text-primary" />
          晚间复盘
          {badge}
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
            <div className="px-4 pb-4 pt-3 border-t border-border-subtle/60 space-y-3">
              {isAnswering ? (
                isLoading ? (
                  <div className="space-y-2">
                    <div className="h-3.5 bg-surface-3 rounded animate-pulse w-3/4" />
                    <div className="h-3.5 bg-surface-3 rounded animate-pulse w-2/3" />
                    <p className="text-[10px] text-text-secondary font-mono">
                      按今天的数据挑问题…
                    </p>
                  </div>
                ) : (
                  <>
                    {questions.map((q, idx) => (
                      <div key={idx} className="space-y-1">
                        <p className="text-[11px] text-text-primary font-semibold leading-relaxed">
                          {idx + 1}. {q}
                        </p>
                        <textarea
                          rows={2}
                          value={answers[idx]}
                          onChange={(e) => {
                            const next = [...answers];
                            next[idx] = e.target.value;
                            setAnswers(next);
                          }}
                          placeholder="一句话就行"
                          className="field !h-[34px] resize-none"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={submit}
                        className="btn btn-md btn-primary flex-1"
                      >
                        收尾
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAnswering(false)}
                        className="btn btn-md btn-soft"
                      >
                        取消
                      </button>
                    </div>
                  </>
                )
              ) : isDone ? (
                <div className="space-y-2">
                  {record?.reviewQuestions?.map((q, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <p className="text-[10px] text-text-primary font-semibold">
                        {q}
                      </p>
                      <p className="text-[11px] text-text-secondary pl-2.5 border-l border-primary/30">
                        {record.reviewAnswers?.[idx]}
                      </p>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={startReview}
                    className="btn btn-xs btn-ghost !h-6 !px-1.5 gap-1 font-mono"
                  >
                    <Check className="w-3 h-3" /> 重写
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    三个问题，各写一句。
                  </p>
                  <button
                    type="button"
                    onClick={startReview}
                    className="btn btn-md btn-soft w-full"
                  >
                    开始写
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
