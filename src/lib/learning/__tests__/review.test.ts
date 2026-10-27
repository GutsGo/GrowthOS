import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewOutcome,
  countNewIntroducedOn,
  describeNextDue,
  formatIntervalDays,
  previewIntervals,
  summarizeSession,
} from "../review.ts";
import { applyRating, EF_DEFAULT, MS_PER_DAY } from "../sm2.ts";
import { dayKey } from "../queue.ts";
import type { ReviewEvent, ReviewState } from "../types.ts";

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

function event(patch: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    id: "e1",
    cardId: "c1",
    rating: 4,
    at: NOW,
    intervalBefore: 6,
    intervalAfter: 15,
    easeAfter: 2.5,
    repetitionsAfter: 3,
    lapsed: false,
    ...patch,
  };
}

test("buildReviewOutcome：卡片补丁与算法结果一致", () => {
  const before = state({ repetitions: 2, interval: 6 });
  const outcome = buildReviewOutcome({
    cardId: "card-1",
    before,
    rating: 4,
    now: NOW,
    eventId: "fixed",
  });

  const expected = applyRating(before, 4, NOW);

  assert.equal(outcome.patch.ease, expected.easeFactor);
  assert.equal(outcome.patch.reps, expected.repetitions);
  assert.equal(outcome.patch.interval, expected.interval);
  assert.equal(outcome.patch.nextReview.getTime(), expected.due);
  assert.equal(outcome.patch.nextReview.getTime(), NOW + expected.interval * MS_PER_DAY);
});

test("buildReviewOutcome：事件把「评之前 / 评之后」都留下", () => {
  const before = state({ repetitions: 2, interval: 6 });
  const outcome = buildReviewOutcome({
    cardId: "card-1",
    before,
    rating: 3,
    now: NOW,
    eventId: "fixed",
  });

  assert.deepEqual(outcome.event, {
    id: "fixed",
    cardId: "card-1",
    rating: 3,
    at: NOW,
    intervalBefore: 6,
    intervalAfter: 7,
    easeAfter: 2.36,
    repetitionsAfter: 3,
    lapsed: false,
  });
});

test("buildReviewOutcome：忘记会被标记 lapsed，间隔重置", () => {
  const before = state({ repetitions: 5, interval: 40 });
  const outcome = buildReviewOutcome({
    cardId: "card-1",
    before,
    rating: 0,
    now: NOW,
    eventId: "fixed",
  });

  assert.equal(outcome.event.lapsed, true);
  assert.equal(outcome.event.intervalBefore, 40);
  assert.equal(outcome.event.intervalAfter, 1);
  assert.equal(outcome.patch.reps, 0);
});

test("buildReviewOutcome：不传 eventId 时也能生成非空且不重复的 id", () => {
  const a = buildReviewOutcome({ cardId: "c", before: state(), rating: 4, now: NOW });
  const b = buildReviewOutcome({ cardId: "c", before: state(), rating: 4, now: NOW });
  assert.ok(a.event.id.length > 0);
  assert.notEqual(a.event.id, b.event.id);
});

test("previewIntervals：四档单调递增，与算法同源", () => {
  const before = state({ repetitions: 3, interval: 20 });
  const previews = previewIntervals(before, NOW);

  assert.equal(previews.length, 4);
  assert.deepEqual(
    previews.map((p) => p.rating),
    [0, 3, 4, 5],
  );
  for (let i = 1; i < previews.length; i += 1) {
    assert.ok(
      previews[i].days > previews[i - 1].days,
      `预览间隔 ${previews.map((p) => p.days).join(" < ")} 应递增`,
    );
  }
  // 与 applyRating 完全一致，避免「按钮上写 8 天、实际排到 9 天」
  for (const p of previews) {
    assert.equal(p.days, applyRating(before, p.rating, NOW).interval);
  }
});

test("formatIntervalDays：说人话，不出现「97 天后」这种要心算的文案", () => {
  assert.equal(formatIntervalDays(0), "今天");
  assert.equal(formatIntervalDays(1), "明天");
  assert.equal(formatIntervalDays(2), "2 天后");
  assert.equal(formatIntervalDays(29), "29 天后");
  assert.equal(formatIntervalDays(31), "1 个月后");
  assert.equal(formatIntervalDays(90), "3 个月后");
  assert.equal(formatIntervalDays(400), "一年后");
});

test("countNewIntroducedOn：只数今天、且评分前从没排过期的卡", () => {
  const events = [
    event({ id: "a", intervalBefore: 0, at: NOW }),
    event({ id: "b", intervalBefore: 0, at: NOW + 60_000 }),
    // 复习过的卡不算新卡
    event({ id: "c", intervalBefore: 6, at: NOW }),
    // 昨天的
    event({ id: "d", intervalBefore: 0, at: NOW - MS_PER_DAY }),
  ];

  const key = dayKey(NOW);
  assert.equal(countNewIntroducedOn(events, key), 2);
});

test("countNewIntroducedOn：对着新卡点「忘记」也算今天见过它", () => {
  // 这条守住一个容易写错的口径：如果用「非 lapsed」过滤，
  // 新卡评忘记就不会计入配额，于是同一天能反复引入新卡。
  const events = [event({ intervalBefore: 0, lapsed: true, rating: 0, at: NOW })];
  const key = dayKey(NOW);
  assert.equal(countNewIntroducedOn(events, key), 1);
});

test("summarizeSession：完成页要的四个数字", () => {
  const summary = summarizeSession([
    event({ id: "1", rating: 0, lapsed: true, intervalBefore: 0 }),
    event({ id: "2", rating: 5, intervalBefore: 6 }),
    event({ id: "3", rating: 4, intervalBefore: 6 }),
  ]);

  assert.deepEqual(summary, {
    rated: 3,
    lapsed: 1,
    easy: 1,
    introduced: 1,
    examined: 0,
  });
});

test("summarizeSession：只数真答过两轮的卡，空数组与缺字段都不算", () => {
  const summary = summarizeSession([
    event({
      id: "1",
      exam: [
        { question: "它解决什么问题？", answer: "解决重复计算" },
        { question: "举个反例", answer: "不缓存也不会错" },
      ],
    }),
    // 中途放弃考官（直接看答案）时 exam 是空数组，不该算「考过」
    event({ id: "2", exam: [] }),
    // 根本没走考官
    event({ id: "3" }),
  ]);

  assert.equal(summary.rated, 3);
  assert.equal(summary.examined, 1);
});

test("describeNextDue：已到期与未到期分开说", () => {
  assert.equal(describeNextDue(NOW - 1000, NOW), "已到期");
  assert.equal(describeNextDue(NOW + MS_PER_DAY, NOW), "明天");
});
