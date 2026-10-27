import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTodayGate } from "../gate.ts";
import { buildDailyQueue } from "../queue.ts";
import type { QueueCard } from "../queue.ts";
import type { ReviewState } from "../types.ts";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const DAY = 86_400_000;

function card(id: string, review: Partial<ReviewState> = {}): QueueCard {
  return {
    id,
    createdAt: NOW - DAY,
    state: { easeFactor: 2.5, repetitions: 0, interval: 0, due: NOW, ...review },
  };
}

const dueCard = (id: string, daysLate = 1) =>
  card(id, {
    repetitions: 3,
    interval: 7,
    due: NOW - daysLate * DAY,
  });

test("有到期卡时，主按钮给的是「先复习一张」，不是「全部做完」", () => {
  const queue = buildDailyQueue([dueCard("a"), dueCard("b"), dueCard("c")], {
    now: NOW,
  });
  const gate = buildTodayGate(queue, { hasAnyCards: true });

  assert.equal(gate.action, "review");
  assert.equal(gate.total, 3);
  assert.equal(gate.primaryLabel, "先复习一张");
  // 页签里叫「制卡」的是**做卡**，光写「先做一张」会被读成「去做一张卡」。
  // 所以这个按钮上必须出现「复习」，哪怕多两个字。
  assert.match(gate.primaryLabel, /复习/);
  // 最小承诺：按钮上不能出现「3 张」这种压力
  assert.equal(gate.primaryLabel.includes("3"), false);
});

test("到期卡与新卡混合时，副标题把构成说清楚", () => {
  const queue = buildDailyQueue(
    [dueCard("a"), card("n1"), card("n2")],
    { now: NOW, newLimit: 2 },
  );
  const gate = buildTodayGate(queue);
  assert.equal(gate.dueCount, 1);
  assert.equal(gate.freshCount, 2);
  assert.equal(gate.detail, "到期 1 张 · 新卡 2 张");
});

test("新卡超配额时明确说「排在明天」，避免用户以为丢了", () => {
  const queue = buildDailyQueue(
    [card("n1"), card("n2"), card("n3"), card("n4")],
    { now: NOW, newLimit: 2 },
  );
  const gate = buildTodayGate(queue, { hasAnyCards: true, newLimit: 2 });

  assert.equal(gate.total, 2);
  assert.equal(gate.deferredNew, 2);
  assert.equal(gate.showQuotaNote, true);
  assert.match(gate.quotaNote, /明天/);
  assert.match(gate.quotaNote, /每天最多 2 张/);
});

test("今天全清空时，主按钮变成制卡，而不是灰掉的「开始复习」", () => {
  const queue = buildDailyQueue([], { now: NOW });
  const gate = buildTodayGate(queue, { hasAnyCards: true });

  assert.equal(gate.action, "create");
  assert.equal(gate.total, 0);
  assert.equal(gate.primaryLabel, "再制一张");
  assert.match(gate.detail, /没有到期卡/);
});

test("全新用户看到的是「做第一张卡」，不是「今天清空了」", () => {
  const queue = buildDailyQueue([], { now: NOW });
  const gate = buildTodayGate(queue, { hasAnyCards: false });

  assert.equal(gate.action, "create");
  assert.equal(gate.headline, "还没有卡片");
  assert.equal(gate.primaryLabel, "做第一张卡");
});

test("只有新卡时也走复习分支（新卡确实在队列里）", () => {
  const queue = buildDailyQueue([card("n1")], { now: NOW, newLimit: 2 });
  const gate = buildTodayGate(queue, { hasAnyCards: true });
  assert.equal(gate.action, "review");
  assert.equal(gate.detail, "新卡 1 张");
});

test("未到期也不是新卡（间隔中）→ 队列为空，门禁不催", () => {
  const queue = buildDailyQueue(
    [card("later", { repetitions: 2, interval: 5, due: NOW + 3 * DAY })],
    { now: NOW },
  );
  const gate = buildTodayGate(queue, { hasAnyCards: true });
  assert.equal(gate.total, 0);
  assert.equal(gate.action, "create");
});

test("按钮说「一张」，下面那行小字也只能说这一张", () => {
  const queue = buildDailyQueue([dueCard("a"), dueCard("b")], { now: NOW });
  const gate = buildTodayGate(queue, { hasAnyCards: true });

  // 标题照旧说总量（2 张），但按钮与它的小字必须指向**同一件事**
  assert.equal(gate.total, 2);
  assert.match(gate.primaryHint, /这一张/);
  // 「约 2 分钟」是两张的时间，贴在「先复习一张」下面＝同一张卡上两句话互相拆台
  assert.equal(/\d+\s*分钟/.test(gate.primaryHint), false);
});
