'use client';

/**
 * 周复盘
 *
 * 三个固定问题，一屏问完。规则只有一条：
 * **AI 只提问，不给结论。**
 *
 * 所以这一屏除了这三个问题，其余全是疑问句——由本周数据生成，
 * 且每条都把「是 A 还是 B」两个方向都摆出来。只问「为什么这周这么差」的复盘，
 * 人的反应一定是防御，防御之后什么都不会改。
 */

import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, HelpCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import { collectActiveDays } from '@/lib/learning/attendance';
import {
  WEEKLY_PROMPTS,
  buildDataQuestions,
  buildWeekSnapshot,
  checkWeeklyDraft,
  createWeeklyReview,
  findReviewForWeek,
  weekLabel,
  weekStartOf,
  type WeekSnapshot,
  type WeeklyQuestion,
} from '@/lib/learning/weekly';
import type { WeeklyReview } from '@/lib/learning/types';

export default function WeeklyReviewPanel() {
  const currentDate = useAppStore((state) => state.currentDate);

  const reviews = useLiveQuery(() => db.weeklyReviews.toArray());
  const events = useLiveQuery(() => db.reviewEvents.toArray());
  const cards = useLiveQuery(() => db.cards.toArray());
  const outputs = useLiveQuery(() => db.feynmanRecords.toArray());
  const projects = useLiveQuery(() => db.projects.toArray());
  const habitLogs = useLiveQuery(() => db.habitLogs.toArray());
  const dailyRecords = useLiveQuery(() => db.dailyRecords.toArray());

  /** 用 store 里的 currentDate 推周一，而不是渲染期取 Date.now()（保持渲染纯） */
  const weekStart = useMemo(
    () => weekStartOf(new Date(`${currentDate}T12:00:00`).getTime()),
    [currentDate],
  );

  const snapshot: WeekSnapshot = useMemo(
    () =>
      buildWeekSnapshot(
        {
          reviews: (events ?? []).map((e) => ({
            at: e.at,
            lapsed: e.lapsed,
            intervalBefore: e.intervalBefore,
          })),
          cardCreatedAts: (cards ?? []).map((c) => new Date(c.createdAt).getTime()),
          outputs: (outputs ?? []).map((o) => ({
            createdAt: new Date(o.createdAt).getTime(),
            stuckCount: o.stuckPoints?.length ?? 0,
          })),
          pitfallAts: (projects ?? []).flatMap((p) =>
            p.pitfalls.map((pitfall) => pitfall.at),
          ),
          activeDays: collectActiveDays({
            habitDates: (habitLogs ?? []).map((l) => l.date),
            dailyRecords: dailyRecords ?? [],
            reviewEventAts: (events ?? []).map((e) => e.at),
          }),
        },
        weekStart,
      ),
    [events, cards, outputs, projects, habitLogs, dailyRecords, weekStart],
  );

  const questions = useMemo(() => buildDataQuestions(snapshot), [snapshot]);
  const existing = useMemo(
    () => findReviewForWeek(reviews ?? [], weekStart),
    [reviews, weekStart],
  );
  const history = useMemo(
    () =>
      [...(reviews ?? [])]
        .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
        .slice(0, 6),
    [reviews],
  );

  const ready = reviews !== undefined && events !== undefined;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-heading">
          周复盘
        </h2>
        <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
          {weekLabel(weekStart)} · 15 分钟，三个问题。
          <span className="text-neutral-gray"> 前两问认账，第三问做减法。</span>
        </p>
      </div>

      {/* 数据提问（永远不出现结论） */}
      {questions.length > 0 && (
        <div className="surface-card !border-ai-blue/30 p-4 space-y-2">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-ai-blue" />
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-ai-blue">
              这周的数据在问
            </span>
          </div>
          {questions.map((q: WeeklyQuestion) => (
            <p
              key={q.id}
              className="text-[12px] text-text-primary leading-relaxed pl-5"
            >
              {q.text}
            </p>
          ))}
        </div>
      )}

      {/* 数据概览：只放事实，不放评价 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="复习" value={snapshot.reviewCount} unit="次" />
        <Stat label="新卡" value={snapshot.cardCreated} unit="张" />
        <Stat label="输出" value={snapshot.outputCount} unit="次" />
        <Stat label="来了" value={snapshot.activeDays} unit="天" />
      </div>

      {!ready ? (
        <div className="surface-card h-40 animate-pulse" />
      ) : (
        <WeeklyForm
          key={existing?.id ?? weekStart}
          weekStart={weekStart}
          existing={existing}
        />
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-secondary px-1">
            往期 · 只改了一个变量吗
          </h3>
          {history.map((record) => (
            <div
              key={record.id}
              className="surface-card px-3.5 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-mono text-neutral-gray">
                  {weekLabel(record.weekStart)}
                </span>
                <span className="text-[11px] font-bold text-primary truncate">
                  {record.oneChange}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
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
    <div className="surface-card px-3 py-2.5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-neutral-gray">
        {label}
      </p>
      <p className="text-lg font-extrabold font-mono text-text-primary leading-tight">
        {value}
        <span className="text-[10px] font-normal text-text-secondary ml-1">
          {unit}
        </span>
      </p>
    </div>
  );
}

interface WeeklyFormProps {
  weekStart: string;
  existing?: WeeklyReview;
}

/**
 * 表单状态只在挂载时从 existing 读一次（靠 key 强制重挂载）。
 * 不用 effect 回填：effect 回填会在用户打字打到一半时把他敲的字冲掉。
 */
function WeeklyForm({ weekStart, existing }: WeeklyFormProps) {
  const [effective, setEffective] = useState(existing?.effective ?? '');
  const [pseudoWork, setPseudoWork] = useState(existing?.pseudoWork ?? '');
  const [oneChange, setOneChange] = useState(existing?.oneChange ?? '');
  const [saved, setSaved] = useState(Boolean(existing));

  const check = checkWeeklyDraft({ effective, pseudoWork, oneChange });

  const values: Record<string, string> = { effective, pseudoWork, oneChange };
  const setters: Record<string, (v: string) => void> = {
    effective: setEffective,
    pseudoWork: setPseudoWork,
    oneChange: setOneChange,
  };

  const save = async () => {
    const record = createWeeklyReview(
      weekStart,
      { effective, pseudoWork, oneChange },
      existing?.id ?? crypto.randomUUID(),
    );
    await db.weeklyReviews.put(record);
    setSaved(true);
  };

  return (
    <div className="surface-card p-4 md:p-5 space-y-4">
      {WEEKLY_PROMPTS.map((prompt, index) => (
        <div key={prompt.id} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-neutral-gray">
              0{index + 1}
            </span>
            <label className="text-[12px] font-bold text-text-primary">
              {prompt.title}
            </label>
          </div>
          <textarea
            value={values[prompt.id]}
            onChange={(e) => setters[prompt.id](e.target.value)}
            rows={prompt.id === 'oneChange' ? 1 : 2}
            placeholder={prompt.hint}
            className="field field-area !min-h-[76px] !text-[12px] leading-relaxed"
          />
          {prompt.id === 'oneChange' && check.multipleChanges && (
            <p className="text-[10px] text-amber-400 leading-relaxed">
              不止一个变量。两个一起改，通常两个都不成。
            </p>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between gap-4 pt-1 border-t border-border-subtle/60">
        <p className="text-[10px] text-neutral-gray leading-relaxed">
          {saved ? '已保存' : '可以先存，但别只写第一问。'}
        </p>
        <button
          onClick={save}
          disabled={!check.ok}
          className="btn btn-md btn-primary shrink-0"
        >
          <CalendarCheck className="w-3.5 h-3.5" />
          {existing ? '更新本周复盘' : '存下这周的复盘'}
        </button>
      </div>
    </div>
  );
}
