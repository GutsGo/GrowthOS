import { test } from "node:test";
import assert from "node:assert";
import {
  buildCardSuggestion,
  checkDraft,
  measurePlainSummary,
  needsFollowUp,
  splitSentences,
  type FeynmanDraft,
} from "../feynman.ts";
import type { FeynmanRecord } from "@/lib/db";

const LONG_ENOUGH =
  "梯度下降就是每次都朝着最陡的方向迈一小步，走得多了就慢慢靠近谷底，步子太大反而会来回跳。";

const draft = (patch: Partial<FeynmanDraft> = {}): FeynmanDraft => ({
  concept: "梯度下降",
  text: LONG_ENOUGH,
  stuckPoints: [],
  plainSummary: LONG_ENOUGH,
  ...patch,
});

test("大白话：空文本不算达标", () => {
  const check = measurePlainSummary("");
  assert.equal(check.ok, false);
  assert.equal(check.length, 0);
});

test("大白话：太短时先说字数，不先说术语", () => {
  const check = measurePlainSummary("就是把误差减小一点。");
  assert.equal(check.ok, false);
  assert.match(check.message, /还差 \d+ 字/);
});

test("大白话：够长且没有术语，判定达标", () => {
  const check = measurePlainSummary(LONG_ENOUGH);
  assert.equal(check.ok, true);
  assert.deepEqual(check.terms, []);
  assert.match(check.message, /没有术语/);
});

test("大白话：命中黑话时点名具体词，并说明它替你省略了解释", () => {
  const check = measurePlainSummary(
    "这件事的底层逻辑其实是先赋能再对齐，把颗粒度做细之后整个闭环就转起来了，剩下都是执行细节。",
  );
  assert.equal(check.ok, false);
  assert.ok(check.terms.includes("底层逻辑"));
  assert.ok(check.terms.includes("赋能"));
  assert.match(check.message, /省略解释/);
});

test("大白话：三个以上英文缩写也算堆术语（一次 API 不算）", () => {
  const one = measurePlainSummary(
    "你调一次 API 就行，剩下的框架都会帮你处理掉，不用自己写循环也不用管缓存怎么失效。",
  );
  assert.equal(one.ok, true, "只出现一次缩写不该判不及格");

  const many = measurePlainSummary(
    "你调 API 拿 SDK 再走 ORM，最后交给 CDN，整条链路都不用自己写循环也不用管缓存怎么失效。",
  );
  assert.equal(many.ok, false);
  assert.ok(many.terms.includes("API"));
});

test("大白话：超长时提示压缩，而不是提示继续写", () => {
  const check = measurePlainSummary(`${LONG_ENOUGH}${LONG_ENOUGH}${LONG_ENOUGH}`);
  assert.equal(check.ok, false);
  assert.match(check.message, /超了 \d+ 字/);
});

test("切句：按中英文句号与换行切，短到没有信息量的碎句被丢掉", () => {
  const sentences = splitSentences(
    "先看一下输入数据。梯度到底是什么？\n对。然后是学习率，这个值决定步子多大！",
  );
  assert.deepEqual(sentences, [
    "先看一下输入数据",
    "梯度到底是什么",
    "然后是学习率，这个值决定步子多大",
  ]);
  assert.ok(!sentences.includes("对"), "「对」这种碎句不能当成卡壳候选");
});

test("三步校验：讲得太短会被挡住", () => {
  const result = checkDraft(draft({ text: "就是这样。" }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.speak);
});

test("三步校验：没标卡壳点不挡交付，只给提示", () => {
  const result = checkDraft(draft({ stuckPoints: [] }));
  assert.equal(result.ok, true, "讲顺了就是讲顺了，不能逼人挑毛病");
  assert.ok(result.hints.stuck);
  assert.equal(result.blockers.stuck, undefined);
});

test("三步校验：大白话不合格时挡住，并带上具体原因", () => {
  const result = checkDraft(draft({ plainSummary: "用底层逻辑讲就行。" }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.plain);
});

test("待补卡建议：没有卡壳点就不建议补卡", () => {
  assert.equal(buildCardSuggestion(draft({ stuckPoints: [] })), null);
});

test("待补卡建议：只给一条，正面包含概念与卡壳点", () => {
  const suggestion = buildCardSuggestion(
    draft({
      stuckPoints: ["学习率为什么不能太大", "为什么要在最陡的方向走"],
      plainSummary: "步子太大会跨过谷底。",
    }),
  );
  assert.ok(suggestion);
  assert.match(suggestion!.front, /梯度下降/);
  assert.match(suggestion!.front, /学习率为什么不能太大/);
  assert.match(suggestion!.reason, /2 处卡壳/);
  assert.equal(suggestion!.back, "步子太大会跨过谷底。");
});

test("待补卡建议：过长的卡壳句在问句里被截断", () => {
  const suggestion = buildCardSuggestion(
    draft({ stuckPoints: ["这一段我完全没讲清楚到底为什么梯度方向是函数增长最快的方向"] }),
  );
  assert.ok(suggestion);
  assert.ok(suggestion!.front.includes("…"), "长句要截断，否则正面长到看不下去");
});

test("待补卡提醒：标了卡壳但没建卡才提醒", () => {
  const base = { id: "f1", topic: "t", content: "c", score: 0, grade: "-", tips: [], createdAt: new Date() } as FeynmanRecord;
  assert.equal(needsFollowUp({ ...base, stuckPoints: ["a"] }), true);
  assert.equal(needsFollowUp({ ...base, stuckPoints: ["a"], cardId: "c1" }), false);
  assert.equal(needsFollowUp({ ...base, stuckPoints: [] }), false);
});
