import { test } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../feynman/route.ts";
import { installUpstream, aiJson } from "../../../../test/helpers/ai.ts";
import { withDeepSeek, withNoAi } from "../../../../test/helpers/env.ts";
import { asArray, jsonPost, readJson } from "../../../../test/helpers/http.ts";

const BODY = {
  topic: "梯度下降",
  content: "每次都朝最陡的方向迈一小步，步子太大就会来回跳。",
};

test("请求体不是合法 JSON → 400", async () => {
  const res = await POST(jsonPost("{oops"));
  assert.equal(res.status, 400);
});

test("缺主题或讲述内容 → 400（没有讲述就没有可追问的东西）", async () => {
  for (const body of [{}, { topic: "只有主题" }, { content: "只有内容" }]) {
    assert.equal((await POST(jsonPost(body))).status, 400);
  }
});

test("模型给出 gaps/terms/score → 原样返回，fallback:false", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      aiJson({
        gaps: [
          { point: "没说学习率的作用", why: "它决定会不会跳过谷底" },
          { point: "没提凸性假设", why: "非凸时会卡在局部极小" },
        ],
        terms: ["梯度"],
        score: 72,
      }),
    ]);
    try {
      const body = await readJson(await POST(jsonPost(BODY)));
      assert.equal(body.fallback, false);
      assert.equal(asArray(body.gaps).length, 2);
      assert.deepEqual(body.terms, ["梯度"]);
      assert.equal(body.score, 72);
    } finally {
      upstream.restore();
    }
  });
});

test("模型没给 score → null，绝不编一个「85 分」出来", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ gaps: [{ point: "漏了边界条件" }] })]);
    try {
      const body = await readJson(await POST(jsonPost(BODY)));
      assert.equal(body.score, null);
    } finally {
      upstream.restore();
    }
  });
});

test("没有 Key → gaps 留空，但术语检测照旧工作（它是纯规则，不需要模型）", async () => {
  await withNoAi(async () => {
    const res = await POST(
      jsonPost({
        topic: "复盘",
        content: "我们要在这个维度上对齐颗粒度，形成闭环。",
      }),
    );
    const body = await readJson(res);
    assert.equal(res.status, 200);
    assert.equal(body.fallback, true);
    assert.equal(body.reason, "no_key");
    assert.deepEqual(body.gaps, [], "假的「你漏了什么」比没有更糟");
    assert.equal(body.score, null);
    assert.ok(asArray(body.terms).includes("闭环"));
  });
});

test("模型返回了结构不可用的东西 → 退回本地，不交半条追问", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ 随便: "说点什么" })]);
    try {
      const body = await readJson(await POST(jsonPost(BODY)));
      assert.equal(body.fallback, true);
      assert.equal(body.reason, "parse");
      assert.deepEqual(body.gaps, []);
    } finally {
      upstream.restore();
    }
  });
});

test("超过三条 gap 只取前三条（一屏放不下更多，也没人会去补五处）", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      aiJson({
        gaps: [
          { point: "一" },
          { point: "二" },
          { point: "三" },
          { point: "四" },
          { point: "五" },
        ],
      }),
    ]);
    try {
      const body = await readJson(await POST(jsonPost(BODY)));
      assert.equal(asArray(body.gaps).length, 3);
    } finally {
      upstream.restore();
    }
  });
});

test("大白话被写进 prompt；没写就不硬塞一段空标题", async () => {
  await withDeepSeek(async () => {
    const first = installUpstream([aiJson({ gaps: [{ point: "x" }] })]);
    try {
      await POST(jsonPost({ ...BODY, plainSummary: "就是顺着坡往下走。" }));
      const payload = JSON.stringify(first.calls[0].body);
      assert.match(payload, /他写的 100 字大白话/);
      assert.match(payload, /顺着坡往下走/);
    } finally {
      first.restore();
    }

    const second = installUpstream([aiJson({ gaps: [{ point: "x" }] })]);
    try {
      await POST(jsonPost(BODY));
      assert.ok(!JSON.stringify(second.calls[0].body).includes("大白话"));
    } finally {
      second.restore();
    }
  });
});
