/**
 * 周复盘（纯函数，可单测）
 *
 * 手册 4.2 的原话：周日 15 分钟，只问三件事。这里的实现守住两条：
 *
 * 1. **周复盘不允许 AI 给结论，只允许 AI 基于数据提问。**
 *    所以本文件里所有「聪明」的函数返回的都是疑问句，没有一个返回
 *    「你这周做得不错」「建议你减少新卡」这类判断。判断权必须留在人手里，
 *    否则复盘会退化成看成绩单——看成绩单不会改变行为，只会改变心情。
 *
 * 2. **第三问只允许一个变量。**
 *    多填就是没有重点。这不是文案约束，是数据结构上的约束：
 *    `oneChange` 是字符串，不是数组。
 */

import type { WeeklyReview } from "./types";
import { toDayKey } from "./attendance.ts";

const DAY_MS = 86_400_000;

/** 固定三问。顺序即思考顺序：先认账，再拆穿，最后做减法。 */
export const WEEKLY_PROMPTS = [
  {
    id: "effective" as const,
    title: "这一周，哪一步我真的做到了？",
    hint: "写具体的动作和时刻，不写「有在学」。",
  },
  {
    id: "pseudoWork" as const,
    title: "哪一步是伪努力？",
    hint: "看了但没提取、收藏但没复习、制卡但没输出——挑一个说清楚。",
  },
  {
    id: "oneChange" as const,
    title: "下周只改哪一个变量？",
    hint: "只能一个。两个就是没有重点。",
  },
];

/** 该时间戳所在周的周一（本地时区），返回 YYYY-MM-DD */
export function weekStartOf(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  // getDay(): 周日 = 0。换算成「距本周一几天」：周一 → 0，周日 → 6
  const offset = (d.getDay() + 6) % 7;
  const monday = new Date(d.getTime() - offset * DAY_MS);
  return toDayKey(monday.getTime());
}

/** 该周周日（含）的 YYYY-MM-DD */
export function weekEndOf(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  return toDayKey(start.getTime() + 6 * DAY_MS);
}

/** 「10/20 – 10/26」——给标题用，年份只在跨年时补 */
export function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const crossYear = start.getFullYear() !== end.getFullYear();
  return crossYear
    ? `${start.getFullYear()}/${fmt(start)} – ${end.getFullYear()}/${fmt(end)}`
    : `${fmt(start)} – ${fmt(end)}`;
}

/** 判断某个时间戳是否落在给定周内 */
export function isInWeek(ts: number, weekStart: string): boolean {
  return weekStartOf(ts) === weekStart;
}

export interface WeekSources {
  /** 复习事件：at + 是否忘记 + 评分前间隔 */
  reviews: { at: number; lapsed: boolean; intervalBefore: number }[];
  /** 卡片创建时间 */
  cardCreatedAts: number[];
  /** 输出记录：创建时间 + 卡壳点数量 */
  outputs: { createdAt: number; stuckCount: number }[];
  /** 项目「难题—解法」记录时间 */
  pitfallAts: number[];
  /** 出勤日集合（YYYY-MM-DD） */
  activeDays: Set<string>;
}

export interface WeekSnapshot {
  weekStart: string;
  weekEnd: string;
  reviewCount: number;
  /** 点了「忘记」的次数 */
  lapseCount: number;
  /** 本周新引入的卡数（评分前间隔为 0 即视为新卡首次出现） */
  newIntroduced: number;
  /** 本周新建的卡数（制卡动作，不等于学过） */
  cardCreated: number;
  outputCount: number;
  stuckCount: number;
  pitfallCount: number;
  /** 本周出勤天数（0–7） */
  activeDays: number;
}

/**
 * 汇总一周的数据。
 *
 * 只做计数，不做率、不做评价。「忘记率 43%」这种东西看着专业，
 * 但它会让人立刻想解释，而不是想改。真正的率只在提问里出现，
 * 且必须带上「是卡的问题还是状态的问题」这个二选一。
 */
export function buildWeekSnapshot(
  sources: WeekSources,
  weekStart: string,
): WeekSnapshot {
  const inWeek = (ts: number) => isInWeek(ts, weekStart);

  const reviews = sources.reviews.filter((r) => inWeek(r.at));
  const weekEnd = weekEndOf(weekStart);

  let activeDays = 0;
  for (const day of sources.activeDays) {
    if (day >= weekStart && day <= weekEnd) activeDays += 1;
  }

  return {
    weekStart,
    weekEnd,
    reviewCount: reviews.length,
    lapseCount: reviews.filter((r) => r.lapsed).length,
    newIntroduced: reviews.filter((r) => r.intervalBefore === 0).length,
    cardCreated: sources.cardCreatedAts.filter(inWeek).length,
    outputCount: sources.outputs.filter((o) => inWeek(o.createdAt)).length,
    stuckCount: sources.outputs
      .filter((o) => inWeek(o.createdAt))
      .reduce((sum, o) => sum + o.stuckCount, 0),
    pitfallCount: sources.pitfallAts.filter(inWeek).length,
    activeDays,
  };
}

export interface WeeklyQuestion {
  id: string;
  text: string;
}

/**
 * 基于数据生成提问（不是结论）。
 *
 * 每个分支都刻意留了「还是……」的半句：把归因的两个方向都摆出来，
 * 用户才有得选。只问「为什么这周这么差」的复盘，人只会防御。
 *
 * 返回 0–2 条。太多问题等于没问。
 */
export function buildDataQuestions(snapshot: WeekSnapshot): WeeklyQuestion[] {
  const questions: WeeklyQuestion[] = [];
  const { reviewCount, lapseCount, cardCreated, outputCount, stuckCount, activeDays } =
    snapshot;

  // 建卡很勤但从不输出：最常见的伪努力形态
  if (cardCreated >= 4 && outputCount === 0) {
    questions.push({
      id: "hoarding",
      text: `这周新建了 ${cardCreated} 张卡，输出 0 次。建卡那一刻你在想什么？`,
    });
  }

  // 一次都没复习
  if (reviewCount === 0 && cardCreated > 0) {
    questions.push({
      id: "no-review",
      text: "这周没有一次复习。是没打开，还是打开之后关掉了？",
    });
  }

  // 忘记扎堆
  if (reviewCount >= 5 && lapseCount / reviewCount >= 0.4) {
    questions.push({
      id: "lapse",
      text: `${reviewCount} 次复习里 ${lapseCount} 次点了「忘记」。是卡写得太细，还是复习时状态不对？`,
    });
  }

  // 标了卡壳但没补卡
  if (stuckCount > 0 && outputCount > 0) {
    questions.push({
      id: "stuck-unsolved",
      text: `你在输出里标了 ${stuckCount} 处卡壳。有几处后来真补成卡了？`,
    });
  }

  // 几乎没来
  if (activeDays <= 2 && (cardCreated > 0 || reviewCount > 0)) {
    questions.push({
      id: "low-attendance",
      text: `这周你只来了 ${activeDays} 天。哪一天最容易开始？那天发生了什么？`,
    });
  }

  return questions.slice(0, 2);
}

export interface WeeklyReviewDraft {
  effective: string;
  pseudoWork: string;
  oneChange: string;
}

export interface WeeklyReviewCheck {
  ok: boolean;
  /** 第一、二问的最少字数（写「无」也要写一个词） */
  missing: ("effective" | "pseudoWork" | "oneChange")[];
  /** 第三问是否出现了「和」「还有」「以及」这类并列词——那说明不止一个变量 */
  multipleChanges: boolean;
}

const MIN_ANSWER_CHARS = 6;

/**
 * 检查周复盘是否填完。
 *
 * 第三问额外做一次「并列词」检测：不是强制拦截，只是提醒。
 * 因为「早睡 + 每天一张卡」这种答案，真实效果是两件都不做。
 */
export function checkWeeklyDraft(draft: WeeklyReviewDraft): WeeklyReviewCheck {
  const missing: WeeklyReviewCheck["missing"] = [];
  if (draft.effective.trim().length < MIN_ANSWER_CHARS) missing.push("effective");
  if (draft.pseudoWork.trim().length < MIN_ANSWER_CHARS) missing.push("pseudoWork");
  if (!draft.oneChange.trim()) missing.push("oneChange");

  const multipleChanges = /[+＋]|以及|还有|同时|并且/.test(draft.oneChange);

  return { ok: missing.length === 0, missing, multipleChanges };
}

/** 补齐一条周复盘记录的骨架（id 由调用方给，便于测试） */
export function createWeeklyReview(
  weekStart: string,
  draft: WeeklyReviewDraft,
  id: string,
  now: number = Date.now(),
): WeeklyReview {
  return {
    id,
    weekStart,
    effective: draft.effective.trim(),
    pseudoWork: draft.pseudoWork.trim(),
    oneChange: draft.oneChange.trim(),
    createdAt: now,
  };
}

/** 该周的复盘是否已经写过（用于决定「本周复盘」按钮的文案） */
export function findReviewForWeek(
  reviews: WeeklyReview[],
  weekStart: string,
): WeeklyReview | undefined {
  return reviews.find((r) => r.weekStart === weekStart);
}
