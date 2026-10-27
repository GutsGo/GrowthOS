/**
 * AI 调用层（服务端专用）
 *
 * 为什么要把这段抽出来：改造前 4 个 API 路由各自复制了同一段 20 行代码
 * （深寻优先、OpenAI 兜底、拼 URL、拼 headers、response_format），
 * 于是「加一个超时」需要改 4 个文件，而漏改一个就是一条会挂死的路径。
 *
 * 这里只做三件事，并且每件都做到底：
 * 1. 解析 provider。**没配 Key 不是错误**，是一种正常状态，
 *    调用方据此走本地降级，而不是给用户看一个 500。
 * 2. 超时。原来的实现没有任何超时，模型卡住时前端就一直转圈，
 *    用户唯一的出路是刷新页面——那时刚写的字全丢了。
 * 3. 解析 JSON。模型经常在 JSON 前后加 ```json 或者一句「好的，以下是…」，
 *    严格 JSON.parse 会失败，于是只好整个降级。这里做一次容错提取。
 *
 * 刻意不做的：不重试、不做流式、不做多轮工具调用。
 * 这三个能力都会让「AI 是不是在替用户思考」变得难以说清，
 * 而本项目对 AI 的定位只有一个：**当追问者，不当替身和裁判**。
 */

export type ProviderName = "deepseek" | "openai" | "none";

export interface ProviderConfig {
  name: ProviderName;
  apiKey: string;
  apiBase: string;
  model: string;
}

type EnvLike = Record<string, string | undefined>;

/**
 * 按「显式配置优先」的顺序选 provider。
 *
 * 深寻在前是因为这个项目默认用它（便宜、中文好）；
 * 但**不硬编码模型名**——模型换代很快，写死会让一年后的构建还在请求一个下线的模型。
 */
export function resolveProvider(env: EnvLike = process.env): ProviderConfig {
  const deepseekKey = env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    return {
      name: "deepseek",
      apiKey: deepseekKey,
      // 去掉**所有**结尾斜杠，不只是最后一个：手滑粘成 `.../v1//` 时，
      // 只去一个会拼出 `.../v1///chat/completions`，部分网关会直接 404。
      apiBase: (env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com/v1").replace(
        /\/+$/,
        "",
      ),
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
    };
  }

  const openaiKey = env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      name: "openai",
      apiKey: openaiKey,
      apiBase: (env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(
        /\/+$/,
        "",
      ),
      model: env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }

  return { name: "none", apiKey: "", apiBase: "", model: "" };
}

export type ChatFailure = "no_key" | "timeout" | "network" | "http" | "parse";

export interface ChatOk {
  ok: true;
  data: unknown;
}
export interface ChatErr {
  ok: false;
  failure: ChatFailure;
  /** 给日志看的细节，不要直接展示给用户 */
  detail?: string;
}
export type ChatResult = ChatOk | ChatErr;

/**
 * 25 秒。
 *
 * 复习和输出都是「人正在屏幕前等着」的场景，超过半分钟等不到答案，
 * 用户会开始怀疑是不是自己点错了。超时后走降级，比让他干等有用。
 */
export const AI_TIMEOUT_MS = 25_000;

/**
 * 从模型输出里抠出 JSON。
 *
 * 三种常见形态都要能处理：
 * - 纯 JSON
 * - ```json ... ``` 包裹
 * - 「好的，以下是结果：{...}」前后带话
 *
 * 先按括号找最外层的一对，而不是用贪婪正则——贪婪正则会从第一个 `{`
 * 一路吃到最后一个 `}`，遇到「正文里含 `}`」就切坏。
 */
export function extractJson(content: string): unknown | null {
  const text = content.trim();
  if (!text) return null;

  // 1. 直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续尝试
  }

  // 2. 去掉代码块围栏
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // 继续尝试
    }
  }

  // 3. 按花括号配对截取
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export interface ChatJSONOptions {
  system: string;
  user: string;
  temperature?: number;
  /** 单次输出上限。追问类任务只需要一两句话，给太多额度反而让模型啰嗦 */
  maxTokens?: number;
}

/**
 * 调用一次 chat completions 并拿到**已解析的对象**。
 * 所有失败都返回结构化结果，不抛异常——调用方永远有降级路径可走。
 *
 * 一个实战细节：`response_format: json_object` 并不是所有代理/网关都支持，
 * 不支持的会直接回 400。第一版在这里踩过——明明配了 Key、模型也通，
 * 却永远走降级。所以 HTTP 失败时会**去掉 json 模式重试一次**，
 * 反正我们本来就自己解析 JSON。
 */
export async function chatJSON(
  options: ChatJSONOptions,
): Promise<ChatResult> {
  const provider = resolveProvider();
  if (provider.name === "none") {
    return { ok: false, failure: "no_key" };
  }

  const call = async (jsonMode: boolean): Promise<ChatResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const response = await fetch(`${provider.apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: options.system },
            { role: "user", content: options.user },
          ],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 600,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          ok: false,
          failure: "http",
          detail: `${response.status} ${await response
            .text()
            .catch(() => "")}`.slice(0, 400),
        };
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        return { ok: false, failure: "parse", detail: "empty content" };
      }

      const data = extractJson(content);
      if (data === null) {
        return { ok: false, failure: "parse", detail: content.slice(0, 400) };
      }
      return { ok: true, data };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        failure: aborted ? "timeout" : "network",
        detail: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  };

  let result = await call(true);
  if (!result.ok && result.failure === "http") {
    result = await call(false);
  }

  if (!result.ok) {
    // 只写服务端日志：里面有 base URL、状态码、上游报错片段。
    // 不要回给客户端——那对用户没有用，对攻击者倒是有用。
    console.warn(`[ai] ${provider.name} 调用失败：${result.failure}`, result.detail);
  }

  return result;
}
