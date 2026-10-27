import { test } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../exam/route.ts";
import { installUpstream, aiJson } from "../../../../test/helpers/ai.ts";
import { withDeepSeek, withNoAi } from "../../../../test/helpers/env.ts";
import { jsonPost, readJson } from "../../../../test/helpers/http.ts";

const CARD = { front: "什么是梯度下降", back: "<p>沿负梯度方向迭代</p>" };

test("请求体不是合法 JSON → 400，中文提示而不是 500", async () => {
  const res = await POST(jsonPost("{这不是 JSON"));
  assert.equal(res.status, 400);
  assert.match(String((await readJson(res)).error), /合法 JSON/);
});

test("缺正面或背面 → 400（没有卡的考官模式没有意义）", async () => {
  for (const body of [{}, { front: "只有正面" }, { back: "只有背面" }, { front: "  ", back: "x" }]) {
    const res = await POST(jsonPost(body));
    assert.equal(res.status, 400, `${JSON.stringify(body)} 应被拒`);
  }
});

test("已经问满两轮 → 直接放人去看答案，而且根本不去请求模型", async () => {
  await withNoAi(async () => {
    const upstream = installUpstream([]); // 一个响应都不准备：一旦发请求就会炸
    try {
      const res = await POST(
        jsonPost({
          ...CARD,
          turns: [
            { question: "第一步呢？", answer: "求导" },
            { question: "边界呢？", answer: "凸函数" },
          ],
        }),
      );
      const body = await readJson(res);
      assert.equal(body.done, true);
      assert.equal(body.question, null);
      assert.equal(upstream.calls.length, 0, "满两轮不该再花一次调用");
    } finally {
      upstream.restore();
    }
  });
});

test("模型正常追问 → 返回问题、done:false、fallback:false", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ question: "如果学习率调大十倍会怎样？" })]);
    try {
      const res = await POST(jsonPost(CARD));
      const body = await readJson(res);
      assert.equal(res.status, 200);
      assert.equal(body.question, "如果学习率调大十倍会怎样？");
      assert.equal(body.done, false);
      assert.equal(body.fallback, false);
    } finally {
      upstream.restore();
    }
  });
});

test("模型把「考官：」写进问题里 → 剥掉再返回", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ question: "考官：那学习率呢？" })]);
    try {
      const body = await readJson(await POST(jsonPost(CARD)));
      assert.equal(body.question, "那学习率呢？");
    } finally {
      upstream.restore();
    }
  });
});

test("没有 Key → 本地兜底问题，形状与真调用一致（前端不用分支）", async () => {
  await withNoAi(async () => {
    const res = await POST(jsonPost(CARD));
    const body = await readJson(res);
    assert.equal(res.status, 200, "没配 Key 不是错误，不能回 5xx");
    assert.equal(body.fallback, true);
    assert.equal(body.reason, "no_key");
    assert.equal(body.done, false);
    assert.match(String(body.question), /什么是梯度下降/);
  });
});

test("第一轮模型就说「没什么可问的」→ 仍然给一个兜底问题，不能一轮不问就放行", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ question: "", done: true })]);
    try {
      const body = await readJson(await POST(jsonPost(CARD)));
      assert.equal(body.done, false);
      assert.equal(body.fallback, true);
      assert.equal(body.reason, "empty_reply");
      assert.ok(String(body.question).length > 0);
    } finally {
      upstream.restore();
    }
  });
});

test("第二轮模型说结束了 → 正常收尾，question 为 null", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ done: true })]);
    try {
      const body = await readJson(
        await POST(jsonPost({ ...CARD, turns: [{ question: "第一步？", answer: "求导" }] })),
      );
      assert.equal(body.done, true);
      assert.equal(body.question, null);
      assert.equal(body.fallback, undefined, "正常收尾不是降级");
    } finally {
      upstream.restore();
    }
  });
});

test("发给模型的 prompt 里，背面已经去掉了 HTML 标签", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ question: "然后呢？" })]);
    try {
      await POST(jsonPost({ front: "什么是梯度下降", back: "<p>沿<b>负梯度</b>方向迭代</p>" }));
      const user = String(upstream.calls[0].body.messages && JSON.stringify(upstream.calls[0].body));
      assert.ok(!user.includes("<p>"), "标签不该漏进 prompt");
      assert.ok(user.includes("负梯度"), "但文字要留下");
    } finally {
      upstream.restore();
    }
  });
});

test("历史给了三轮 → 按「已问满」截断，不会再请求第四次", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ question: "还有吗？" })]);
    try {
      await POST(
        jsonPost({
          ...CARD,
          turns: [
            { question: "第一问", answer: "第一答" },
            { question: "第二问", answer: "第二答" },
            { question: "第三问", answer: "第三答" },
          ],
        }),
      );
      assert.equal(upstream.calls.length, 0, "三条历史已经算问满，不该再请求");
    } finally {
      upstream.restore();
    }
  });
});

test("两轮里只有一条答案为空时，不把它算作一轮", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ question: "那这个呢？" })]);
    try {
      const body = await readJson(
        await POST(
          jsonPost({
            ...CARD,
            turns: [
              { question: "问了一", answer: "答了一" },
              { question: "问了二", answer: "   " }, // 空答案 = 用户还没答，不算一轮
            ],
          }),
        ),
      );
      assert.equal(upstream.calls.length, 1);
      assert.equal(body.fallback, false);
    } finally {
      upstream.restore();
    }
  });
});
