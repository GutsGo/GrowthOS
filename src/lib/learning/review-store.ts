/**
 * 复习动作的落库层
 *
 * 这里刻意只有两层薄薄的壳，所有判断都在纯函数里：
 * - `recordReview`：读卡 → 算 → 在**同一个事务**里写卡片和事件
 * - `setCardType`：翻面前押题型时用，只改 type
 *
 * 为什么要事务：如果卡片写成功了、事件写失败了，
 * 统计里就少一次复习（热力图偏淡），但卡片的间隔已经推进——
 * 这种「半成功」状态最难受，因为你既没法重做也没法修。
 * Dexie 的 transaction 保证两者同生共死。
 */

import { db } from "@/lib/db";
import { fromStoredCard } from "./adapters";
import { buildReviewOutcome, type ReviewOutcome } from "./review";
import type { CardType, ExamTurn, Rating } from "./types";

export interface RecordReviewOptions {
  /** 评分时刻，默认现在。测试或补录时可显式传入 */
  now?: number;
  /**
   * 本张卡在翻面前答的两轮考官问答。
   *
   * 由调用方传进来而不是在这里重新算：问过什么、答成什么样，
   * 只有复习页知道；写库这层只负责把它和卡片更新放进同一个事务。
   */
  exam?: ExamTurn[];
}

/**
 * 记录一次评分。
 *
 * @returns 写入了什么（可用于 UI 提示「下次 4 天后」）；卡不存在时返回 null。
 * 卡不存在是正常情况：另一个标签页刚把它删了，或者同步把它标记成了已删除。
 * 这时候**不该**抛错——用户点完评分看到红色报错只会以为是自己点坏了。
 */
export async function recordReview(
  cardId: string,
  rating: Rating,
  options: RecordReviewOptions = {},
): Promise<ReviewOutcome | null> {
  const card = await db.cards.get(cardId);
  if (!card) return null;

  const now = options.now ?? Date.now();
  const outcome = buildReviewOutcome({
    cardId,
    before: fromStoredCard(card, now),
    rating,
    now,
  });

  // 只有真答过才写这个字段。空数组会让「有没有走考官」这个信息失真，
  // 而它正是以后筛「哪些卡答得薄」的依据。
  const event =
    options.exam && options.exam.length > 0
      ? { ...outcome.event, exam: options.exam }
      : outcome.event;

  await db.transaction("rw", db.cards, db.reviewEvents, async () => {
    // 逐字段展开而不是直接传 outcome.patch：
    // Dexie 的 UpdateSpec 对 `*tags` 多值索引有额外的键约束，
    // 结构体变量过不了类型检查，字面量可以。
    await db.cards.update(cardId, {
      ease: outcome.patch.ease,
      reps: outcome.patch.reps,
      interval: outcome.patch.interval,
      nextReview: outcome.patch.nextReview,
    });
    await db.reviewEvents.add(event);
  });

  return { ...outcome, event };
}

/**
 * 把「这题考什么」的选择写回卡片。
 *
 * 为什么值得写回去：交错练习需要知道题型才能把三种题型混排。
 * 用户每次翻面前押一次，等于免费给卡片打标签，
 * 比让他在制卡页下拉选框可靠得多（制卡时人往往还没想清楚这卡在考什么）。
 *
 * 写失败不抛错：这是个增强动作，失败不该挡住复习。
 */
export async function setCardType(
  cardId: string,
  cardType: CardType,
): Promise<void> {
  try {
    const card = await db.cards.get(cardId);
    if (!card || card.type === cardType) return;
    await db.cards.update(cardId, { type: cardType });
  } catch (err) {
    console.warn("题型回写失败（不影响复习）:", err);
  }
}
