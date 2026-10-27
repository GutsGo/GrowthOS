/**
 * 交错练习（interleaving）：把今天的卡排成「不连着刷同一种」
 *
 * 手册里六项方法中最容易被跳过的一项，因为它反直觉——
 * 块状练习（一次刷完所有概念卡）当场更顺、更有「学会了」的感觉，
 * 但一周后能想起来的是交错练的那批。
 *
 * 这里只做一件事：**决定「下一张是哪张」**。
 * 不改调度（interval 仍由 SM-2 决定）、不改配额（新卡上限仍由 queue.ts 决定），
 * 所以任何交错策略出问题，最坏结果只是顺序难看，不会丢卡、不会改变复习计划。
 *
 * 两条约束，优先级从高到低：
 *
 * 1. **不连着出现同一组**。分组键优先用 `card.type`（概念/面试题/错题），
 *    当这一批里类型不足以区分时（比如全站只有概念卡），回落到第一个 tag。
 *    两样都没有就原样返回——不打乱，也不假装打乱。
 * 2. **新卡均匀分布**。老的拼接方式是 `[...due, ...fresh]`，
 *    等于「先还完所有旧账，再学新东西」。压到最后的新卡往往被跳过，
 *    因为那时候注意力已经耗光了。改成按比例插进去。
 *
 * 刻意不做的事：给每张卡打「难度分」再贪心排序。难度是主观量，
 * 而顺序对错没有客观答案——一个能解释清楚的简单规则，比一个调不准的评分模型可靠。
 */

import type { CardType } from "./types.ts";

/** 少于这个数量就不折腾：2 张卡排不出交错，只会让顺序变得不可预测。 */
export const INTERLEAVE_MIN_SIZE = 3;

/** 没有 type 也没有 tag 的卡。它是中性填充，可以挨着任何人，不算「同组」。 */
export const NEUTRAL_KEY = "@neutral";

export type InterleaveDimension = "type" | "tag" | "none";

/** 本模块只依赖这三个字段，不依赖完整的 Card，方便单测构造。 */
export interface InterleaveCard {
  id: string;
  type?: CardType;
  tags?: readonly string[];
}

function typeKey(card: InterleaveCard): string {
  return card.type ? `type:${card.type}` : NEUTRAL_KEY;
}

/**
 * 用「排序后的第一个 tag」当分组键。
 *
 * 为什么不取全部 tags：一张卡可以有很多 tag，用集合相似度做分组会让
 * 排序结果依赖标签数量，用户改一个标签就会整批重排，很难解释。
 * 取第一个（字典序）至少是稳定的：同一种卡稳定落在同一个桶里。
 */
function tagKey(card: InterleaveCard): string {
  const tags = card.tags;
  if (!tags || tags.length === 0) return NEUTRAL_KEY;
  let first: string | null = null;
  for (const tag of tags) {
    if (!tag) continue;
    if (first === null || tag < first) first = tag;
  }
  return first === null ? NEUTRAL_KEY : `tag:${first}`;
}

export function keyOf(card: InterleaveCard, dimension: InterleaveDimension): string {
  if (dimension === "type") return typeKey(card);
  if (dimension === "tag") return tagKey(card);
  return NEUTRAL_KEY;
}

/**
 * 这一批卡到底该按什么分组。
 *
 * 阈值是「至少两种不同分组」，因为只有一种的时候交错是个空操作——
 * 这时候返回 "none"，调用方就知道不该在界面上写「已开启交错」，
 * 否则那是一条假提示。
 */
export function resolveDimension(
  cards: readonly InterleaveCard[],
): InterleaveDimension {
  if (cards.length < INTERLEAVE_MIN_SIZE) return "none";
  if (countDistinct(cards, typeKey) >= 2) return "type";
  if (countDistinct(cards, tagKey) >= 2) return "tag";
  return "none";
}

function countDistinct(
  cards: readonly InterleaveCard[],
  key: (card: InterleaveCard) => string,
): number {
  const seen = new Set<string>();
  for (const card of cards) {
    const k = key(card);
    if (k !== NEUTRAL_KEY) seen.add(k);
  }
  return seen.size;
}

/**
 * 把新卡按比例插进到期卡里。
 *
 * 判据是「谁落后得更多」：用 `已放数量 / 总数` 做比较，取比例小的那一方。
 * 不用固定间隔（每 N 张插一张），因为到期卡只有 1 张、新卡有 2 张时，
 * 固定间隔会算出「第 0.5 张之后插入」这种没法落地的位置。
 *
 * @example mergeFresh([d1,d2,d3,d4], [f1,f2])
 * // → [d1, f1, d2, d3, f2, d4]
 */
export function mergeFresh<T>(due: readonly T[], fresh: readonly T[]): T[] {
  if (fresh.length === 0) return [...due];
  if (due.length === 0) return [...fresh];

  const out: T[] = [];
  let di = 0;
  let fi = 0;

  while (di < due.length || fi < fresh.length) {
    if (fi >= fresh.length) {
      out.push(due[di++]);
      continue;
    }
    if (di >= due.length) {
      out.push(fresh[fi++]);
      continue;
    }
    if (di * fresh.length <= fi * due.length) {
      out.push(due[di++]);
    } else {
      out.push(fresh[fi++]);
    }
  }

  return out;
}

/**
 * 分桶轮询：每张都从「剩余最多、且不同于上一张」的桶里取。
 *
 * 为什么不是「稳定交换」：先写的第一版是「相邻同组就往后找一张换过来」，
 * 对 `AABB` 有效，但碰上 `AAABBBCCC` 就露馅——前半段修好之后，
 * 后半段的 C 找不到可换的对象，最后剩下的三张 C 连在一起。
 * 而正确答案（abcabcabc）一直都在，只是局部修补看不到它。
 *
 * 为什么不是「按桶大小预先排序再依次取」：那样评完一张卡，
 * 桶大小一变，整批顺序都会跳。这里每取一张都重新比较剩余数，
 * 但桶顺序按**首次出现位置**兜底，所以变化是局部的而不是全局的。
 *
 * 取不到时的两级降级：
 * 1. 中性卡（没 type 也没 tag）填空——它跟谁都不冲突，早用晚用都一样；
 * 2. 实在没法避开（某种卡超过总数一半），才允许相邻。
 *    这是数学上的上限：A 有 4 张、总数 6，必然至少有 1 处 A 相邻。
 */
export function spreadByKey<T>(
  cards: readonly T[],
  key: (card: T) => string,
): T[] {
  if (cards.length < 3) return [...cards];

  const buckets = new Map<string, T[]>();
  for (const card of cards) {
    const k = key(card);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(card);
    else buckets.set(k, [card]);
  }

  const groups = [...buckets.entries()].map(([k, items]) => ({
    key: k,
    items,
    cursor: 0,
  }));

  const out: T[] = [];
  let lastKey: string | null = null;
  let remaining = cards.length;

  while (remaining > 0) {
    let pick = -1;
    let pickSize = -1;

    // 优先级 1：非中性、且与上一张不同组，取剩余最多的那个
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const size = g.items.length - g.cursor;
      if (size <= 0 || g.key === NEUTRAL_KEY || g.key === lastKey) continue;
      if (size > pickSize) {
        pickSize = size;
        pick = i;
      }
    }

    // 优先级 2：中性卡填空
    if (pick === -1) {
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (g.key !== NEUTRAL_KEY || g.items.length - g.cursor <= 0) continue;
        pick = i;
        break;
      }
    }

    // 优先级 3：只剩同组卡，接受相邻
    if (pick === -1) {
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (g.items.length - g.cursor <= 0) continue;
        pick = i;
        break;
      }
    }

    const g = groups[pick];
    out.push(g.items[g.cursor]);
    g.cursor += 1;
    lastKey = g.key;
    remaining -= 1;
  }

  return out;
}

export interface SequenceMeta {
  total: number;
  dimension: InterleaveDimension;
  /** 排完之后仍然「相邻同组」的对数。0 表示这一批完全错开了。 */
  adjacentSame: number;
  /** 插进去了几张新卡 */
  freshMerged: number;
}

export interface BuildSequenceOptions {
  /** 关掉交错（设置页的开关），只保留新卡均分。 */
  interleave?: boolean;
}

/**
 * 今天的复习顺序。
 *
 * 输入就是 `queue.due` 和 `queue.fresh`，输出是「下一张是哪张」。
 * `interleave: false` 时完全退回老行为（`[...due, ...fresh]`），
 * 连新卡均分也一并关掉——开关要能让人看出差别，否则它就不算开关。
 */
export function buildReviewSequence<C extends InterleaveCard>(
  due: readonly C[],
  fresh: readonly C[],
  options: BuildSequenceOptions = {},
): C[] {
  if (options.interleave === false) return [...due, ...fresh];

  const merged = mergeFresh(due, fresh);
  const dimension = resolveDimension(merged);
  if (dimension === "none") return merged;

  return spreadByKey(merged, (card) => keyOf(card, dimension));
}

/** 给界面用的一小撮事实：这批卡排成什么样、按什么分的组。 */
export function describeSequence<C extends InterleaveCard>(
  sequence: readonly C[],
  freshCount: number,
): SequenceMeta {
  const dimension = resolveDimension(sequence);
  let adjacentSame = 0;
  if (dimension !== "none") {
    for (let i = 1; i < sequence.length; i++) {
      const prev = keyOf(sequence[i - 1], dimension);
      const cur = keyOf(sequence[i], dimension);
      if (prev !== NEUTRAL_KEY && prev === cur) adjacentSame += 1;
    }
  }
  return {
    total: sequence.length,
    dimension,
    adjacentSame,
    freshMerged: freshCount,
  };
}
