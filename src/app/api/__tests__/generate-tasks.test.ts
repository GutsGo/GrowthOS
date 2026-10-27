import { test } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../generate-tasks/route.ts";
import { installUpstream, aiJson } from "../../../../test/helpers/ai.ts";
import { withDeepSeek, withNoAi } from "../../../../test/helpers/env.ts";
import { asArray, jsonPost, readJson } from "../../../../test/helpers/http.ts";

interface Task {
  id: string;
  name: string;
  reason: string;
  energyDemand: string;
}

const stats = (rate: number, name = "早起") => ({
  habitId: `h-${name}`,
  name,
  completedCount: Math.round(rate * 10),
  totalCount: 10,
  rate,
});

async function run(body: unknown): Promise<{ tasks: Task[]; isFallback: boolean }> {
  const res = await POST(jsonPost(body));
  const json = await readJson(res);
  return {
    tasks: asArray(json.tasks) as Task[],
    isFallback: Boolean(json.isFallback),
  };
}

test("请求体不是合法 JSON → 不给 4xx/5xx，而是给一份能用的兜底排程", async () => {
  const { tasks, isFallback } = await run("{坏的");
  assert.equal(tasks.length, 2);
  assert.equal(isFallback, true);
  for (const task of tasks) assert.ok(task.name.length > 0);
});

test("高能量（9）无历史短板 → 攻坚 + 沉淀，不推低负荷任务", async () => {
  await withNoAi(async () => {
    const { tasks, isFallback } = await run({ energy: 9, historyStats: [] });
    assert.equal(isFallback, true);
    assert.equal(tasks.length, 2);
    assert.match(tasks[0].name, /高能突破/);
    assert.match(tasks[1].name, /深度沉淀/);
    assert.ok(tasks.every((t) => t.energyDemand !== "low"));
  });
});

test("高能量 + 有习惯打卡率低于 50% → 改成「习惯拯救」，并点名那个习惯", async () => {
  await withNoAi(async () => {
    const { tasks } = await run({
      energy: 8,
      woopWish: "把项目跑起来",
      historyStats: [stats(0.9, "喝水"), stats(0.2, "跑步")],
    });
    const remedy = tasks.find((t) => /习惯拯救/.test(t.name));
    assert.ok(remedy, "低打卡习惯必须被安排专项");
    assert.match(remedy!.name, /跑步/);
    assert.match(remedy!.reason, /20%/);
  });
});

test("低能量（3）→ 只给保底与蓄水，且全是低负荷", async () => {
  await withNoAi(async () => {
    const { tasks } = await run({ energy: 3, historyStats: [stats(0.1, "跑步")] });
    assert.equal(tasks.length, 2);
    assert.ok(tasks.every((t) => t.energyDemand === "low"));
    assert.match(tasks[0].name, /保底/);
    assert.match(tasks[0].reason, /3\/10/);
  });
});

test("中能量（5）+ 有习惯低于 70% → 微习惯修复；否则给标准心流任务", async () => {
  await withNoAi(async () => {
    const low = await run({ energy: 5, historyStats: [stats(0.4, "写作")] });
    assert.ok(low.tasks.some((t) => /微习惯修复/.test(t.name) && /写作/.test(t.name)));

    const fine = await run({ energy: 5, historyStats: [stats(0.95)] });
    assert.ok(fine.tasks.some((t) => /专注心流/.test(t.name)));
  });
});

test("没给 energy 也不会崩，落在中间档", async () => {
  await withNoAi(async () => {
    const { tasks } = await run({ historyStats: [] });
    assert.equal(tasks.length, 2);
    assert.match(tasks[0].name, /稳健平衡/);
  });
});

test("模型给出合法任务 → isFallback:false，采用模型的排程", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      aiJson({
        tasks: [
          { id: "t1", name: "把复习队列清到 0", reason: "积压会让你明天不想打开", energyDemand: "medium" },
          { id: "t2", name: "散步 10 分钟", reason: "低电量时先动身体", energyDemand: "low" },
        ],
      }),
    ]);
    try {
      const { tasks, isFallback } = await run({ energy: 6, historyStats: [stats(0.8)] });
      assert.equal(isFallback, false);
      assert.equal(tasks.length, 2);
      assert.equal(tasks[0].id, "t1");
    } finally {
      upstream.restore();
    }
  });
});

test("模型返回合法 JSON 但一个任务都没有 → 等同失败，回退本地", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ tasks: [] })]);
    try {
      const { tasks, isFallback } = await run({ energy: 9, historyStats: [] });
      assert.equal(isFallback, true);
      assert.match(tasks[0].name, /高能突破/);
    } finally {
      upstream.restore();
    }
  });
});

test("prompt 里带上低打卡的重点攻坚清单，而不是只给一串凭空的理由", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ tasks: [{ id: "x", name: "任务", reason: "理由" }] })]);
    try {
      await run({ energy: 7, woopWish: "写完方案", historyStats: [stats(0.3, "跑步")] });
      const payload = JSON.stringify(upstream.calls[0].body);
      assert.match(payload, /写完方案/);
      assert.match(payload, /需要重点攻坚/);
      assert.match(payload, /跑步 最近 7 天打卡率: 30%/);
    } finally {
      upstream.restore();
    }
  });
});
