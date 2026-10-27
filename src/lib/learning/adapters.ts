/**
 * 防腐层：存储字段 ↔ 领域状态
 *
 * 为什么不直接把 Card 的字段改名成 SM-2 规范名？
 * 因为 `ease / reps / interval / nextReview` 这三个名字已经被 FlowView、StatsView、
 * BrainView、db.ts 的索引声明、以及 Supabase 同步脚本同时引用。改名的收益是「好看」，
 * 成本是三个组件同时编译失败 + 一次全表迁移 + 同步冲突。不划算。
 *
 * 所以：存储层保持历史命名，领域层用规范命名，两者只在这一个文件里互相翻译。
 * 未来任何地方要读「一张卡的复习状态」，都走 fromStoredCard，不要再散落 `card.ease`。
 *
 * 本文件同样零运行时依赖，可独立单测。
 */

import type { CardType, ReviewState } from "./types";

/** 与 Dexie `cards` 表里复习相关字段的结构化约束（不依赖 db.ts，避免循环引用） */
export interface StoredReviewFields {
  ease: number;
  reps: number;
  interval: number;
  nextReview: Date | number | string;
}

/**
 * 把各种历史遗留的时间表示统一成 epoch 毫秒。
 *
 * 历史包袱来源：
 * - Dexie 正常写入的是 Date
 * - 早期 PWA 缓存/JSON 导入可能留下 ISO 字符串
 * - Supabase 同步回来的可能是数字或字符串
 * 任何一种都要能吃下去，解析失败则退回 fallback（而不是丢卡）。
 */
export function toEpochMs(value: unknown, fallback: number): number {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : fallback;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : fallback;
  }
  return fallback;
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export interface NormalizedCardPatch {
  ease: number;
  reps: number;
  interval: number;
  nextReview: Date;
  type: CardType;
  example: string;
}

/**
 * v3 → v4 数据回填：补齐缺失字段、修正脏类型。
 *
 * 幂等：对已经是 v4 形态的记录再跑一次，结果不变。这一点很关键——
 * Dexie 的 upgrade 在极端情况下可能重入，非幂等的迁移会把用户的间隔越改越乱。
 *
 * 入参刻意用 `unknown` 而不是精确类型：库里读出来的历史记录可能是任意残缺形态，
 * 迁移代码不能假设「数据是干净的」，否则一次脏数据就卡死整个升级。
 *
 * @param raw      库里读出来的原始记录（可能是任意残缺形态）
 * @param fallbackNow 时间字段彻底不可用时的兜底时间，默认当前时刻
 */
export function normalizeCardForV4(
  raw: {
    ease?: unknown;
    reps?: unknown;
    interval?: unknown;
    nextReview?: unknown;
    type?: unknown;
    example?: unknown;
  },
  fallbackNow: number = Date.now(),
): NormalizedCardPatch {
  // EF 只做「是不是一个能用的数字」的判断，**不做下限钳制**。
  // 钳制是 sm2.applyRating 的职责（单一事实来源），迁移阶段乱改 EF 会悄悄改掉历史排期。
  const ease =
    typeof raw.ease === "number" && Number.isFinite(raw.ease) && raw.ease > 0
      ? Math.round(raw.ease * 100) / 100
      : 2.5;

  const reps = toPositiveInt(raw.reps, 0);
  const interval = toPositiveInt(raw.interval, 0);

  // 历史上 interval=0 但 reps>0 的脏数据（理论上不该有）→ 视为新卡，避免排期错乱
  const repairedInterval = reps > 0 && interval === 0 ? 1 : interval;

  return {
    ease,
    reps,
    interval: repairedInterval,
    nextReview: new Date(
      toEpochMs(raw.nextReview, fallbackNow + repairedInterval * 86_400_000),
    ),
    type: isCardType(raw.type) ? raw.type : "concept",
    example: typeof raw.example === "string" ? raw.example : "",
  };
}

export function isCardType(value: unknown): value is CardType {
  return value === "concept" || value === "interview" || value === "mistake";
}

/** 存储记录 → 领域状态 */
export function fromStoredCard(
  card: StoredReviewFields,
  fallbackNow: number = Date.now(),
): ReviewState {
  const patch = normalizeCardForV4(card, fallbackNow);
  return {
    easeFactor: patch.ease,
    repetitions: patch.reps,
    interval: patch.interval,
    due: patch.nextReview.getTime(),
  };
}

/**
 * 写回存储时的补丁类型。
 *
 * 与 `StoredReviewFields` 的区别：那个是**读**的约束（宽容，允许历史遗留的
 * 字符串/数字时间），这个是**写**的约束（严格，nextReview 必须是 Date）。
 * 分开定义是为了让「读宽写严」这件事在类型上成立，而不是靠注释约定。
 */
export interface StoredReviewPatch {
  ease: number;
  reps: number;
  interval: number;
  nextReview: Date;
}

/** 领域状态 → 存储补丁（只包含复习字段，不动 front/back/tags） */
export function toStoredPatch(state: ReviewState): StoredReviewPatch {
  return {
    ease: Math.round(state.easeFactor * 100) / 100,
    reps: Math.max(0, Math.floor(state.repetitions)),
    interval: Math.max(0, Math.floor(state.interval)),
    nextReview: new Date(state.due),
  };
}
