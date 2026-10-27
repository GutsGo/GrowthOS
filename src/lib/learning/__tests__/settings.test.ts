import "fake-indexeddb/auto";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { db } from "@/lib/db.ts";
import {
  normalizeSettings,
  readLearningSettings,
  updateLearningSettings,
} from "../settings.ts";
import {
  DEFAULT_LEARNING_SETTINGS,
  SETTINGS_ROW_ID,
} from "../types.ts";
import { DEFAULT_NEW_CARD_LIMIT, MAX_NEW_CARD_LIMIT } from "../queue.ts";

/**
 * 设置层。它看起来只是「读一行写一行」，但有三个会真出事的地方：
 *   1. 行不存在（清过库 / 没跑过迁移）→ 必须回落到默认值，不能崩
 *   2. 行里的值脏（老版本写过字符串、负数）→ 必须钳制，不能直接拿去算队列
 *   3. 局部更新 → 不能把别的字段抹掉
 */

before(async () => {
  await db.open();
});

after(() => {
  db.close();
});

async function freshSettings() {
  await db.settings.clear();
}

test("整行不存在时返回完整默认值（用户第一次打开就该能用）", () => {
  const settings = normalizeSettings(undefined);
  assert.deepEqual(settings, DEFAULT_LEARNING_SETTINGS);
  assert.equal(settings.id, SETTINGS_ROW_ID);
});

test("残缺的行被逐字段补齐，已有的值保留", () => {
  const settings = normalizeSettings({ dailyNewCardLimit: 5, interleavingEnabled: false });
  assert.equal(settings.dailyNewCardLimit, 5);
  assert.equal(settings.interleavingEnabled, false);
  assert.equal(settings.ritualDismissed, false, "缺的字段走默认");
  assert.equal(settings.restReminderMinutes, 0);
});

test("新卡上限被钳到 [0, 20]，脏值回落默认", () => {
  const clamp = (value: unknown) => normalizeSettings({ dailyNewCardLimit: value as number }).dailyNewCardLimit;

  assert.equal(clamp(-5), 0, "负数会让队列永远为空");
  assert.equal(clamp(9999), MAX_NEW_CARD_LIMIT, "一天 9999 张等于没有上限");
  assert.equal(clamp(3.7), 3, "小数要取整，队列按整数取卡");
  assert.equal(clamp(undefined), DEFAULT_NEW_CARD_LIMIT);
  assert.equal(clamp(Number.NaN), DEFAULT_NEW_CARD_LIMIT);
  assert.equal(clamp("7"), DEFAULT_NEW_CARD_LIMIT, "字符串是脏数据，不是数字");
});

test("布尔字段只认真正的布尔值（字符串 \"false\" 是真值陷阱）", () => {
  const settings = normalizeSettings({
    interleavingEnabled: "false" as unknown as boolean,
  });
  assert.equal(settings.interleavingEnabled, DEFAULT_LEARNING_SETTINGS.interleavingEnabled);
});

test("休息提醒时长被钳到非负整数，Infinity / 负数 / 小数都不会漏进去", () => {
  const value = (raw: unknown) => normalizeSettings({ restReminderMinutes: raw as number }).restReminderMinutes;

  assert.equal(value(-10), 0);
  assert.equal(value(4.8), 4);
  assert.equal(value(Number.POSITIVE_INFINITY), 0);
  assert.equal(value("30"), 0);
});

test("ifThenCue 只有字符串才保留，其它一律 undefined", () => {
  assert.equal(normalizeSettings({ ifThenCue: "开飞行模式" }).ifThenCue, "开飞行模式");
  assert.equal(normalizeSettings({ ifThenCue: 42 as unknown as string }).ifThenCue, undefined);
});

test("读库：没有设置行时拿到默认值，而不是 undefined", async () => {
  await freshSettings();
  const settings = await readLearningSettings();
  assert.equal(settings.dailyNewCardLimit, DEFAULT_NEW_CARD_LIMIT);
});

test("写库：局部更新不会把其它字段抹掉", async () => {
  await freshSettings();
  await updateLearningSettings({ dailyNewCardLimit: 6, ifThenCue: "打开番茄钟" });

  const next = await updateLearningSettings({ interleavingEnabled: false });
  assert.equal(next.dailyNewCardLimit, 6, "只关交错练习，不该重置新卡上限");
  assert.equal(next.ifThenCue, "打开番茄钟");
  assert.equal(next.interleavingEnabled, false);
});

test("写库：每次都刷新 updatedAt（设置也要参与同步）", async () => {
  await freshSettings();
  const first = await updateLearningSettings({ dailyNewCardLimit: 3 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await updateLearningSettings({ dailyNewCardLimit: 4 });

  assert.ok(first.updatedAt && second.updatedAt);
  assert.ok(second.updatedAt! >= first.updatedAt!);
});

test("写库：传进来的越界值在落库前就被钳住（读回来也是钳过的）", async () => {
  await freshSettings();
  const written = await updateLearningSettings({ dailyNewCardLimit: 500 });
  assert.equal(written.dailyNewCardLimit, MAX_NEW_CARD_LIMIT);

  const reread = await readLearningSettings();
  assert.equal(reread.dailyNewCardLimit, MAX_NEW_CARD_LIMIT);
});

test("写库只落在单行上，不会越写越多", async () => {
  await freshSettings();
  await updateLearningSettings({ dailyNewCardLimit: 1 });
  await updateLearningSettings({ dailyNewCardLimit: 2 });
  assert.equal(await db.settings.count(), 1);
  assert.equal((await db.settings.get(SETTINGS_ROW_ID))!.id, SETTINGS_ROW_ID);
});
