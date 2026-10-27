import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AI_TIMEOUT_MS,
  chatJSON,
  extractJson,
  resolveProvider,
} from "../ai/provider.ts";
import { installUpstream, aiBadRequest, aiJson } from "../../../test/helpers/ai.ts";
import { withDeepSeek, withEnv, withNoAi } from "../../../test/helpers/env.ts";

// ---------------------------------------------------------------- resolveProvider

test("配了 DeepSeek 就用 DeepSeek，即使 OpenAI 也在", () => {
  const provider = resolveProvider({
    DEEPSEEK_API_KEY: "sk-deepseek",
    OPENAI_API_KEY: "sk-openai",
  });
  assert.equal(provider.name, "deepseek");
  assert.equal(provider.apiKey, "sk-deepseek");
});

test("只有 OpenAI 时回落到 OpenAI", () => {
  const provider = resolveProvider({ OPENAI_API_KEY: "sk-openai" });
  assert.equal(provider.name, "openai");
  assert.equal(provider.apiBase, "https://api.openai.com/v1");
});

test("一个 Key 都没有是正常状态，不是错误", () => {
  const provider = resolveProvider({});
  assert.equal(provider.name, "none");
  assert.equal(provider.apiKey, "");
});

test("base URL 末尾的斜杠全部去掉，避免拼出 //chat/completions", () => {
  const single = resolveProvider({
    DEEPSEEK_API_KEY: "k",
    DEEPSEEK_API_BASE_URL: "https://proxy.test/v1/",
  });
  assert.equal(single.apiBase, "https://proxy.test/v1");

  const doubled = resolveProvider({
    DEEPSEEK_API_KEY: "k",
    DEEPSEEK_API_BASE_URL: "https://proxy.test/v1///",
  });
  assert.equal(doubled.apiBase, "https://proxy.test/v1");

  const none = resolveProvider({ DEEPSEEK_API_KEY: "k" });
  assert.equal(none.apiBase, "https://api.deepseek.com/v1");
});

test("模型名可以被环境变量覆盖，不硬编码在代码里", () => {
  assert.equal(resolveProvider({ DEEPSEEK_API_KEY: "k" }).model, "deepseek-chat");
  assert.equal(
    resolveProvider({ DEEPSEEK_API_KEY: "k", DEEPSEEK_MODEL: "deepseek-v9" }).model,
    "deepseek-v9",
  );
});

// ---------------------------------------------------------------- extractJson

test("extractJson：纯 JSON 直接吃下", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test("extractJson：能剥掉 ```json 围栏", () => {
  assert.deepEqual(extractJson('```json\n{"question":"为什么？"}\n```'), {
    question: "为什么？",
  });
  assert.deepEqual(extractJson('```\n{"a":2}\n```'), { a: 2 });
});

test("extractJson：模型在前后加话也能捞出对象", () => {
  assert.deepEqual(extractJson('好的，以下是结果：{"gaps":[]} 希望有帮助'), {
    gaps: [],
  });
});

test("extractJson：嵌套结构不会被截断", () => {
  const text = '{"tasks":[{"id":"a","meta":{"deep":{"x":1}}},{"id":"b"}]}';
  assert.deepEqual(extractJson(text), JSON.parse(text));
});

test("extractJson：字符串里的花括号不算层级", () => {
  // 贪婪正则会在这里切坏；按括号配对并跳过字符串内容的实现不会
  assert.deepEqual(extractJson('{"tip":"用 } 收尾","ok":true}'), {
    tip: "用 } 收尾",
    ok: true,
  });
});

test("extractJson：空串 / 纯文字 / 截断的 JSON 都返回 null，不抛错", () => {
  assert.equal(extractJson(""), null);
  assert.equal(extractJson("   "), null);
  assert.equal(extractJson("抱歉，我无法回答"), null);
  assert.equal(extractJson('{"a":1'), null);
});

// ---------------------------------------------------------------- chatJSON

test("没配 Key 时直接返回 no_key，连请求都不发", async () => {
  await withNoAi(async () => {
    const upstream = installUpstream([{ json: {} }]);
    try {
      const result = await chatJSON({ system: "s", user: "u" });
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.failure, "no_key");
      assert.equal(upstream.calls.length, 0);
    } finally {
      upstream.restore();
    }
  });
});

test("正常返回时产出已解析的对象，并把非 JSON 的包装留给上游", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      { content: '```json\n{"question":"边界条件呢？"}\n```' },
    ]);
    try {
      const result = await chatJSON({ system: "s", user: "u" });
      assert.equal(result.ok, true);
      assert.deepEqual(result.ok === true && result.data, { question: "边界条件呢？" });
    } finally {
      upstream.restore();
    }
  });
});

test("请求参数按约定发出去：默认 temperature 0.3 / max_tokens 600 / 开 json 模式", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({ ok: true })]);
    try {
      await chatJSON({ system: "系统提示", user: "用户输入" });
      const call = upstream.calls[0];
      assert.equal(call.url, "https://fake-upstream.test/v1/chat/completions");
      assert.equal(call.body.model, "test-model");
      assert.equal(call.body.temperature, 0.3);
      assert.equal(call.body.max_tokens, 600);
      assert.equal(upstream.usedJsonMode(0), true);

      const messages = call.body.messages as { role: string; content: string }[];
      assert.deepEqual(messages, [
        { role: "system", content: "系统提示" },
        { role: "user", content: "用户输入" },
      ]);
      assert.equal(call.headers.Authorization, "Bearer sk-test-deepseek");
    } finally {
      upstream.restore();
    }
  });
});

test("显式 temperature / maxTokens 覆盖默认值", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiJson({})]);
    try {
      await chatJSON({ system: "s", user: "u", temperature: 0.9, maxTokens: 64 });
      assert.equal(upstream.calls[0].body.temperature, 0.9);
      assert.equal(upstream.calls[0].body.max_tokens, 64);
    } finally {
      upstream.restore();
    }
  });
});

test("content 是空串 → parse 失败（当成模型放空话处理，不是成功）", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([{ content: "" }]);
    try {
      const result = await chatJSON({ system: "s", user: "u" });
      assert.equal(result.ok === false && result.failure, "parse");
    } finally {
      upstream.restore();
    }
  });
});

test("content 不是 JSON → parse 失败，且 detail 里留了原文片段便于排查", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([{ content: "我想了想，还是算了。" }]);
    try {
      const result = await chatJSON({ system: "s", user: "u" });
      assert.equal(result.ok === false && result.failure, "parse");
      assert.match(String(result.ok === false && result.detail), /还是算了/);
    } finally {
      upstream.restore();
    }
  });
});

test("网关不认 json 模式（第一次 400）→ 去掉 response_format 重试并成功", async () => {
  // 这是改造前真实踩过的坑：配了 Key、模型也通，却永远走降级。
  await withDeepSeek(async () => {
    const upstream = installUpstream([aiBadRequest(), aiJson({ healed: true })]);
    try {
      const result = await chatJSON({ system: "s", user: "u" });
      assert.equal(result.ok, true);
      assert.deepEqual(result.ok === true && result.data, { healed: true });
      assert.equal(upstream.calls.length, 2);
      assert.equal(upstream.usedJsonMode(0), true);
      assert.equal(upstream.usedJsonMode(1), false, "重试必须去掉 response_format");
    } finally {
      upstream.restore();
    }
  });
});

test("两次都失败 → http，且 detail 里带状态码", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([{ status: 502 }, { status: 503 }]);
    try {
      const result = await chatJSON({ system: "s", user: "u" });
      assert.equal(result.ok === false && result.failure, "http");
      assert.match(String(result.ok === false && result.detail), /503/);
      assert.equal(upstream.calls.length, 2);
    } finally {
      upstream.restore();
    }
  });
});

test("网络错误 → network（不是 timeout）", async () => {
  await withDeepSeek(async () => {
    const upstream = installUpstream([
      { throws: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }) },
    ]);
    try {
      const result = await chatJSON({ system: "s", user: "u" });
      assert.equal(result.ok === false && result.failure, "network");
    } finally {
      upstream.restore();
    }
  });
});

/**
 * 超时用例：把 setTimeout 换成「立刻触发」，让 25 秒的计时器在微任务里就烧完。
 * 被替换的只有计时器，`AbortController` 与假上游的 abort 监听都是真的——
 * 也就是说，这里验证的是「计时器一到，signal 真的被 abort」。
 */
test("超时 → timeout，并且不再重试（只有一次调用）", async () => {
  await withDeepSeek(async () => {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = ((fn: () => void) => {
      queueMicrotask(fn);
      return 0;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = (() => {}) as unknown as typeof clearTimeout;

    const upstream = installUpstream([{ hangs: true }, { hangs: true }]);
    try {
      const started = Date.now();
      const result = await chatJSON({ system: "s", user: "u" });
      assert.equal(result.ok === false && result.failure, "timeout");
      assert.equal(upstream.calls.length, 1, "超时不是 http 失败，不该触发 json 模式重试");
      assert.ok(Date.now() - started < 1000, "不该真的等 25 秒");
      assert.equal(AI_TIMEOUT_MS, 25_000);
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
      upstream.restore();
    }
  });
});

test("失败时不把上游细节抛给调用方，只落日志", async () => {
  await withEnv(
    {
      DEEPSEEK_API_KEY: "sk-test-deepseek",
      DEEPSEEK_API_BASE_URL: "https://fake-upstream.test/v1",
      OPENAI_API_KEY: undefined,
    },
    async () => {
      const upstream = installUpstream([{ status: 500 }, { status: 500 }]);
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...parts: unknown[]) => warnings.push(parts.join(" "));

      try {
        const result = await chatJSON({ system: "s", user: "u" });
        assert.equal(result.ok, false);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /\[ai\] deepseek 调用失败：http/);
        // 返回值里没有 token，但有 detail —— detail 不会自动流到客户端，
        // 各路由只挑 failure 字段回给前端（由路由用例保证）
        assert.ok(!JSON.stringify(result).includes("sk-test-deepseek"));
      } finally {
        console.warn = originalWarn;
        upstream.restore();
      }
    },
  );
});
