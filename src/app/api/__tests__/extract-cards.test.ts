import { test } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../extract-cards/route.ts";
import { MAX_PROBES } from "@/lib/ai/contract.ts";
import { installUpstream, aiJson } from "../../../../test/helpers/ai.ts";
import { withDeepSeek, withNoAi } from "../../../../test/helpers/env.ts";
import { asArray, asStringArray, jsonPost, readJson } from "../../../../test/helpers/http.ts";

const TEXT = "费曼学习法要求你用大白话把一个概念讲清楚，讲不通的地方就是没懂的地方。";

test("请求体不是合法 JSON → 400", async () => {
  assert.equal((await POST(jsonPost("not json at all"))).status, 400);
});

test("空文本 / 纯空格 → 400", async () => {
  for (const body of [{}, { text: "" }, { text: "   \n " }]) {
    assert.equal((await POST(jsonPost(body))).status, 400);
  }
});

test("模型返回 1 张卡 + 3 个追问 → 原样交出去，fallback:false", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      aiJson({
        card: {
          front: "费曼学习法的核心动作是什么？",
          back: "用大白话讲，直到讲不通的地方暴露出来。",
          tags: ["学习方法"],
          type: "concept",
        },
        probes: ["为什么讲不通等于没懂？", "大白话的边界在哪？", "你上次卡在哪句？"],
      }),
    ]);
    try {
      const body = await readJson(await POST(jsonPost({ text: TEXT })));
      assert.equal(body.fallback, false);
      const card = body.card as Record<string, unknown>;
      assert.match(String(card.front), /费曼/);
      assert.equal(asArray(body.probes).length, 3);
    } finally {
      upstream.restore();
    }
  });
});

test("没有 Key → 仍然守住「1 张卡 + 3 个追问」的形状", async () => {
  await withNoAi(async () => {
    const res = await POST(jsonPost({ text: TEXT }));
    const body = await readJson(res);
    assert.equal(res.status, 200);
    assert.equal(body.fallback, true);
    assert.equal(body.reason, "no_key");

    const card = body.card as Record<string, unknown>;
    assert.ok(String(card.front).length > 0, "降级也要有一张能用的卡");
    assert.ok(String(card.back).length > 0);
    assert.equal(asArray(body.probes).length, MAX_PROBES);
  });
});

test("降级产出的追问只有问题，不能塞答案", async () => {
  await withNoAi(async () => {
    const body = await readJson(await POST(jsonPost({ text: TEXT })));
    for (const probe of asStringArray(body.probes)) {
      assert.match(probe, /[？?]$/, `「${probe}」应该是一个问句`);
    }
  });
});

test("模型给的东西结构不可用 → 退回本地提取，而不是交半张卡", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ card: { front: "" }, probes: [] })]);
    try {
      const body = await readJson(await POST(jsonPost({ text: TEXT })));
      assert.equal(body.fallback, true);
      assert.equal(body.reason, "parse");
      assert.ok(String((body.card as Record<string, unknown>).front).length > 0);
    } finally {
      upstream.restore();
    }
  });
});

test("追问超过上限时被截断（prompt 里的数量与实际返回必须一致）", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      aiJson({
        card: { front: "问？", back: "答。", tags: [], type: "concept" },
        probes: ["一？", "二？", "三？", "四？", "五？"],
      }),
    ]);
    try {
      const body = await readJson(await POST(jsonPost({ text: TEXT })));
      assert.ok(asArray(body.probes).length <= MAX_PROBES);
    } finally {
      upstream.restore();
    }
  });
});

test("模型返回带 ```json 围栏时也能解析（真实模型很爱这么干）", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      {
        content:
          '```json\n{"card":{"front":"问？","back":"答。","tags":["x"],"type":"interview"},"probes":["一？","二？","三？"]}\n```',
      },
    ]);
    try {
      const body = await readJson(await POST(jsonPost({ text: TEXT })));
      assert.equal(body.fallback, false);
      assert.equal((body.card as Record<string, unknown>).type, "interview");
    } finally {
      upstream.restore();
    }
  });
});
