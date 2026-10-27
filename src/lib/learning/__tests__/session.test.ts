import { test } from "node:test";
import assert from "node:assert/strict";

import { planSession } from "../session.ts";
import type { QueueCard } from "../queue.ts";

/**
 * 「先复习一张」是不是真的一张。
 *
 * 这组用例挡的是一个具体的偷换：首屏按钮承诺一张，点进去却是 `0 / 2` 的整队。
 * 光测文案（gate.test）挡不住它——文案可以写得很好，行为在另一个文件里改。
 * 所以这里测的是**行为边界**：`one` 模式下，评完一张就再也不出第二张。
 */

const card = (id: string): QueueCard => ({
  id,
  createdAt: 0,
  state: { easeFactor: 2.5, repetitions: 0, interval: 0, due: 0 },
});

const sequence = [card("a"), card("b"), card("c")];

test("整队模式：分母是今天的全部，一张都不省", () => {
  const plan = planSession(sequence, new Set(), "all");
  assert.equal(plan.pending.length, 3);
  assert.equal(plan.total, 3);
  assert.equal(plan.oneDone, false);
});

test("整队模式：评过的卡离开待评，但分母不变（进度条才走得动）", () => {
  const plan = planSession(sequence, new Set(["a"]), "all");
  assert.deepEqual(plan.pending.map((c) => c.id), ["b", "c"]);
  assert.equal(plan.total, 3);
  assert.equal(plan.rated, 1);
});

test("一张模式：只放出一张，分母也是 1（不摆 0 / 3 吓人）", () => {
  const plan = planSession(sequence, new Set(), "one");
  assert.deepEqual(plan.pending.map((c) => c.id), ["a"]);
  assert.equal(plan.total, 1);
  assert.equal(plan.oneDone, false);
});

test("一张模式：复习完一张就收尾，第二张不会自动顶上来", () => {
  const plan = planSession(sequence, new Set(["a"]), "one");
  assert.equal(plan.pending.length, 0, "评完还继续给卡，等于「先复习一张」是假的");
  assert.equal(plan.oneDone, true);
  assert.equal(plan.restCount, 2);
});

test("一张模式：今天本来就只有一张 → 那是真的清空，不该说「还有 0 张」", () => {
  const plan = planSession([card("only")], new Set(["only"]), "one");
  assert.equal(plan.oneDone, false, "剩下 0 张时走 SessionDone，不是「一张收尾」");
  assert.equal(plan.restCount, 0);
});

test("一张模式：一张都没评就收尾是不可能的（防止空库误判成「复习完了」）", () => {
  const plan = planSession([], new Set(), "one");
  assert.equal(plan.oneDone, false);
  assert.equal(plan.total, 0);
});

test("从「一张」切到整队（点「接着复习」）：已评的不重来，剩下的全放出来", () => {
  const rated = new Set(["a"]);
  const one = planSession(sequence, rated, "one");
  const all = planSession(sequence, rated, "all");

  assert.equal(one.pending.length, 0);
  assert.deepEqual(all.pending.map((c) => c.id), ["b", "c"]);
  assert.equal(all.total, 3, "分母仍是今天的三张，不是从 0 重数");
});
