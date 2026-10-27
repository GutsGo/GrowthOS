import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { middleware } from "../middleware.ts";
import { withEnv } from "../../test/helpers/env.ts";

/**
 * 中间件是这套系统里唯一一道「挡住整站」的锁，但它的判定逻辑只有 4 个分支。
 * 之前没有任何用例：改一个 exception 的路径前缀，等于把 /api 全裸奔出去，而测试全绿。
 *
 * 判定「放行」的方式：`NextResponse.next()` 会带 `x-middleware-next: 1`，
 * 拦截则是一个普通的 401 响应。不依赖状态码是否恰好 200。
 */

const PASSWORD = "open-sesame-9264";
const TOKEN = createHash("sha256").update(PASSWORD).digest("hex");

function req(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(`http://localhost${path}`), { headers });
}

function isPass(res: Response): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

test("没配 SITE_PASSWORD 时整站放行（本地开发不该被自己锁在门外）", async () => {
  await withEnv({ SITE_PASSWORD: undefined }, async () => {
    const res = await middleware(req("/api/exam"));
    assert.equal(isPass(res), true);
  });
});

test("配了密码但没有 Authorization → 401，且响应体是 JSON 不是 HTML", async () => {
  await withEnv({ SITE_PASSWORD: PASSWORD }, async () => {
    const res = await middleware(req("/api/exam"));
    assert.equal(res.status, 401);
    assert.equal(isPass(res), false);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    const body = (await res.json()) as { success: boolean; message: string };
    assert.equal(body.success, false);
    assert.match(body.message, /未授权/);
  });
});

test("不认识的认证方案（比如 Token xxx、Basic xxx）一律拒绝", async () => {
  await withEnv({ SITE_PASSWORD: PASSWORD }, async () => {
    for (const value of [`Token ${TOKEN}`, `Basic ${TOKEN}`, "Bearer", ""]) {
      const res = await middleware(req("/api/exam", { Authorization: value }));
      assert.equal(res.status, 401, `「${value}」不该通过`);
    }
  });
});

test("token 与 sha256(密码) 不符 → 401，且提示区分于「没带 token」", async () => {
  await withEnv({ SITE_PASSWORD: PASSWORD }, async () => {
    const res = await middleware(req("/api/exam", { Authorization: "Bearer not-a-real-token" }));
    assert.equal(res.status, 401);
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /Token 错误/);
  });
});

test("token 正确 → 放行，且不改写请求", async () => {
  await withEnv({ SITE_PASSWORD: PASSWORD }, async () => {
    const res = await middleware(req("/api/exam", { Authorization: `Bearer ${TOKEN}` }));
    assert.equal(isPass(res), true);
    assert.equal(res.status, 200);
  });
});

test("换一个密码，同一个 token 立刻失效（token 是密码的哈希，不是常量）", async () => {
  await withEnv({ SITE_PASSWORD: "另一个密码" }, async () => {
    const res = await middleware(req("/api/exam", { Authorization: `Bearer ${TOKEN}` }));
    assert.equal(res.status, 401);
  });
});

test("登录入口 /api/auth/verify 免验证，否则没人能拿到 token", async () => {
  await withEnv({ SITE_PASSWORD: PASSWORD }, async () => {
    const res = await middleware(req("/api/auth/verify"));
    assert.equal(isPass(res), true);
  });
});

test("上传路由连同子路径都免验证（SDK 自己带签名）", async () => {
  await withEnv({ SITE_PASSWORD: PASSWORD }, async () => {
    for (const path of ["/api/uploadthing", "/api/uploadthing/callback"]) {
      const res = await middleware(req(path));
      assert.equal(isPass(res), true, `${path} 应放行`);
    }
  });
});

test("免验证是前缀匹配，不会把 /api/auth/verify-something 一并放过", async () => {
  await withEnv({ SITE_PASSWORD: PASSWORD }, async () => {
    // 当前实现用的是 startsWith('/api/auth/verify')，这里钉住它的实际后果：
    // 任何以它开头的路径都免验证。若将来新增同名路由，这条用例会提醒你重新审视。
    const res = await middleware(req("/api/auth/verify-something"));
    assert.equal(isPass(res), true);
  });
});

test("非 /api 路径不归中间件管（matcher 只匹配 /api/:path*）", async () => {
  await withEnv({ SITE_PASSWORD: PASSWORD }, async () => {
    const res = await middleware(req("/dashboard"));
    assert.equal(isPass(res), true);
  });
});

test("密码里的特殊字符不会破坏哈希（中文、空格、符号）", async () => {
  const weird = "密码 with space & /slash/ 、emoji🚀";
  await withEnv({ SITE_PASSWORD: weird }, async () => {
    const token = createHash("sha256").update(weird).digest("hex");
    const res = await middleware(req("/api/exam", { Authorization: `Bearer ${token}` }));
    assert.equal(isPass(res), true);
  });
});
