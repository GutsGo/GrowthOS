import { test } from "node:test";
import assert from "node:assert";

import {
  MAX_PROBES,
  buildFallbackExtraction,
  normalizeExamReply,
  normalizeExtraction,
  normalizeFollowUp,
  normalizeProbes,
  normalizeTaskDrafts,
} from "../contract.ts";

// ---------------------------------------------------------------- 追问清洗

test("追问：模型把答案塞进问题里，必须剥掉", () => {
  const probes = normalizeProbes(["答：因为梯度方向是下降最快的方向"]);
  assert.equal(probes.length, 1);
  assert.ok(!probes[0].startsWith("答"), probes[0]);
});

test("追问：列表符号被清掉，同一句只留一条", () => {
  const probes = normalizeProbes([
    "1. 这一步为什么必要？",
    "2. 这一步为什么必要？",
    "3. 换个例子你会怎么讲？",
  ]);
  assert.deepEqual(probes, ["这一步为什么必要？", "换个例子你会怎么讲？"]);
});

test("追问：最多 3 条，多了直接砍", () => {
  const probes = normalizeProbes([
    "问题一是什么情况？",
    "问题二是什么情况？",
    "问题三是什么情况？",
    "问题四是什么情况？",
  ]);
  assert.equal(probes.length, MAX_PROBES);
});

test("追问：和卡片正面重复的那条要被排除", () => {
  const probes = normalizeProbes(
    ["为什么需要工作记忆？", "它和长期记忆的区别是什么？"],
    ["为什么需要工作记忆？"],
  );
  assert.deepEqual(probes, ["它和长期记忆的区别是什么？"]);
});

test("追问：分号串成的一段文字也能拆开", () => {
  const probes = normalizeProbes("第一步靠什么？；第二步靠什么？");
  assert.equal(probes.length, 2);
});

test("追问：过短和过长的都丢掉", () => {
  assert.deepEqual(normalizeProbes(["嗯", "字".repeat(200)]), []);
});

// ---------------------------------------------------------------- 提取契约

test("提取：标准形态能过", () => {
  const result = normalizeExtraction({
    card: { front: "什么是工作记忆？", back: "容量有限的临时缓冲区。", tags: ["认知"] },
    probes: ["它和长期记忆的分界线在哪？"],
  });
  assert.ok(result);
  assert.equal(result!.card.type, "concept");
  assert.deepEqual(result!.card.tags, ["认知"]);
  assert.equal(result!.probes.length, 1);
});

test("提取：模型只给 cards 数组时也能取第一张", () => {
  const result = normalizeExtraction({
    cards: [{ front: "问题？", back: "答案。" }],
  });
  assert.ok(result);
  assert.equal(result!.card.front, "问题？");
  assert.deepEqual(result!.card.tags, ["AI提取"]);
});

test("提取：缺背面就整体作废，不许交半张卡", () => {
  assert.equal(normalizeExtraction({ card: { front: "只有正面？" } }), null);
});

test("提取：题型不合法时退回概念卡，不抛错", () => {
  const result = normalizeExtraction({
    card: { front: "问？", back: "答。", type: "essay" },
  });
  assert.equal(result!.card.type, "concept");
});

test("提取：脏输入不崩", () => {
  assert.equal(normalizeExtraction(null), null);
  assert.equal(normalizeExtraction("一段文字"), null);
  assert.equal(normalizeExtraction({}), null);
});

// ---------------------------------------------------------------- 本地降级

test("降级：仍然是 1 张卡 + 3 个追问，绝不生成 3 张卡", () => {
  const result = buildFallbackExtraction(
    "工作记忆的容量大约只有四个组块。超过这个数量就会开始遗忘。所以要把信息打包成组块。这个结论来自实验。",
  );
  assert.ok(result.card.front && result.card.back);
  assert.equal(result.probes.length, 3);
});

test("降级：原文只有一句时，用通用追问补齐三条", () => {
  const result = buildFallbackExtraction("只有一句话在这里，长度也够。");
  assert.equal(result.probes.length, 3);
});

test("降级：空输入也给出可用形状，而不是报错", () => {
  const result = buildFallbackExtraction("");
  assert.ok(result.card.front.length > 0);
  assert.equal(result.probes.length, 3);
});

test("降级：HTML 标签被剥掉，不会跑进卡片正面", () => {
  const result = buildFallbackExtraction("<p>第一句话的内容在这里。</p><p>第二句内容也在这里。</p>");
  assert.ok(!result.card.back.includes("<p>"), result.card.back);
});

// ---------------------------------------------------------------- 费曼追问

test("费曼：分数缺失是正常的，不许编一个分数", () => {
  const result = normalizeFollowUp({
    gaps: ["没讲清楚为什么需要两层", "跳过了容量限制"],
  });
  assert.ok(result);
  assert.equal(result!.score, null);
  assert.equal(result!.gaps.length, 2);
});

test("费曼：gaps 是对象数组时保留 why", () => {
  const result = normalizeFollowUp({
    gaps: [{ point: "漏了边界条件", why: "边界决定它何时失效" }],
  });
  assert.equal(result!.gaps[0].why, "边界决定它何时失效");
});

test("费曼：分数越界或非数字当作没给", () => {
  assert.equal(normalizeFollowUp({ gaps: ["漏了"], score: 120 })!.score, null);
  assert.equal(normalizeFollowUp({ gaps: ["漏了"], score: "85" })!.score, null);
  assert.equal(normalizeFollowUp({ gaps: ["漏了"], score: 72 })!.score, 72);
});

test("费曼：什么都没有就返回 null，让调用方走降级", () => {
  assert.equal(normalizeFollowUp({}), null);
  assert.equal(normalizeFollowUp(null), null);
});

// ---------------------------------------------------------------- 考官契约

test("考官：问题为空等价于「问完了」，必须放人去看答案", () => {
  assert.deepEqual(normalizeExamReply({ question: "" }), { question: null, done: true });
  assert.deepEqual(normalizeExamReply({}), { question: null, done: true });
});

test("考官：明确标 done 时不再问", () => {
  assert.equal(normalizeExamReply({ question: "还有什么？", done: true }).done, true);
});

test("考官：前缀「考官：」被剥掉", () => {
  const reply = normalizeExamReply({ question: "考官：这一步为什么不能省？" });
  assert.equal(reply.question, "这一步为什么不能省？");
  assert.equal(reply.done, false);
});

// ---------- 排程任务归一化 ----------

test("任务：正常返回原样保留", () => {
  const tasks = normalizeTaskDrafts({
    tasks: [
      { id: "t1", name: "写 200 字", reason: "低能量保底", energyDemand: "low" },
      { id: "t2", name: "攻坚网络协议", reason: "打卡率 20%", energyDemand: "high" },
    ],
  });
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].name, "写 200 字");
  assert.equal(tasks[1].energyDemand, "high");
});

test("任务：没有 name 的整条丢掉，不补「AI 规划任务」这种空壳", () => {
  const tasks = normalizeTaskDrafts({
    tasks: [
      { id: "t1", reason: "只有理由没有名字" },
      { id: "t2", name: "   ", reason: "空白" },
      { id: "t3", name: "真任务", reason: "ok", energyDemand: "medium" },
    ],
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].name, "真任务");
});

test("任务：energyDemand 不合法时落到 medium，不透传给样式类", () => {
  const tasks = normalizeTaskDrafts({
    tasks: [{ id: "t1", name: "A", reason: "r", energyDemand: "extreme" }],
  });
  assert.equal(tasks[0].energyDemand, "medium");
});

test("任务：缺 id 时补一个，且两次调用不撞车", () => {
  const a = normalizeTaskDrafts({ tasks: [{ name: "A", reason: "r" }] });
  const b = normalizeTaskDrafts({ tasks: [{ name: "B", reason: "r" }] });
  assert.ok(a[0].id.startsWith("task-"));
  assert.notEqual(a[0].id, b[0].id);
});

test("任务：最多 3 条，多的截掉", () => {
  const tasks = normalizeTaskDrafts({
    tasks: Array.from({ length: 6 }, (_, i) => ({ name: `t${i}`, reason: "r" })),
  });
  assert.equal(tasks.length, 3);
});

test("任务：结构不对时返回空数组，由调用方走降级", () => {
  assert.deepEqual(normalizeTaskDrafts(null), []);
  assert.deepEqual(normalizeTaskDrafts({}), []);
  assert.deepEqual(normalizeTaskDrafts({ tasks: "nope" }), []);
  assert.deepEqual(normalizeTaskDrafts({ tasks: [null, 1, "x"] }), []);
});

test("任务：超长 name 被截断，避免撑破卡片", () => {
  const tasks = normalizeTaskDrafts({
    tasks: [{ name: "很".repeat(80), reason: "r" }],
  });
  assert.equal(tasks[0].name.length, 40);
});
