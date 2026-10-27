/**
 * 一次复习动作的完整产物（纯函数）
 *
 * 老代码里 `handleSM2Rating` 直接算完就 `db.cards.update`，有两个后果：
 *
 * 1. **没有留痕**。评完只知道「这张卡的 nextReview 变了」，
 *    不知道「哪天评的、评的哪一档、评之前间隔多少」。
 *    所以热力图只能拿 habitLogs 凑数，看不出复习频率。
 * 2. **算法和 IO 缠在一起**。想验证「困难档是否真的更短」只能开浏览器点。
 *
 * 这里把「算」和「写」分开：
 * - `buildReviewOutcome` 纯函数，给状态和档位，返回「该写回什么 + 该记什么事件」
 * - `review-store.ts` 负责落库（在同一个事务里写卡片和事件）
 *
 * 这样调度逻辑可以单测，落库逻辑只有一句话那么薄。
 */

import { applyRating, MS_PER_DAY } from "./sm2.ts";
import { toStoredPatch, type StoredReviewPatch } from "./adapters.ts";
import { dayKey } from "./queue.ts";
import { RATINGS, type Rating, type ReviewEvent, type ReviewState } from "./types.ts";

export interface ReviewOutcome {
  /** 写回 cards 表的复习字段 */
  patch: StoredReviewPatch;
  /** 追加到 reviewEvents 的事件 */
  event: ReviewEvent;
}

export interface BuildReviewInput {
  cardId: string;
  /** 评分前的状态，来自 fromStoredCard */
  before: ReviewState;
  rating: Rating;
  /** 评分时刻，默认现在。测试时显式传入 */
  now?: number;
  /** 事件 id，默认随机生成。测试时显式传入以保证可重复 */
  eventId?: string;
}

/**
 * 事件 id。
 *
 * 刻意不用自增整数：reviewEvents 是要跟着 Supabase 同步走的，
 * 两台设备各自自增必然撞车。时间戳 + 随机串碰撞概率可以忽略。
 */
export function createReviewEventId(now: number): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `rv-${now.toString(36)}-${rand}`;
}

/** 评分 → 「卡片补丁 + 复习事件」 */
export function buildReviewOutcome(input: BuildReviewInput): ReviewOutcome {
  const now = input.now ?? Date.now();
  const after = applyRating(input.before, input.rating, now);

  return {
    patch: toStoredPatch(after),
    event: {
      id: input.eventId ?? createReviewEventId(now),
      cardId: input.cardId,
      rating: input.rating,
      at: now,
      intervalBefore: after.intervalBefore,
      intervalAfter: after.interval,
      easeAfter: after.easeFactor,
      repetitionsAfter: after.repetitions,
      lapsed: after.lapsed,
    },
  };
}

export interface IntervalPreview {
  rating: Rating;
  /** 下次间隔（天） */
  days: number;
  /** 按钮上的短文案，如「明天」「4 天后」 */
  label: string;
}

/**
 * 四个档位各自会把下次复习推到多久。
 *
 * 用途：评分按钮上直接写「忘记·明天 / 困难·3 天后 / 良好·8 天后 / 简单·11 天后」。
 * 手册里最容易误解的一点就是「为什么下次是这个日子」，
 * 与其写一段说明，不如把答案印在按钮上。
 *
 * 顺带一个副作用：用户能亲眼看到「困难」确实比「良好」短，
 * 于是愿意诚实自评——而不是为了让卡早点消失去点「简单」。
 */
export function previewIntervals(
  state: ReviewState,
  now: number = Date.now(),
): IntervalPreview[] {
  return RATINGS.map((rating) => {
    const days = applyRating(state, rating, now).interval;
    return { rating, days, label: formatIntervalDays(days) };
  });
}

/** 把天数说成人话。超过一个月改用月，避免出现「97 天后」这种要心算的文案。 */
export function formatIntervalDays(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d <= 0) return "今天";
  if (d === 1) return "明天";
  if (d < 30) return `${d} 天后`;
  if (d < 365) {
    const months = Math.max(1, Math.round(d / 30));
    return `${months} 个月后`;
  }
  return "一年后";
}

/**
 * 今天已经「引入」了几张新卡。
 *
 * 口径：`intervalBefore === 0` 说明评分前这张卡从没被排过期，那它就是新卡。
 * 注意**不能**用 `lapsed` 排除——对着新卡点「忘记」也算今天见过它了，
 * 明天不该再占用一次配额。
 */
export function countNewIntroducedOn(
  events: readonly Pick<ReviewEvent, "at" | "intervalBefore">[],
  key: string,
): number {
  let count = 0;
  for (const e of events) {
    if (e.intervalBefore === 0 && dayKey(e.at) === key) count += 1;
  }
  return count;
}

/** 一次会话的小结，用于完成页。不读库、不读时钟，全部由事件推导。 */
export interface SessionSummary {
  /** 评过的卡数 */
  rated: number;
  /** 其中判为「忘记」的次数 */
  lapsed: number;
  /** 判为「简单」的次数 */
  easy: number;
  /** 本会话引入的新卡数 */
  introduced: number;
  /** 其中翻面前走过两轮考官的卡数 */
  examined: number;
}

export function summarizeSession(
  events: readonly Pick<
    ReviewEvent,
    "rating" | "intervalBefore" | "lapsed" | "exam"
  >[],
): SessionSummary {
  let lapsed = 0;
  let easy = 0;
  let introduced = 0;
  let examined = 0;

  for (const e of events) {
    if (e.lapsed) lapsed += 1;
    if (e.rating === 5) easy += 1;
    if (e.intervalBefore === 0) introduced += 1;
    if (e.exam && e.exam.length > 0) examined += 1;
  }

  return { rated: events.length, lapsed, easy, introduced, examined };
}

/** 从「现在」到某张卡到期还有多少毫秒。已到期返回负数。 */
export function msUntilDue(due: number, now: number = Date.now()): number {
  return due - now;
}

/** 复习页顶部那行「下次复习在 X」的文案 */
export function describeNextDue(due: number, now: number = Date.now()): string {
  const days = Math.ceil(msUntilDue(due, now) / MS_PER_DAY);
  if (days <= 0) return "已到期";
  return formatIntervalDays(days);
}
