/**
 * 调用 route handler 的两个小工具
 *
 * Next 的 route handler 就是一个 `(req: Request) => Response` 的普通函数，
 * 所以不需要起服务器：直接构造 `Request` 递进去，把 `Response` 读出来。
 * 这样测的是真正部署时跑的那段代码，而不是它的副本。
 */

/** 构造一个 JSON POST 请求（大多数路由只要 body） */
export function jsonPost(body: unknown, init: { url?: string; headers?: Record<string, string> } = {}): Request {
  return new Request(init.url ?? "http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init.headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** 读 JSON 响应体。类型交给调用方断言，这里不做形状猜测 */
export async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

/** 断言辅助：取出 JSON 里的数组字段并保证是数组（避免 `unknown` 到处转） */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}
