import { test } from "node:test";
import assert from "node:assert/strict";

import { apiFetch } from "../api.ts";

/**
 * `apiFetch` 只有 15 行，但它是**所有前端请求的出口**：
 * 少带一个 Authorization，整个应用就只能在本地用；
 * 多带一个，就会把 token 发给不该发的地方。所以值得钉住。
 *
 * 它在 Node 里的分支点是 `typeof window !== "undefined"`，
 * 所以这里要手动把 window / sessionStorage 放上去。
 */

interface Captured {
  url: string;
  init: RequestInit;
}

function withBrowser(token: string | null): { captured: Captured[]; restore: () => void } {
  const captured: Captured[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  const originalWindow = g.window;
  const originalStorage = g.sessionStorage;
  const originalFetch = g.fetch;

  g.window = {};
  g.sessionStorage = {
    getItem: (key: string) => (key === "growthOS_auth_token" ? token : null),
  };
  g.fetch = async (url: string, init: RequestInit) => {
    captured.push({ url, init });
    return new Response("{}", { status: 200 });
  };

  return {
    captured,
    restore: () => {
      g.window = originalWindow;
      g.sessionStorage = originalStorage;
      g.fetch = originalFetch;
    },
  };
}

test("有 token 时自动加 Bearer 头（前端不用每次记得带）", async () => {
  const browser = withBrowser("token-123");
  try {
    await apiFetch("/api/exam", { method: "POST", body: "{}" });
    const headers = browser.captured[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer token-123");
    assert.equal(browser.captured[0].url, "/api/exam");
    assert.equal(browser.captured[0].init.method, "POST");
    assert.equal(browser.captured[0].init.body, "{}");
  } finally {
    browser.restore();
  }
});

test("没有 token 时不带 Authorization（而不是带一个空 Bearer）", async () => {
  const browser = withBrowser(null);
  try {
    await apiFetch("/api/exam");
    const headers = browser.captured[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, undefined);
  } finally {
    browser.restore();
  }
});

test("调用方已有的 header 不会被吞掉", async () => {
  const browser = withBrowser("t");
  try {
    await apiFetch("/api/x", { headers: { "X-Trace": "abc", "Content-Type": "application/json" } });
    const headers = browser.captured[0].init.headers as Record<string, string>;
    assert.equal(headers["X-Trace"], "abc");
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers.Authorization, "Bearer t");
  } finally {
    browser.restore();
  }
});

test("服务端渲染（没有 window）时不抛错，也不带 token", async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const originalWindow = g.window;
  const originalFetch = g.fetch;
  const captured: Captured[] = [];
  delete g.window;
  g.fetch = async (url: string, init: RequestInit) => {
    captured.push({ url, init });
    return new Response("{}");
  };

  try {
    await apiFetch("/api/x");
    assert.equal(captured.length, 1);
    const headers = (captured[0].init.headers ?? {}) as Record<string, string>;
    assert.equal(headers.Authorization, undefined);
  } finally {
    g.window = originalWindow;
    g.fetch = originalFetch;
  }
});
