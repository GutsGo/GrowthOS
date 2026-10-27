/**
 * 每日队列构建（纯函数）
 *
 * 解决的是手册里第 3 号弃坑机制：「一次做几百张新卡，队列堆爆直接弃坑」。
 * 对策只有一句——**新卡限量**。所以队列不是「所有到期的一起上」，
 * 而是「到期卡全给 + 新卡按配额放行，其余顺延」。
 *
 * 两条工程约定：
 * 1. 新卡与到期卡严格分流。新卡的 nextReview 天然等于创建时间，如果不单独判定，
 *    它会一辈子混在到期队列里，配额就形同虚设。
 * 2. 排队顺序：到期卡按到期时间升序（欠最久的先还），新卡按创建时间升序（先建先学，
 *    避免「新写的卡插队」导致老卡永远学不到）。
 *
 * 本文件零运行时依赖，可独立单测。
 */

import type { CardType, ReviewState } from "./types";

/** 每日新卡默认上限。手册建议首周 1–2 张。 */
export const DEFAULT_NEW_CARD_LIMIT = 2;

/** 上限护栏：防止设置页输入 200 之类的数字把队列一次性打爆。 */
export const MAX_NEW_CARD_LIMIT = 20;

export interface QueueCard {
  id: string;
  state: ReviewState;
  type?: CardType;
  /** 卡片标签。交错练习在「类型不足以区分」时拿它当分组键（取字典序第一个） */
  tags?: readonly string[];
  /** 卡片创建时间（epoch ms），用于新卡排序 */
  createdAt: number;
}

export interface DailyQueueOptions {
  /** 判定「到期」的时刻，默认当前时间 */
  now?: number;
  /** 每日新卡上限，默认 DEFAULT_NEW_CARD_LIMIT */
  newLimit?: number;
  /** 今天已经引入过的新卡数（例如上午已经学了 1 张），会从配额里扣掉 */
  newIntroducedToday?: number;
}

export interface DailyQueue {
  /** 到期卡，按到期时间升序 */
  due: QueueCard[];
  /** 本次放行的新卡，已按配额截断 */
  fresh: QueueCard[];
  /** 到期 + 新卡总数，用于「打开就是今天的最小任务」的计数 */
  total: number;
  /** 今日剩余新卡配额 */
  newQuota: number;
  /** 因超配额被顺延的新卡数（不是丢弃，明天还会在） */
  deferredNew: number;
}

/**
 * 是不是一张「从未复习过」的新卡。
 *
 * 判定用 repetitions === 0 且 interval === 0，而不是「没有复习记录」——
 * 因为「忘记」会把 repetitions 归零、但 interval 变成 1，
 * 那种卡是「复习过的熟面孔」，必须继续留在到期队列里，不能当成新卡重复放行。
 */
export function isNewCardState(state: ReviewState): boolean {
  return state.repetitions <= 0 && state.interval <= 0;
}

export function clampNewCardLimit(limit: unknown): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_NEW_CARD_LIMIT;
  }
  return Math.min(MAX_NEW_CARD_LIMIT, Math.max(0, Math.floor(limit)));
}

/**
 * 构建今日队列。
 *
 * @example
 * // 3 张到期 + 5 张新卡，配额 2：
 * // → due 长度 3，fresh 长度 2，deferredNew 为 3
 */
export function buildDailyQueue(
  cards: readonly QueueCard[],
  options: DailyQueueOptions = {},
): DailyQueue {
  const now = options.now ?? Date.now();
  const limit = clampNewCardLimit(options.newLimit ?? DEFAULT_NEW_CARD_LIMIT);
  const introduced = Math.max(
    0,
    Math.floor(options.newIntroducedToday ?? 0),
  );
  const newQuota = Math.max(0, limit - introduced);

  const due: QueueCard[] = [];
  const freshCandidates: QueueCard[] = [];

  for (const card of cards) {
    if (isNewCardState(card.state)) {
      freshCandidates.push(card);
    } else if (card.state.due <= now) {
      due.push(card);
    }
  }

  due.sort((a, b) => a.state.due - b.state.due || a.id.localeCompare(b.id));
  freshCandidates.sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );

  const fresh = freshCandidates.slice(0, newQuota);

  return {
    due,
    fresh,
    total: due.length + fresh.length,
    newQuota,
    deferredNew: freshCandidates.length - fresh.length,
  };
}

/** 本地时区的 YYYY-MM-DD。不要用 toISOString()，那是 UTC，跨零点会算错天。 */
export function dayKey(input: number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 统计某一天创建了多少张卡——用于给「今日新卡配额」扣减。 */
export function countCardsCreatedOn(
  cards: readonly { createdAt: number }[],
  key: string,
): number {
  let count = 0;
  for (const card of cards) {
    if (dayKey(card.createdAt) === key) count += 1;
  }
  return count;
}
