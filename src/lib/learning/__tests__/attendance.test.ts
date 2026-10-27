import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAttendanceWindow,
  buildMilestones,
  collectActiveDays,
  formatRate,
  toDayKey,
  DEFAULT_MILESTONES,
} from "../attendance.ts";

// 用本地时区构造，避免 UTC 偏移把「今天」算到隔壁
const NOW = new Date(2026, 9, 26, 12, 0, 0).getTime();

test("习惯打卡、AI 任务、复习事件三路合并，去重后只有一个日期", () => {
  const days = collectActiveDays({
    habitDates: ["2026-10-26", "2026-10-25", "2026-10-26"],
    dailyRecords: [
      { date: "2026-10-25", aiTasks: [{ isCompleted: true }] },
      { date: "2026-10-24", aiTasks: [{ isCompleted: true }] },
    ],
    reviewEventAts: [new Date(2026, 9, 23, 9, 0, 0).getTime()],
  });

  assert.deepEqual(
    Array.from(days).sort(),
    ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"],
  );
});

test("生成了 AI 任务但一个都没做，不算出勤（否则自欺欺人）", () => {
  const days = collectActiveDays({
    dailyRecords: [
      { date: "2026-10-26", aiTasks: [{ isCompleted: false }] },
      { date: "2026-10-25", aiTasks: [] },
      { date: "2026-10-24" },
    ],
  });
  assert.equal(days.size, 0);
});

test("窗口默认 30 格，升序排列，最后一格是今天", () => {
  const window = buildAttendanceWindow(new Set(["2026-10-26"]), { now: NOW });
  assert.equal(window.cells.length, 30);
  assert.equal(window.cells[0].date, "2026-09-27");
  assert.equal(window.cells[29].date, "2026-10-26");
  assert.equal(window.cells[29].isToday, true);
  assert.equal(window.cells[29].active, true);
});

test("出勤率的分母是已过去的天数，不是窗口长度", () => {
  // 只看 7 天窗口：今天是最后一天，已过 7 天，其中 3 天有活动
  const window = buildAttendanceWindow(
    new Set(["2026-10-26", "2026-10-24", "2026-10-20"]),
    { now: NOW, days: 7 },
  );
  assert.equal(window.elapsedDays, 7);
  assert.equal(window.activeDays, 3);
  assert.equal(formatRate(window.rate), "43%");
});

test("漏一天不影响结论：8 天里来 7 天，出勤率仍是 88% 而不是归零", () => {
  const active = new Set([
    "2026-10-26",
    "2026-10-25",
    "2026-10-24",
    "2026-10-22",
    "2026-10-21",
    "2026-10-20",
    "2026-10-19",
  ]);
  const window = buildAttendanceWindow(active, { now: NOW, days: 8 });
  assert.equal(window.activeDays, 7);
  assert.equal(formatRate(window.rate), "88%");
});

test("空数据时出勤率是 0%，不会出现 NaN 或 100%", () => {
  const window = buildAttendanceWindow(new Set(), { now: NOW, days: 30 });
  assert.equal(window.activeDays, 0);
  assert.equal(formatRate(window.rate), "0%");
  assert.equal(Number.isNaN(window.rate), false);
});

test("只有 2 枚里程碑，且按窗口内出勤天数解锁（不看连续）", () => {
  const window = buildAttendanceWindow(
    new Set(["2026-10-26", "2026-10-20", "2026-10-14", "2026-10-08", "2026-10-02", "2026-09-28", "2026-09-27"]),
    { now: NOW, days: 30 },
  );
  const milestones = buildMilestones(window);
  assert.equal(milestones.length, 2);
  assert.deepEqual(
    milestones.map((m) => m.id),
    ["sprout", "steady"],
  );
  // 7 天可以散布在 30 天里，不需要连在一起
  assert.equal(milestones[0].unlocked, true);
  assert.equal(milestones[1].unlocked, false);
  assert.ok(milestones[1].progress > 0 && milestones[1].progress < 1);
});

test("里程碑目标被满足时 progress 封顶 1，不会溢出", () => {
  const active = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(2026, 9, 26);
    d.setDate(d.getDate() - i);
    active.add(toDayKey(d));
  }
  const window = buildAttendanceWindow(active, { now: NOW, days: 30 });
  const milestones = buildMilestones(window);
  for (const m of milestones) {
    assert.equal(m.unlocked, true);
    assert.equal(m.progress, 1);
  }
});

test("里程碑定义可以注入，方便以后加一枚不碰渲染代码", () => {
  const window = buildAttendanceWindow(new Set(["2026-10-26"]), { now: NOW });
  const custom = buildMilestones(window, [
    { id: "sprout", name: "一日", target: 1, desc: "来过一天" },
  ]);
  assert.equal(custom.length, 1);
  assert.equal(custom[0].unlocked, true);
  assert.equal(DEFAULT_MILESTONES.length, 2);
});

test("toDayKey 用本地时区，跨零点不会把今天算成昨天", () => {
  const lateNight = new Date(2026, 9, 26, 23, 59, 0).getTime();
  assert.equal(toDayKey(lateNight), "2026-10-26");
  // 次日 00:01 必须变成新的一天
  assert.equal(toDayKey(lateNight + 2 * 60 * 1000), "2026-10-27");
});

test("窗口包含今天，且未来格子被标记（界面上留空位而不是少一格）", () => {
  const window = buildAttendanceWindow(new Set(), { now: NOW, days: 30 });
  const future = window.cells.filter((c) => c.isFuture);
  assert.equal(future.length, 0);
  assert.equal(window.cells[29].isToday, true);
  assert.ok(window.cells[0].date < window.cells[29].date);
});
