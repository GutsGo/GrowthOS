import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewSequence,
  describeSequence,
  keyOf,
  mergeFresh,
  resolveDimension,
  spreadByKey,
  INTERLEAVE_MIN_SIZE,
  NEUTRAL_KEY,
} from "../interleave.ts";
import type { CardType } from "../types.ts";

interface FakeCard {
  id: string;
  type?: CardType;
  tags?: readonly string[];
}

function typed(spec: Array<[string, CardType | undefined, string[]?]>): FakeCard[] {
  return spec.map(([id, type, tags]) => ({ id, type, tags }));
}

/** 相邻同组的对数。用来断言「排开了」而不是断言具体顺序——后者会让测试变脆。 */
function adjacentSame(cards: FakeCard[], dimension: "type" | "tag"): number {
  let count = 0;
  for (let i = 1; i < cards.length; i++) {
    const prev = keyOf(cards[i - 1], dimension);
    const cur = keyOf(cards[i], dimension);
    if (prev !== NEUTRAL_KEY && prev === cur) count += 1;
  }
  return count;
}

/** 最长的一段连续同组。比「相邻对数」更能说明「有没有把一坨堆在一起」。 */
function maxRun(cards: FakeCard[], dimension: "type" | "tag"): number {
  let best = 0;
  let run = 0;
  let prev = NEUTRAL_KEY;
  for (const card of cards) {
    const cur = keyOf(card, dimension);
    if (cur !== NEUTRAL_KEY && cur === prev) run += 1;
    else run = 1;
    if (run > best) best = run;
    prev = cur;
  }
  return best;
}

// ---------- mergeFresh ----------

test("新卡按比例插进到期卡，不堆在最后", () => {
  const due = ["d1", "d2", "d3", "d4"].map((id) => ({ id }));
  const fresh = ["f1", "f2"].map((id) => ({ id }));
  const merged = mergeFresh(due, fresh).map((c) => c.id);

  assert.equal(merged.length, 6);
  // 最后一张是新卡 = 旧行为；这里新卡必须落在中间
  assert.notEqual(merged[merged.length - 1], "f2");
  assert.ok(merged.indexOf("f1") > 0);
  assert.ok(merged.indexOf("f1") < merged.indexOf("f2"));
});

test("两边数量相等时严格交替", () => {
  const due = [{ id: "d1" }, { id: "d2" }];
  const fresh = [{ id: "f1" }, { id: "f2" }];
  assert.deepEqual(
    mergeFresh(due, fresh).map((c) => c.id),
    ["d1", "f1", "d2", "f2"],
  );
});

test("只有一边时原样返回，且不共享引用", () => {
  const due = [{ id: "d1" }, { id: "d2" }];
  const merged = mergeFresh(due, []);
  assert.deepEqual(merged, due);
  assert.notEqual(merged, due);

  const fresh = [{ id: "f1" }];
  assert.deepEqual(mergeFresh([], fresh), fresh);
});

test("mergeFresh 不丢卡、不重复", () => {
  const due = Array.from({ length: 7 }, (_, i) => ({ id: `d${i}` }));
  const fresh = Array.from({ length: 3 }, (_, i) => ({ id: `f${i}` }));
  const ids = mergeFresh(due, fresh).map((c) => c.id);
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10);
});

// ---------- spreadByKey ----------

test("两两交替的块状序列能被完全拆开", () => {
  const cards = typed([
    ["a1", "concept"], ["a2", "concept"],
    ["b1", "interview"], ["b2", "interview"],
  ]);
  const out = spreadByKey(cards, (c) => keyOf(c, "type"));
  assert.equal(adjacentSame(out, "type"), 0);
  assert.deepEqual(new Set(out.map((c) => c.id)), new Set(cards.map((c) => c.id)));
});

test("三组均分时完全排开", () => {
  const cards = typed([
    ["a1", "concept"], ["a2", "concept"], ["a3", "concept"],
    ["b1", "interview"], ["b2", "interview"], ["b3", "interview"],
    ["c1", "mistake"], ["c2", "mistake"], ["c3", "mistake"],
  ]);
  const out = spreadByKey(cards, (c) => keyOf(c, "type"));
  assert.equal(adjacentSame(out, "type"), 0);
});

test("某组超过一半时，只保留数学上不可避免的那几处相邻", () => {
  // A A A B：3 张 A 占 3/4 > 1/2，无论怎么排都至少有 1 处相邻
  const cards = typed([
    ["a1", "concept"], ["a2", "concept"], ["a3", "concept"], ["b1", "interview"],
  ]);
  const out = spreadByKey(cards, (c) => keyOf(c, "type"));
  assert.equal(adjacentSame(out, "type"), 1);
  // 三张 concept 不能被堆成一段
  assert.ok(maxRun(out, "type") <= 2);
  assert.deepEqual(new Set(out.map((c) => c.id)), new Set(cards.map((c) => c.id)));
});

test("未分类的卡当作中性填充，可以用来隔开同组", () => {
  const cards = typed([
    ["a1", "concept"], ["x1", undefined], ["a2", "concept"],
  ]);
  const out = spreadByKey(cards, (c) => keyOf(c, "type"));
  assert.equal(adjacentSame(out, "type"), 0);
});

test("spreadByKey 不修改入参", () => {
  const cards = typed([
    ["a1", "concept"], ["a2", "concept"], ["b1", "interview"],
  ]);
  const snapshot = cards.map((c) => c.id);
  spreadByKey(cards, (c) => keyOf(c, "type"));
  assert.deepEqual(cards.map((c) => c.id), snapshot);
});

test("少于 3 张时原样返回", () => {
  const cards = typed([["a1", "concept"], ["b1", "interview"]]);
  const out = spreadByKey(cards, (c) => keyOf(c, "type"));
  assert.deepEqual(out.map((c) => c.id), ["a1", "b1"]);
});

// ---------- resolveDimension ----------

test("有两种以上类型时按类型分组", () => {
  const cards = typed([["a", "concept"], ["b", "interview"], ["c", "concept"]]);
  assert.equal(resolveDimension(cards), "type");
});

test("类型不足以区分时回落到 tag", () => {
  const cards = typed([
    ["a", "concept", ["网络"]],
    ["b", "concept", ["算法"]],
    ["c", "concept", ["网络"]],
  ]);
  assert.equal(resolveDimension(cards), "tag");
});

test("只有一种类型且没有 tag 时判定为不可交错", () => {
  const cards = typed([
    ["a", "concept"], ["b", "concept"], ["c", "concept"],
  ]);
  assert.equal(resolveDimension(cards), "none");
});

test("数量不足时即使类型丰富也不交错", () => {
  const cards = typed([["a", "concept"], ["b", "interview"]]);
  assert.equal(resolveDimension(cards), "none");
  assert.equal(INTERLEAVE_MIN_SIZE, 3);
});

test("tag 取字典序最小的那个，结果稳定", () => {
  const card: FakeCard = { id: "x", tags: ["zzz", "aaa", "mmm"] };
  assert.equal(keyOf(card, "tag"), "tag:aaa");
  assert.equal(keyOf({ id: "y", tags: [] }, "tag"), "@neutral");
  assert.equal(keyOf({ id: "z" }, "type"), "@neutral");
});

// ---------- buildReviewSequence ----------

test("buildReviewSequence 同时做到：类型错开 + 新卡不压尾", () => {
  const due = typed([
    ["d1", "concept"], ["d2", "concept"], ["d3", "concept"],
  ]);
  const fresh = typed([["f1", "interview"], ["f2", "interview"]]);

  const out = buildReviewSequence(due, fresh);
  assert.equal(out.length, 5);
  assert.equal(adjacentSame(out, "type"), 0);

  const freshIds = out
    .map((c, i) => (c.id.startsWith("f") ? i : -1))
    .filter((i) => i >= 0);
  assert.equal(freshIds.length, 2);
  // 新卡不能都在最后两位
  assert.ok(freshIds[0] < 3);
});

test("关掉交错时退回「到期在前、新卡在后」", () => {
  const due = typed([["d1", "concept"], ["d2", "concept"]]);
  const fresh = typed([["f1", "interview"]]);
  const out = buildReviewSequence(due, fresh, { interleave: false });
  assert.deepEqual(out.map((c) => c.id).slice(-1), ["f1"]);
  assert.deepEqual(out.map((c) => c.id).slice(0, 2), ["d1", "d2"]);
});

test("全是同一种卡时不假装交错（顺序保持原样）", () => {
  const due = typed([["d1", "concept"], ["d2", "concept"]]);
  const fresh = typed([["f1", "concept"]]);
  const out = buildReviewSequence(due, fresh);
  assert.deepEqual(out.map((c) => c.id), ["d1", "f1", "d2"]);
});

test("空队列不会崩", () => {
  assert.deepEqual(buildReviewSequence([], []), []);
});

// ---------- describeSequence ----------

test("describeSequence 报告真实的分组方式与残留相邻数", () => {
  const cards = typed([
    ["a1", "concept"], ["b1", "interview"], ["a2", "concept"],
  ]);
  const meta = describeSequence(cards, 1);
  assert.equal(meta.dimension, "type");
  assert.equal(meta.total, 3);
  assert.equal(meta.adjacentSame, 0);
  assert.equal(meta.freshMerged, 1);
});

test("describeSequence 在不可交错时不虚报", () => {
  const cards = typed([["a", "concept"], ["b", "concept"], ["c", "concept"]]);
  const meta = describeSequence(cards, 0);
  assert.equal(meta.dimension, "none");
  assert.equal(meta.adjacentSame, 0);
});
