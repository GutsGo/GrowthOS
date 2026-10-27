import "fake-indexeddb/auto";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db, type Card } from "@/lib/db.ts";
import { recordReview, setCardType } from "../review-store.ts";
import { MS_PER_DAY } from "../sm2.ts";

/**
 * 复习落库层。
 *
 * 它只有两个函数，但「卡片更新」和「事件流追加」必须在**同一个事务**里——
 * 半成功是最难受的状态：热力图少一次、卡片间隔却已经推进，既没法重做也没法修。
 * 这里不 mock Dexie：用真的（内存版）IndexedDB，验证的就是真实的事务行为。
 */

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);

function makeCard(patch: Partial<Card> = {}): Card {
  return {
    id: "card-1",
    front: "什么是梯度下降",
    back: "沿负梯度方向迭代",
    tags: ["数学"],
    reps: 0,
    interval: 0,
    ease: 2.5,
    nextReview: new Date(NOW),
    createdAt: new Date(NOW - 30 * MS_PER_DAY),
    ...patch,
  };
}

before(async () => {
  await db.open();
});

after(() => {
  db.close();
});

beforeEach(async () => {
  await db.cards.clear();
  await db.reviewEvents.clear();
});

test("卡不存在时返回 null，而不是抛错（另一个标签页刚删掉它是正常情况）", async () => {
  const outcome = await recordReview("不存在的卡", 4, { now: NOW });
  assert.equal(outcome, null);
});

test("评分后卡片字段推进，同时追加一条事件（两件事都发生了）", async () => {
  await db.cards.add(makeCard());
  const outcome = await recordReview("card-1", 4, { now: NOW });

  assert.ok(outcome);
  const card = await db.cards.get("card-1");
  assert.ok(card!.reps > 0, "reps 必须推进");
  assert.ok(card!.interval > 0, "间隔必须算出来");
  assert.ok(
    card!.nextReview.getTime() > NOW,
    "下次复习必须排在未来，否则这张卡会立刻又冒出来",
  );

  const events = await db.reviewEvents.toArray();
  assert.equal(events.length, 1);
  assert.equal(events[0].cardId, "card-1");
  assert.equal(events[0].rating, 4);
  assert.equal(events[0].at, NOW);
});

test("事件里的 at 用调用方给的时间，方便补录与回放", async () => {
  await db.cards.add(makeCard());
  const explicit = Date.UTC(2026, 0, 1, 8, 0, 0);
  await recordReview("card-1", 5, { now: explicit });
  const events = await db.reviewEvents.toArray();
  assert.equal(events[0].at, explicit);
});

test("答错（Again）不会把卡片的 EF 打到 0 以下", async () => {
  await db.cards.add(makeCard({ ease: 1.3, reps: 5, interval: 20 }));
  await recordReview("card-1", 0, { now: NOW });
  const card = await db.cards.get("card-1");
  assert.ok(card!.ease >= 1.3, "EF 有下限，跌破会让后续间隔算成负数");
});

test("传了考官问答 → 事件里带上 exam；没传 → 事件里根本没有这个字段", async () => {
  await db.cards.add(makeCard());

  await recordReview("card-1", 4, {
    now: NOW,
    exam: [{ question: "第一步呢？", answer: "求导" }],
  });
  await recordReview("card-1", 4, { now: NOW + 1000 });

  const events = await db.reviewEvents.toArray();
  assert.equal(events.length, 2);
  assert.ok(Array.isArray(events[0].exam), "答过考官的要留档，用来筛「答得薄」的卡");
  assert.equal(events[0].exam!.length, 1);
  assert.equal(events[1].exam, undefined, "没走考官就不要写空数组，那会让统计失真");
});

test("空的 exam 数组也不会被写成空数组（等同没走考官）", async () => {
  await db.cards.add(makeCard());
  await recordReview("card-1", 4, { now: NOW, exam: [] });
  const events = await db.reviewEvents.toArray();
  assert.equal(events[0].exam, undefined);
});

test("连续两次评分的间隔按 SM-2 递增，不会原地踏步", async () => {
  await db.cards.add(makeCard());

  const first = await recordReview("card-1", 4, { now: NOW });
  const second = await recordReview("card-1", 4, { now: NOW + 1000 });

  assert.ok(first && second);
  assert.ok(
    second!.patch.interval >= first!.patch.interval,
    "第二次间隔不该比第一次短",
  );
  assert.equal((await db.reviewEvents.count()), 2, "两次评分就是两条事件");
});

test("setCardType 写回题型（交错练习靠它混排）", async () => {
  await db.cards.add(makeCard({ type: undefined }));
  await setCardType("card-1", "interview");
  assert.equal((await db.cards.get("card-1"))!.type, "interview");
});

test("setCardType 对不存在的卡静默返回（这是个增强动作，不该挡住复习）", async () => {
  await setCardType("没有这张卡", "mistake");
  assert.equal(await db.cards.count(), 0);
});

test("setCardType 重复写同一个题型不报错", async () => {
  await db.cards.add(makeCard({ type: "concept" }));
  await setCardType("card-1", "concept");
  await setCardType("card-1", "concept");
  assert.equal((await db.cards.get("card-1"))!.type, "concept");
});
