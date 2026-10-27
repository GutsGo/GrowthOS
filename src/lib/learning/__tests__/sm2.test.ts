import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyRating,
  createInitialState,
  easeDelta,
  isRating,
  EF_DEFAULT,
  EF_MIN,
  EASY_FIRST_INTERVAL,
  FIRST_INTERVAL,
  LAPSE_INTERVAL,
  MAX_INTERVAL_DAYS,
  MS_PER_DAY,
  SECOND_INTERVAL,
} from "../sm2.ts";
import type { ReviewState } from "../types.ts";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);

function state(patch: Partial<ReviewState> = {}): ReviewState {
  return {
    easeFactor: EF_DEFAULT,
    repetitions: 0,
    interval: 0,
    due: NOW,
    ...patch,
  };
}

test("easeDelta 四档取值符合 SM-2 惩罚公式", () => {
  assert.equal(easeDelta(0), -0.8);
  assert.equal(easeDelta(3), -0.14);
  assert.equal(easeDelta(4), 0);
  assert.equal(easeDelta(5), 0.1);
});

test("easeDelta 随档位单调递增", () => {
  const values = [0, 3, 4, 5].map((r) => easeDelta(r as 0 | 3 | 4 | 5));
  for (let i = 1; i < values.length; i += 1) {
    assert.ok(values[i] > values[i - 1], `档位 ${i} 的 EF 增量应更高`);
  }
});

test("createInitialState 得到一张立刻可学的新卡", () => {
  const s = createInitialState(NOW);
  assert.equal(s.easeFactor, EF_DEFAULT);
  assert.equal(s.repetitions, 0);
  assert.equal(s.interval, 0);
  assert.equal(s.due, NOW);
});

test("忘记：重置间隔为 1 天，repetitions 归零", () => {
  const before = state({ easeFactor: 2.5, repetitions: 5, interval: 40 });
  const after = applyRating(before, 0, NOW);

  assert.equal(after.repetitions, 0);
  assert.equal(after.interval, LAPSE_INTERVAL);
  assert.equal(after.due, NOW + LAPSE_INTERVAL * MS_PER_DAY);
  assert.equal(after.lapsed, true);
  assert.equal(after.intervalBefore, 40);
});

test("良好：首次 1 天，第二次 6 天，之后按 EF 累乘", () => {
  const first = applyRating(state(), 4, NOW);
  assert.equal(first.interval, FIRST_INTERVAL);
  assert.equal(first.repetitions, 1);

  const second = applyRating(first, 4, NOW);
  assert.equal(second.interval, SECOND_INTERVAL);
  assert.equal(second.repetitions, 2);

  const third = applyRating(second, 4, NOW);
  assert.equal(third.interval, Math.round(SECOND_INTERVAL * 2.5));
  assert.equal(third.repetitions, 3);
});

test("困难：间隔严格短于良好（同一张卡、同一时刻）", () => {
  const before = state({ repetitions: 2, interval: 6 });
  const hard = applyRating(before, 3, NOW);
  const good = applyRating(before, 4, NOW);

  assert.ok(
    hard.interval < good.interval,
    `困难(${hard.interval}天) 应短于 良好(${good.interval}天)——手册要求「缩短间隔，提前再见」`,
  );
  assert.equal(hard.interval, Math.round(6 * 1.2));
  assert.equal(good.interval, Math.round(6 * 2.5));
});

test("困难：不会把卡钉死在 1 天，每天都在变长", () => {
  // 这是 Phase 0 留下的真实缺陷：round(1 × 1.2) = 1，
  // 于是 interval=1 的卡连点「困难」永远是 1 天，每天见一次，永远出不去。
  let s = state({ repetitions: 1, interval: 1 });
  const intervals: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    s = applyRating(s, 3, NOW);
    intervals.push(s.interval);
  }

  for (let i = 1; i < intervals.length; i += 1) {
    assert.ok(
      intervals[i] > intervals[i - 1],
      `困难档序列 ${intervals.join(" → ")} 必须严格递增，否则等于变相惩罚如实自评`,
    );
  }
});

test("困难：永远不超过良好（否则「提前再见」就名不副实）", () => {
  let s = state({ repetitions: 1, interval: 1 });
  for (let i = 0; i < 8; i += 1) {
    const hard = applyRating(s, 3, NOW);
    const good = applyRating(s, 4, NOW);
    assert.ok(
      hard.interval <= good.interval,
      `困难(${hard.interval}) 不应超过良好(${good.interval})`,
    );
    s = { ...hard, due: NOW };
  }
});

test("新卡：困难与良好同为 1 天（一天以下没有更短的间隔）", () => {
  const hard = applyRating(state(), 3, NOW);
  const good = applyRating(state(), 4, NOW);
  assert.equal(hard.interval, 1);
  assert.equal(good.interval, 1);
});

test("简单：间隔长于良好，首次直接给 3 天", () => {
  const before = state({ repetitions: 2, interval: 6 });
  const easy = applyRating(before, 5, NOW);
  const good = applyRating(before, 4, NOW);

  assert.ok(easy.interval > good.interval, "简单档应拉长间隔");
  assert.equal(easy.interval, Math.max(good.interval + 1, Math.round(good.interval * 1.3)));

  const easyFirst = applyRating(state(), 5, NOW);
  assert.equal(easyFirst.interval, EASY_FIRST_INTERVAL);
  assert.equal(easyFirst.repetitions, 1);
});

test("四档间隔排序固定：忘记 < 困难 < 良好 < 简单", () => {
  const before = state({ repetitions: 3, interval: 20 });
  const intervals = ([0, 3, 4, 5] as const).map(
    (rating) => applyRating(before, rating, NOW).interval,
  );
  for (let i = 1; i < intervals.length; i += 1) {
    assert.ok(
      intervals[i] > intervals[i - 1],
      `档位序列 ${intervals.join(" < ")} 应严格递增`,
    );
  }
});

test("EF 下限 1.3：连续忘记不会把 EF 打到 0", () => {
  let s = state();
  for (let i = 0; i < 30; i += 1) {
    s = applyRating(s, 0, NOW);
  }
  assert.equal(s.easeFactor, EF_MIN);
  assert.ok(s.easeFactor >= 1.3);
});

test("EF 累积：简单档连点三次会把 EF 推到 2.8", () => {
  let s = state();
  for (let i = 0; i < 3; i += 1) {
    s = applyRating(s, 5, NOW);
  }
  assert.equal(s.easeFactor, 2.8);
});

test("间隔上限护栏生效", () => {
  const before = state({ easeFactor: 2.5, repetitions: 9, interval: 300 });
  const after = applyRating(before, 5, NOW);
  assert.equal(after.interval, MAX_INTERVAL_DAYS);
});

test("纯函数：不修改入参", () => {
  const frozen = Object.freeze(state({ repetitions: 2, interval: 6 }));
  const snapshot = { ...frozen };
  const result = applyRating(frozen, 4, NOW);
  assert.notEqual(result, frozen);
  assert.deepEqual({ ...frozen }, snapshot);
});

test("非法档位直接抛错，而不是静默算错", () => {
  assert.throws(() => applyRating(state(), 2 as never, NOW), RangeError);
  assert.throws(() => applyRating(state(), 6 as never, NOW), RangeError);
});

test("isRating 只认四个合法值", () => {
  for (const ok of [0, 3, 4, 5]) assert.equal(isRating(ok), true);
  for (const bad of [1, 2, 6, -1, "4", null, undefined, NaN]) {
    assert.equal(isRating(bad), false);
  }
});

test("脏数据兜底：EF 缺失或非法时按默认值 2.5 起算", () => {
  const dirty = { repetitions: 0, interval: 0, due: NOW } as unknown as ReviewState;
  const after = applyRating(dirty, 4, NOW);
  assert.equal(after.easeFactor, 2.5);
  assert.equal(after.interval, FIRST_INTERVAL);
});
