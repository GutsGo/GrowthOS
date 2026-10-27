import { test } from "node:test";
import assert from "node:assert";
import {
  buildDataQuestions,
  buildWeekSnapshot,
  checkWeeklyDraft,
  createWeeklyReview,
  findReviewForWeek,
  isInWeek,
  weekEndOf,
  weekLabel,
  weekStartOf,
} from "../weekly.ts";

const DAY = 86_400_000;
/** 2026-10-19 是周一；2026-10-26 也是周一 */
const MONDAY = new Date(2026, 9, 19, 9, 0, 0).getTime();
const WEDNESDAY = new Date(2026, 9, 21, 21, 0, 0).getTime();
const SUNDAY = new Date(2026, 9, 25, 23, 30, 0).getTime();
const NEXT_MONDAY = new Date(2026, 9, 26, 0, 10, 0).getTime();

test("周起点：周三归到本周一", () => {
  assert.equal(weekStartOf(WEDNESDAY), "2026-10-19");
});

test("周起点：周一归到自己", () => {
  assert.equal(weekStartOf(MONDAY), "2026-10-19");
});

test("周起点：周日归到上一个周一，而不是下周一", () => {
  assert.equal(weekStartOf(SUNDAY), "2026-10-19");
});

test("周起点：下周一零点十分钟属于下一周", () => {
  assert.equal(weekStartOf(NEXT_MONDAY), "2026-10-26");
});

test("周终点：周一起算第七天是周日", () => {
  assert.equal(weekEndOf("2026-10-19"), "2026-10-25");
});

test("周标签：同年不写年份", () => {
  assert.equal(weekLabel("2026-10-19"), "10/19 – 10/25");
});

test("周标签：跨年补上年份", () => {
  assert.equal(weekLabel("2026-12-28"), "2026/12/28 – 2027/1/3");
});

test("落在本周：周日晚上算本周", () => {
  assert.equal(isInWeek(SUNDAY, "2026-10-19"), true);
  assert.equal(isInWeek(NEXT_MONDAY, "2026-10-19"), false);
});

test("周汇总：只统计本周的事件，跨周的一条都不能混进来", () => {
  const snapshot = buildWeekSnapshot(
    {
      reviews: [
        { at: WEDNESDAY, lapsed: false, intervalBefore: 0 },
        { at: WEDNESDAY + DAY, lapsed: true, intervalBefore: 3 },
        { at: NEXT_MONDAY, lapsed: false, intervalBefore: 0 }, // 下一周
      ],
      cardCreatedAts: [WEDNESDAY, NEXT_MONDAY],
      outputs: [
        { createdAt: WEDNESDAY, stuckCount: 2 },
        { createdAt: NEXT_MONDAY, stuckCount: 1 },
      ],
      pitfallAts: [SUNDAY],
      activeDays: new Set(["2026-10-19", "2026-10-21", "2026-10-25", "2026-10-26"]),
    },
    "2026-10-19",
  );

  assert.equal(snapshot.reviewCount, 2);
  assert.equal(snapshot.lapseCount, 1);
  assert.equal(snapshot.newIntroduced, 1);
  assert.equal(snapshot.cardCreated, 1);
  assert.equal(snapshot.outputCount, 1);
  assert.equal(snapshot.stuckCount, 2);
  assert.equal(snapshot.pitfallCount, 1);
  assert.equal(snapshot.activeDays, 3, "下周一的出勤不能算进本周");
});

test("数据提问：建卡很勤但零输出时，问的是「当时在想什么」而不是下结论", () => {
  const questions = buildDataQuestions({
    weekStart: "2026-10-19",
    weekEnd: "2026-10-25",
    reviewCount: 6,
    lapseCount: 1,
    newIntroduced: 3,
    cardCreated: 5,
    outputCount: 0,
    stuckCount: 0,
    pitfallCount: 0,
    activeDays: 4,
  });

  const hoarding = questions.find((q) => q.id === "hoarding");
  assert.ok(hoarding);
  assert.match(hoarding!.text, /5 张卡/);
  assert.ok(hoarding!.text.endsWith("？"), "只能提问，不能给结论");
  assert.ok(!/建议|应该|加油/.test(hoarding!.text));
});

test("数据提问：忘记扎堆时，把归因的两个方向都摆出来", () => {
  const questions = buildDataQuestions({
    weekStart: "2026-10-19",
    weekEnd: "2026-10-25",
    reviewCount: 10,
    lapseCount: 6,
    newIntroduced: 1,
    cardCreated: 1,
    outputCount: 1,
    stuckCount: 0,
    pitfallCount: 0,
    activeDays: 5,
  });
  const lapse = questions.find((q) => q.id === "lapse");
  assert.ok(lapse);
  assert.match(lapse!.text, /是卡写得太细，还是复习时状态不对/);
});

test("数据提问：完全没有数据时不硬凑问题", () => {
  const questions = buildDataQuestions({
    weekStart: "2026-10-19",
    weekEnd: "2026-10-25",
    reviewCount: 0,
    lapseCount: 0,
    newIntroduced: 0,
    cardCreated: 0,
    outputCount: 0,
    stuckCount: 0,
    pitfallCount: 0,
    activeDays: 0,
  });
  assert.deepEqual(questions, []);
});

test("数据提问：最多两条，多了等于没问", () => {
  const questions = buildDataQuestions({
    weekStart: "2026-10-19",
    weekEnd: "2026-10-25",
    reviewCount: 12,
    lapseCount: 8,
    newIntroduced: 0,
    cardCreated: 9,
    outputCount: 0,
    stuckCount: 0,
    pitfallCount: 0,
    activeDays: 1,
  });
  assert.ok(questions.length <= 2);
});

test("周复盘校验：三问都必须写，第三问一个词也算填了", () => {
  const empty = checkWeeklyDraft({ effective: "", pseudoWork: "", oneChange: "" });
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.missing, ["effective", "pseudoWork", "oneChange"]);

  const filled = checkWeeklyDraft({
    effective: "每天坐下先做一张卡",
    pseudoWork: "收藏了很多文章但没提取",
    oneChange: "早睡",
  });
  assert.equal(filled.ok, true);
  assert.equal(filled.multipleChanges, false);
});

test("周复盘校验：第三问出现并列词时提醒「这不是一个变量」", () => {
  const check = checkWeeklyDraft({
    effective: "复习做到了",
    pseudoWork: "输出没做",
    oneChange: "早睡 + 每天一张卡",
  });
  assert.equal(check.multipleChanges, true);
});

test("周复盘记录：写入时去掉首尾空白", () => {
  const record = createWeeklyReview(
    "2026-10-19",
    { effective: " 复习 ", pseudoWork: " 收藏 ", oneChange: " 早睡 " },
    "w1",
    MONDAY,
  );
  assert.equal(record.effective, "复习");
  assert.equal(record.oneChange, "早睡");
  assert.equal(record.createdAt, MONDAY);
});

test("按周查复盘：同一周只认一条", () => {
  const records = [
    createWeeklyReview("2026-10-19", { effective: "a", pseudoWork: "b", oneChange: "c" }, "w1"),
    createWeeklyReview("2026-10-12", { effective: "a", pseudoWork: "b", oneChange: "c" }, "w2"),
  ];
  assert.equal(findReviewForWeek(records, "2026-10-19")?.id, "w1");
  assert.equal(findReviewForWeek(records, "2026-10-05"), undefined);
});
