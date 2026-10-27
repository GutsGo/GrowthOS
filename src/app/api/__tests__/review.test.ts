import { test } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../review/route.ts";
import { installUpstream, aiJson } from "../../../../test/helpers/ai.ts";
import { withDeepSeek, withNoAi } from "../../../../test/helpers/env.ts";
import { asStringArray, jsonPost, readJson } from "../../../../test/helpers/http.ts";

const woop = { wish: "写完方案", outcome: "松一口气", obstacle: "手机", plan: "开飞行模式" };

const payload = (patch: Record<string, unknown> = {}) => ({
  date: "2026-10-27",
  woop,
  energy: 6,
  habits: [
    { name: "喝水", logged: true },
    { name: "跑步", logged: false },
    { name: "读书", logged: false },
  ],
  cardsCount: 12,
  ...patch,
});

async function questionsOf(body: unknown): Promise<{ questions: string[]; isFallback: boolean }> {
  const json = await readJson(await POST(jsonPost(body)));
  return { questions: asStringArray(json.questions), isFallback: Boolean(json.isFallback) };
}

test("打卡不满时，本地问题会点名漏掉哪个习惯", async () => {
  await withNoAi(async () => {
    const { questions, isFallback } = await questionsOf(payload());
    assert.equal(isFallback, true);
    assert.equal(questions.length, 3);
    assert.match(questions[0], /1\/3/);
    assert.match(questions[0], /跑步/);
    assert.match(questions[0], /读书/);
  });
});

test("全部打卡时走「顺风」分支，问的是可持续性而不是表扬", async () => {
  await withNoAi(async () => {
    const { questions } = await questionsOf(
      payload({ habits: [{ name: "喝水", logged: true }] }),
    );
    assert.match(questions[0], /100% 习惯打卡/);
    assert.doesNotMatch(questions[0], /漏掉了/);
  });
});

test("有健身特化记录 → 问题里带上组数与总搬运量", async () => {
  await withNoAi(async () => {
    const { questions } = await questionsOf(
      payload({
        habits: [
          {
            name: "力量训练",
            logged: true,
            customFormType: "fitness",
            customData: {
              sets: [
                { setNum: 1, weight: 40, reps: 10 },
                { setNum: 2, weight: 45, reps: 8 },
              ],
              mood: "tired",
              notes: "最后一组力竭",
            },
          },
        ],
      }),
    );
    const fitness = questions.find((q) => q.includes("力量训练"));
    assert.ok(fitness, "应该有一条针对力量训练的问题");
    assert.match(fitness!, /2 组/);
    assert.match(fitness!, /760kg/); // 40*10 + 45*8：这是「搬运量」不是单组重量
    assert.match(fitness!, /略显疲惫/);
  });
});

test("有社交特化记录 → 问题抓住交往对象与跟进待办", async () => {
  await withNoAi(async () => {
    const { questions } = await questionsOf(
      payload({
        habits: [
          {
            name: "深度交流",
            logged: true,
            customFormType: "social",
            customData: { contact: "老王", topic: "跳槽", reflect: "讲太多", followUp: "周五前发简历" },
          },
        ],
      }),
    );
    const social = questions.find((q) => q.includes("老王"));
    assert.ok(social);
    assert.match(social!, /跳槽/);
    assert.match(social!, /周五前发简历/);
  });
});

test("AI 任务全部完成 / 有遗漏 / 没有排程，三种情况问法不同", async () => {
  await withNoAi(async () => {
    const done = await questionsOf(
      payload({ aiTasks: [{ id: "1", name: "清队列", reason: "", energyDemand: "low", isCompleted: true }] }),
    );
    assert.match(done.questions.join("\n"), /全部剿灭/);

    const missed = await questionsOf(
      payload({
        aiTasks: [
          { id: "1", name: "清队列", reason: "", energyDemand: "low", isCompleted: true },
          { id: "2", name: "写周报", reason: "", energyDemand: "medium", isCompleted: false },
        ],
      }),
    );
    assert.match(missed.questions.join("\n"), /写周报/);

    const none = await questionsOf(payload({ aiTasks: [] }));
    assert.match(none.questions.join("\n"), /物理断开/);
  });
});

test("模型给出 3 个问题 → isFallback:false，直接采用", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      aiJson({ questions: ["为什么先动手机？", "If-Then 在哪一步断了？", "明天改哪一个动作？"] }),
    ]);
    try {
      const { questions, isFallback } = await questionsOf(payload());
      assert.equal(isFallback, false);
      assert.equal(questions.length, 3);
      assert.equal(questions[1], "If-Then 在哪一步断了？");
    } finally {
      upstream.restore();
    }
  });
});

test("模型只给 2 个问题 → 整体退回本地三问（不允许「今天只值得问两个」）", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ questions: ["问题一？", "问题二？"] })]);
    try {
      const { questions, isFallback } = await questionsOf(payload());
      // 注意：这是唯一一处「模型成功但被丢弃」的地方，且 isFallback 标记的是
      // 「本次内容来自本地」而不是「调用失败」——两者在 UI 上的含义不同，这里钉住实际行为
      assert.equal(questions.length, 3);
      assert.ok(questions.some((q) => q.includes("1/3")), "应换成带数据的本地问题");
      assert.equal(isFallback, false);
    } finally {
      upstream.restore();
    }
  });
});

test("模型一次给 5 个 → 只取前 3 个", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      aiJson({ questions: ["一？", "二？", "三？", "四？", "五？"] }),
    ]);
    try {
      const { questions } = await questionsOf(payload());
      assert.deepEqual(questions, ["一？", "二？", "三？"]);
    } finally {
      upstream.restore();
    }
  });
});

test("模型返回的问题里混了非字符串 → 过滤后再判断够不够 3 条", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      aiJson({ questions: ["真的问题？", 42, null, { a: 1 }] }),
    ]);
    try {
      const { questions } = await questionsOf(payload());
      assert.ok(questions.every((q) => typeof q === "string" && q.length > 0));
      assert.equal(questions.length, 3);
    } finally {
      upstream.restore();
    }
  });
});

test("prompt 里带上打卡率、能量、WOOP 与卡片数，不让模型凭空提问", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ questions: ["一？", "二？", "三？」"] })]);
    try {
      await questionsOf(payload());
      const prompt = JSON.stringify(upstream.calls[0].body);
      assert.match(prompt, /能源值|能量值/);
      assert.match(prompt, /1\/3/);
      assert.match(prompt, /写完方案/);
      assert.match(prompt, /12 张/);
    } finally {
      upstream.restore();
    }
  });
});

test("请求体不是合法 JSON → 仍然给 3 个通用问题，不把用户挡在门外", async () => {
  const json = await readJson(await POST(jsonPost("{坏的")));
  assert.equal(asStringArray(json.questions).length, 3);
  assert.equal(json.isFallback, true);
});
