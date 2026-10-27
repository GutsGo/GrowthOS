import { test } from "node:test";
import assert from "node:assert";

import {
  EXAM_MAX_ROUNDS,
  buildFallbackQuestion,
  examFinished,
  examProgress,
  pickAnchor,
  summarizeExam,
  thinAnswerHint,
} from "../exam.ts";

test("轮次：两轮就结束，不追加审问", () => {
  assert.equal(EXAM_MAX_ROUNDS, 2);
  assert.equal(examFinished([]), false);
  assert.equal(examFinished([{ question: "a", answer: "b" }]), false);
  assert.equal(
    examFinished([
      { question: "a", answer: "b" },
      { question: "c", answer: "d" },
    ]),
    true,
  );
});

test("进度：答了几轮 / 还剩几轮", () => {
  assert.deepEqual(examProgress([]), { answered: 0, left: 2 });
  assert.deepEqual(examProgress([{ question: "a", answer: "b" }]), {
    answered: 1,
    left: 1,
  });
  assert.deepEqual(
    examProgress([
      { question: "a", answer: "b" },
      { question: "c", answer: "d" },
      { question: "e", answer: "f" },
    ]),
    { answered: 2, left: 0 },
  );
});

test("薄回答：只提示，不返回阻断标记", () => {
  assert.ok(thinAnswerHint(""));
  assert.ok(thinAnswerHint("嗯"));
  assert.equal(thinAnswerHint("我忘了这一步怎么做"), null);
});

test("锚点：优先取引号里的词", () => {
  assert.equal(pickAnchor("这里的「工作记忆」容量有限"), "工作记忆");
});

test("锚点：没有引号时取最长的英文术语", () => {
  assert.equal(pickAnchor("SM-2 用 EF 调整间隔"), "SM-2");
});

test("锚点：实在没有就返回 null", () => {
  assert.equal(pickAnchor("这是一句普通的中文说明，没有任何术语"), null);
});

test("降级追问：第一轮逼步骤，不许说结论", () => {
  const q = buildFallbackQuestion("什么是间隔重复？", "按遗忘曲线安排复习。", []);
  assert.ok(q.includes("最关键的一步"), q);
});

test("降级追问：第二轮拿走术语这个拐棍", () => {
  const q = buildFallbackQuestion("什么是间隔重复？", "按「遗忘曲线」安排复习。", [
    { question: "第一步是什么？", answer: "算下次时间" },
  ]);
  assert.ok(q.includes("遗忘曲线"), q);
  assert.ok(q.includes("不能用"), q);
});

test("降级追问：没有术语可拿时换成举例", () => {
  const q = buildFallbackQuestion("什么是间隔重复？", "按遗忘曲线安排复习。", [
    { question: "第一步是什么？", answer: "算下次时间" },
  ]);
  assert.ok(q.includes("例子"), q);
});

test("摘要：两轮都答很薄时要能被识别出来", () => {
  const summary = summarizeExam([
    { question: "a", answer: "嗯" },
    { question: "b", answer: "忘了" },
  ]);
  assert.equal(summary.rounds, 2);
  assert.equal(summary.thin, 2);
  assert.deepEqual(summary.answers, ["嗯", "忘了"]);
});

test("摘要：正常作答不算薄", () => {
  const summary = summarizeExam([
    { question: "a", answer: "先把输入切成块" },
    { question: "b", answer: "不知道该怎么举例" },
  ]);
  assert.equal(summary.thin, 0);
});
