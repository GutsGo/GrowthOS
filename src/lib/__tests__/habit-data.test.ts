import { test } from "node:test";
import assert from "node:assert/strict";

import { MOOD_LABELS, type HabitCustomData } from "../habit-data.ts";

/**
 * `habit-data.ts` 里只有一个常量表，看起来不值得测。
 * 但它同时被 UI 和 prompt 引用，一旦某档的中文变成空串，
 * AI 会收到一句「状态：」，而界面上那块就是空白——两边都不报错。
 */

type Mood = NonNullable<HabitCustomData["mood"]>;

const ALL_MOODS: Mood[] = ["great", "good", "tired"];

test("三档训练状态都有中文说法，且没有空串", () => {
  assert.deepEqual(Object.keys(MOOD_LABELS).sort(), [...ALL_MOODS].sort());
  for (const mood of ALL_MOODS) {
    assert.ok(MOOD_LABELS[mood].trim().length > 0, `${mood} 的文案不能为空`);
  }
});

test("三档文案互不相同（否则界面上分不出「状态好」和「状态差」）", () => {
  const labels = ALL_MOODS.map((mood) => MOOD_LABELS[mood]);
  assert.equal(new Set(labels).size, labels.length);
});

test("「力竭」和「平稳」不会被写成同一种模糊说法", () => {
  assert.notEqual(MOOD_LABELS.tired, MOOD_LABELS.good);
  assert.match(MOOD_LABELS.tired, /疲|累|竭/);
});
