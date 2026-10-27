import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyQueue,
  clampNewCardLimit,
  countCardsCreatedOn,
  dayKey,
  isNewCardState,
  DEFAULT_NEW_CARD_LIMIT,
  MAX_NEW_CARD_LIMIT,
} from "../queue.ts";
import type { QueueCard } from "../queue.ts";
import type { ReviewState } from "../types.ts";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const DAY = 86_400_000;

function card(
  id: string,
  review: Partial<ReviewState>,
  createdAt = NOW - DAY,
): QueueCard {
  return {
    id,
    createdAt,
    state: {
      easeFactor: 2.5,
      repetitions: 0,
      interval: 0,
      due: NOW,
      ...review,
    },
  };
}

test("新卡不会算进到期队列（否则每日配额形同虚设）", () => {
  const queue = buildDailyQueue([card("a", {}), card("b", {})], { now: NOW });
  assert.equal(queue.due.length, 0);
  assert.equal(queue.fresh.length, 2);
  assert.equal(queue.total, 2);
});

test("「忘记」过的卡是熟面孔，不能当新卡重复放行", () => {
  // 忘记后 state 变成 repetitions=0 / interval=1 —— 这是最容易踩的坑
  const lapsed = card("lapsed", { repetitions: 0, interval: 1, due: NOW - 1000 });
  assert.equal(isNewCardState(lapsed.state), false);

  const queue = buildDailyQueue([lapsed], { now: NOW, newLimit: 0 });
  assert.equal(queue.due.length, 1, "忘记过的卡必须留在到期队列");
  assert.equal(queue.fresh.length, 0);
});

test("到期卡按到期时间升序，欠最久的先还", () => {
  const cards = [
    card("late", { repetitions: 2, interval: 3, due: NOW - 5_000 }),
    card("early", { repetitions: 2, interval: 3, due: NOW - 50_000 }),
    card("mid", { repetitions: 2, interval: 3, due: NOW - 20_000 }),
    card("future", { repetitions: 2, interval: 3, due: NOW + 50_000 }),
  ];
  const queue = buildDailyQueue(cards, { now: NOW });
  assert.deepEqual(
    queue.due.map((c) => c.id),
    ["early", "mid", "late"],
  );
});

test("新卡按创建时间升序，新写的卡不许插队", () => {
  const cards = [
    card("newer", {}, NOW - 1000),
    card("oldest", {}, NOW - 90_000),
    card("middle", {}, NOW - 40_000),
  ];
  const queue = buildDailyQueue(cards, { now: NOW, newLimit: 3 });
  assert.deepEqual(
    queue.fresh.map((c) => c.id),
    ["oldest", "middle", "newer"],
  );
});

test("每日新卡配额生效，超出的顺延而不是丢弃", () => {
  const cards = Array.from({ length: 7 }, (_, i) => card(`c${i}`, {}));
  const queue = buildDailyQueue(cards, { now: NOW, newLimit: 2 });

  assert.equal(queue.fresh.length, 2);
  assert.equal(queue.deferredNew, 5);
  assert.equal(queue.newQuota, 2);
});

test("今天已经学过新卡时，配额要扣减", () => {
  const cards = Array.from({ length: 5 }, (_, i) => card(`c${i}`, {}));
  const queue = buildDailyQueue(cards, {
    now: NOW,
    newLimit: 2,
    newIntroducedToday: 1,
  });

  assert.equal(queue.newQuota, 1);
  assert.equal(queue.fresh.length, 1);
  assert.equal(queue.deferredNew, 4);
});

test("配额用尽时一张新卡都不放，但到期卡照常出", () => {
  const cards = [
    card("due-1", { repetitions: 3, interval: 6, due: NOW - DAY }),
    card("new-1", {}),
  ];
  const queue = buildDailyQueue(cards, {
    now: NOW,
    newLimit: 2,
    newIntroducedToday: 2,
  });

  assert.equal(queue.newQuota, 0);
  assert.equal(queue.fresh.length, 0);
  assert.equal(queue.due.length, 1);
  assert.equal(queue.total, 1);
});

test("上限护栏：设置里填 200 也不会把队列打爆", () => {
  assert.equal(clampNewCardLimit(200), MAX_NEW_CARD_LIMIT);
  assert.equal(clampNewCardLimit(-5), 0);
  assert.equal(clampNewCardLimit(Number.NaN), DEFAULT_NEW_CARD_LIMIT);
  assert.equal(clampNewCardLimit("3"), DEFAULT_NEW_CARD_LIMIT);
  assert.equal(clampNewCardLimit(undefined), DEFAULT_NEW_CARD_LIMIT);
});

test("空库返回空队列，不抛错", () => {
  const queue = buildDailyQueue([], { now: NOW });
  assert.equal(queue.total, 0);
  assert.deepEqual(queue.due, []);
  assert.deepEqual(queue.fresh, []);
  assert.equal(queue.deferredNew, 0);
});

test("dayKey 用本地时区，不随 UTC 偏移错位", () => {
  // 2026-10-26 23:30 本地时间
  const localLateNight = new Date(2026, 9, 26, 23, 30, 0).getTime();
  assert.equal(dayKey(localLateNight), "2026-10-26");
  assert.equal(dayKey(new Date(2026, 0, 5, 0, 1, 0).getTime()), "2026-01-05");
});

test("countCardsCreatedOn 只统计当天创建的卡", () => {
  const today = new Date(2026, 9, 26, 9, 0, 0).getTime();
  const yesterday = new Date(2026, 9, 25, 23, 0, 0).getTime();
  assert.equal(
    countCardsCreatedOn(
      [{ createdAt: today }, { createdAt: today }, { createdAt: yesterday }],
      "2026-10-26",
    ),
    2,
  );
});
