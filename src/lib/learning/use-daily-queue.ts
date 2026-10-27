"use client";

/**
 * 今日队列的唯一来源
 *
 * 为什么值得单独抽一个 hook：
 * Phase 1 发生过一次「门禁说 2 张、点进复习页显示 4 张」的矛盾——两处各自
 * 建队列，各自的「新卡配额」口径还不一样。手册第 3 号弃坑机制就是队列堆爆，
 * 所以「今天到底有几张」这个数字必须是**同一个算法算出来的同一个结果**。
 *
 * 现在无论是今日门禁、复习页进度、还是看板的待办数字，都读这一份。
 * 想改配额的语义，只改这里和 queue.ts，不存在「某处忘了改」的可能。
 */

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type Card } from "@/lib/db";
import { useAppStore } from "@/lib/store";
import { fromStoredCard, toEpochMs } from "./adapters";
import { buildDailyQueue, type DailyQueue, type QueueCard } from "./queue";
import { buildReviewSequence, type SequenceMeta, describeSequence } from "./interleave";
import { countNewIntroducedOn } from "./review";
import { useLearningSettings } from "./settings";
import type { ReviewEvent } from "./types";

export interface DailyQueueState {
  queue: DailyQueue;
  /** 全部卡片；undefined 表示还在读 */
  cards: Card[] | undefined;
  /** 全部复习事件；undefined 表示还在读 */
  events: ReviewEvent[] | undefined;
  /** 当前生效的每日新卡上限 */
  newLimit: number;
  /** 数据是否已就绪（卡片与设置都读到了） */
  ready: boolean;
  /** 卡片 id → 卡片，省得每个组件自己 find */
  byId: Map<string, Card>;
  /**
   * 今天的实际复习顺序（到期卡 + 新卡，已交错）。
   *
   * 放在这里而不是复习页，是因为「今天按什么顺序」和「今天有几张」
   * 必须由同一个地方回答——否则又会出现「门禁说 2 张、复习页说 4 张」
   * 那一类口径不一致的问题。加分页、加「跳着做」都不用动这里。
   */
  sequence: QueueCard[];
  /** 序列的分组方式与残留相邻数，界面上的提示文案用它 */
  meta: SequenceMeta;
  /** 交错是否生效（设置开关 + 数据本身够不够交错） */
  interleaving: boolean;
}

const EMPTY_QUEUE: DailyQueue = {
  due: [],
  fresh: [],
  total: 0,
  newQuota: 0,
  deferredNew: 0,
};

export function useDailyQueue(): DailyQueueState {
  const cards = useLiveQuery(() => db.cards.toArray(), []);
  const events = useLiveQuery(() => db.reviewEvents.toArray(), []);
  const settings = useLearningSettings();
  /** 「今天」的日期键来自全局 store，而不是渲染期调用 Date.now()——
   *  后者会被 react-hooks/purity 判定为不纯，也确实会让「同一天」的判定
   *  在重渲染之间漂移。 */
  const currentDate = useAppStore((state) => state.currentDate);

  const newLimit = settings?.dailyNewCardLimit ?? 2;

  const queueCards = useMemo<QueueCard[]>(() => {
    if (!cards) return [];
    // 兜底时间用 0（纪元起点）而不是 Date.now()：渲染期不能取「现在」，
    // 否则同一份数据每次渲染都可能得到不同队列。
    return cards.map((card) => ({
      id: card.id,
      state: fromStoredCard(card, 0),
      type: card.type,
      tags: card.tags,
      createdAt: toEpochMs(card.createdAt, 0),
    }));
  }, [cards]);

  const byId = useMemo(
    () => new Map((cards ?? []).map((c) => [c.id, c])),
    [cards],
  );

  const queue = useMemo(() => {
    if (!cards || !events) return EMPTY_QUEUE;
    const introducedToday = countNewIntroducedOn(events, currentDate);
    return buildDailyQueue(queueCards, {
      newLimit,
      newIntroducedToday: introducedToday,
    });
  }, [cards, events, queueCards, newLimit, currentDate]);

  const interleavingEnabled = settings?.interleavingEnabled ?? true;

  const sequence = useMemo(
    () =>
      buildReviewSequence(queue.due, queue.fresh, {
        interleave: interleavingEnabled,
      }),
    [queue, interleavingEnabled],
  );

  const meta = useMemo(
    () => describeSequence(sequence, queue.fresh.length),
    [sequence, queue.fresh.length],
  );

  return {
    queue,
    cards,
    events,
    newLimit,
    ready: cards !== undefined && settings !== null,
    byId,
    sequence,
    meta,
    interleaving: interleavingEnabled && meta.dimension !== "none",
  };
}
