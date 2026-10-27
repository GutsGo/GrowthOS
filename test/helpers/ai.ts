/**
 * 假的 AI 上游（OpenAI 兼容）
 *
 * 为什么不去 mock `chatJSON`：那样测出来的是「路由在假定 AI 返回某结构时怎么拼字段」，
 * 而真正会坏的地方全在两者之间——超时、网关不认 `response_format`、模型把 JSON 包在
 * ```json 里、返回 200 但 content 是空串。这些只能在**HTTP 这一层**制造。
 *
 * 所以这里替换的是全局 `fetch`：整条链路（route → provider → fetch）原样跑一遍，
 * 只有最后一跳是假的。断言因此有两类，都很值钱：
 *   - 出口：HTTP 响应体是不是用户该看到的样子
 *   - 上游：实际发出去的 model / temperature / max_tokens / response_format 对不对
 *
 * 每个用例必须 `restore()`（或交给 `t.after`）。测试文件之间是独立进程，
 * 但同一文件内的用例共享进程，不还原就会串味。
 */

export interface UpstreamCall {
  url: string;
  /** 已解析的请求体（不是字符串，省得每个断言都 JSON.parse） */
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface Reply {
  /** HTTP 状态码，默认 200 */
  status?: number;
  /** 按 OpenAI 的形状返回：{"choices":[{"message":{"content": ...}}]} */
  content?: string;
  /** 直接把对象塞进 content（省掉手写 JSON 字符串） */
  json?: unknown;
  /** 绕过 OpenAI 形状，直接给 HTTP body 原文 */
  rawBody?: string;
  /** 让 fetch 抛错，模拟 DNS / 断网 */
  throws?: Error;
  /** 永不 resolve，只有 signal abort 时才抛 AbortError —— 用来测 25 秒超时 */
  hangs?: boolean;
}

export interface Upstream {
  calls: UpstreamCall[];
  /** 第 n 次调用是否带了 response_format（越界返回 undefined） */
  usedJsonMode(index: number): boolean | undefined;
  restore(): void;
}

function openAiBody(reply: Reply): string {
  if (reply.rawBody !== undefined) return reply.rawBody;
  const content =
    reply.content !== undefined
      ? reply.content
      : JSON.stringify(reply.json ?? {});
  return JSON.stringify({ choices: [{ message: { content } }] });
}

/**
 * 安装假上游。传数组表示「第一次调用回第一个，第二次回第二个」，
 * 用超了直接抛错——脚本外的调用一定是测试写漏了，别让它悄悄返回默认值。
 */
export function installUpstream(script: Reply | Reply[]): Upstream {
  const queue = Array.isArray(script) ? [...script] : [script];
  const calls: UpstreamCall[] = [];
  const original = globalThis.fetch;

  const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawBody = typeof init?.body === "string" ? init.body : "";
    calls.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {},
      headers: (init?.headers ?? {}) as Record<string, string>,
    });

    const reply = queue.shift();
    if (!reply) {
      throw new Error(
        `假上游被调用了 ${calls.length} 次，但只准备了 ${calls.length - 1} 个响应。` +
          "要么补一个 Reply，要么这个用例本不该发起第二次请求。",
      );
    }

    if (reply.hangs) {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => {
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    }

    if (reply.throws) throw reply.throws;

    return new Response(openAiBody(reply), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  globalThis.fetch = stub as typeof fetch;

  return {
    calls,
    usedJsonMode(index) {
      const call = calls[index];
      if (!call) return undefined;
      return Boolean(call.body.response_format);
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

/** 便捷构造：模型正常回答一个 JSON 对象 */
export function aiJson(value: unknown): Reply {
  return { json: value };
}

/** 便捷构造：网关不认 json 模式，直接 400 */
export function aiBadRequest(message = "response_format is not supported"): Reply {
  return { status: 400, rawBody: JSON.stringify({ error: { message } }) };
}
