import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { POST } from "../auth/verify/route.ts";
import { withEnv } from "../../../../test/helpers/env.ts";
import { jsonPost, readJson } from "../../../../test/helpers/http.ts";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

test("没配 SITE_PASSWORD → 直接放行，不发 token（本地开发不该被锁）", async () => {
  await withEnv({ SITE_PASSWORD: undefined }, async () => {
    const body = await readJson(await POST(jsonPost({})));
    assert.equal(body.success, true);
    assert.equal(body.token, undefined);
  });
});

test("配了密码但没提交 → 400 且提示「请输入访问密码」", async () => {
  await withEnv({ SITE_PASSWORD: "abc123" }, async () => {
    const res = await POST(jsonPost({}));
    assert.equal(res.status, 400);
    const body = await readJson(res);
    assert.equal(body.success, false);
    assert.match(String(body.message), /请输入访问密码/);
  });
});

test("密码错误 → 401，而且不泄露正确答案", async () => {
  await withEnv({ SITE_PASSWORD: "abc123" }, async () => {
    const res = await POST(jsonPost({ password: "abc124" }));
    assert.equal(res.status, 401);
    const text = await res.text();
    assert.match(text, /密码错误/);
    assert.ok(!text.includes("abc123"), "响应里不能出现真实密码");
  });
});

test("密码正确 → 返回 sha256(密码) 作为 token（中间件按同一规则校验）", async () => {
  await withEnv({ SITE_PASSWORD: "abc123" }, async () => {
    const res = await POST(jsonPost({ password: "abc123" }));
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.equal(body.success, true);
    assert.equal(body.token, sha256("abc123"));
  });
});

test("token 每次都一样（不是随机数，重启后仍然有效）", async () => {
  await withEnv({ SITE_PASSWORD: "abc123" }, async () => {
    const first = await readJson(await POST(jsonPost({ password: "abc123" })));
    const second = await readJson(await POST(jsonPost({ password: "abc123" })));
    assert.equal(first.token, second.token);
  });
});

test("大小写与空格都算不同密码（不做「贴心」的归一化）", async () => {
  await withEnv({ SITE_PASSWORD: "abc123" }, async () => {
    for (const attempt of ["ABC123", " abc123", "abc123 ", "abc 123"]) {
      const res = await POST(jsonPost({ password: attempt }));
      assert.equal(res.status, 401, `「${attempt}」不该通过`);
    }
  });
});

test("请求体不是合法 JSON → 500，但仍然是 JSON 而不是 HTML 错误页", async () => {
  await withEnv({ SITE_PASSWORD: "abc123" }, async () => {
    const res = await POST(jsonPost("{坏的"));
    assert.equal(res.status, 500);
    const body = await readJson(res);
    assert.equal(body.success, false);
    assert.match(String(body.message), /服务器内部错误/);
  });
});
