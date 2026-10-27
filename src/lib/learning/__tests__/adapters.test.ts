import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromStoredCard,
  isCardType,
  normalizeCardForV4,
  toEpochMs,
  toStoredPatch,
} from "../adapters.ts";
import { applyRating, EF_DEFAULT, MS_PER_DAY } from "../sm2.ts";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);

test("toEpochMs 能吃下 Date / 数字 / ISO 字符串三种历史形态", () => {
  assert.equal(toEpochMs(new Date(NOW), 0), NOW);
  assert.equal(toEpochMs(NOW, 0), NOW);
  assert.equal(toEpochMs("2026-10-26T12:00:00.000Z", 0), NOW);
});

test("toEpochMs 遇到脏值退回 fallback，而不是产出 NaN", () => {
  assert.equal(toEpochMs("not-a-date", 42), 42);
  assert.equal(toEpochMs(undefined, 42), 42);
  assert.equal(toEpochMs(null, 42), 42);
  assert.equal(toEpochMs(Number.NaN, 42), 42);
  assert.equal(toEpochMs("", 42), 42);
});

test("v3 老卡片迁移：原有复习进度一字不改", () => {
  const oldCard = {
    ease: 2.36,
    reps: 4,
    interval: 27,
    nextReview: new Date(NOW),
  };
  const patch = normalizeCardForV4(oldCard, NOW);

  assert.equal(patch.ease, 2.36);
  assert.equal(patch.reps, 4);
  assert.equal(patch.interval, 27);
  assert.equal(patch.nextReview.getTime(), NOW);
  assert.equal(patch.type, "concept", "老卡片默认按概念卡归类");
  assert.equal(patch.example, "");
});

test("v4 迁移是幂等的：跑两遍结果完全一致", () => {
  const oldCard = { ease: 2.5, reps: 2, interval: 6, nextReview: new Date(NOW) };
  const once = normalizeCardForV4(oldCard, NOW);
  const twice = normalizeCardForV4(
    { ...oldCard, ...once, nextReview: once.nextReview },
    NOW,
  );
  assert.deepEqual(twice, once);
});

test("残缺记录不崩：缺字段全部补默认值", () => {
  const patch = normalizeCardForV4({}, NOW);
  assert.equal(patch.ease, EF_DEFAULT);
  assert.equal(patch.reps, 0);
  assert.equal(patch.interval, 0);
  assert.equal(patch.type, "concept");
  // 没有到期时间就按「今天到期」处理，绝不丢卡
  assert.equal(patch.nextReview.getTime(), NOW);
});

test("脏数据修复：reps > 0 但 interval = 0 时补成 1 天", () => {
  const patch = normalizeCardForV4(
    { ease: 2.5, reps: 3, interval: 0, nextReview: new Date(NOW) },
    NOW,
  );
  assert.equal(patch.interval, 1);
  assert.equal(patch.reps, 3, "reps 不该被顺手改掉");
});

test("非法 type 回落成 concept，非法 ease 回落成默认值", () => {
  assert.equal(normalizeCardForV4({ type: "weird" }, NOW).type, "concept");
  assert.equal(normalizeCardForV4({ ease: -3 }, NOW).ease, EF_DEFAULT);
  assert.equal(normalizeCardForV4({ ease: "2.5" }, NOW).ease, EF_DEFAULT);
  assert.equal(isCardType("interview"), true);
  assert.equal(isCardType("Concept"), false);
});

test("fromStoredCard 读到的是领域状态", () => {
  const state = fromStoredCard(
    { ease: 2.5, reps: 2, interval: 6, nextReview: new Date(NOW) },
    NOW,
  );
  assert.deepEqual(state, {
    easeFactor: 2.5,
    repetitions: 2,
    interval: 6,
    due: NOW,
  });
});

test("往返：存储 → 领域 → 评分 → 存储，字段不漂移", () => {
  const stored = { ease: 2.5, reps: 1, interval: 1, nextReview: new Date(NOW) };
  const before = fromStoredCard(stored, NOW);
  const after = applyRating(before, 4, NOW);
  const patch = toStoredPatch(after);

  assert.equal(patch.ease, 2.5);
  assert.equal(patch.reps, 2);
  assert.equal(patch.interval, 6);
  assert.ok(patch.nextReview instanceof Date);
  assert.equal(patch.nextReview.getTime(), NOW + 6 * MS_PER_DAY);
});

test("toStoredPatch 输出 Date，Dexie 索引才能正确比较", () => {
  const patch = toStoredPatch({
    easeFactor: 2.333333,
    repetitions: 2.9,
    interval: 5.7,
    due: NOW,
  });
  assert.equal(patch.ease, 2.33);
  assert.equal(patch.reps, 2);
  assert.equal(patch.interval, 5);
  assert.deepEqual(patch.nextReview, new Date(NOW));
});
