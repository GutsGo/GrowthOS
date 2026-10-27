/**
 * 环境变量临时改写
 *
 * `resolveProvider` 是**每次调用时**读 `process.env` 的（不是模块加载时），
 * 这是它能在测试里被控制的前提。但前提归前提，用起来还是得有人负责还原——
 * 一个用例忘了删 Key，后面所有「没配 Key 应该降级」的用例都会静默失真。
 *
 * 所以统一走这里：进去改，出来一定还原，抛异常也还原。
 */

type Patch = Record<string, string | undefined>;

const AI_KEYS = ["DEEPSEEK_API_KEY", "OPENAI_API_KEY"] as const;

/** 记录当前值 → 应用 patch（值为 undefined 表示删除）→ 执行 fn → 还原 */
export async function withEnv<T>(patch: Patch, fn: () => Promise<T> | T): Promise<T> {
  const snapshot = new Map<string, string | undefined>();
  for (const key of Object.keys(patch)) snapshot.set(key, process.env[key]);

  try {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await fn();
  } finally {
    for (const [key, value] of snapshot) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * 「一个 AI 服务都没配」的状态。
 *
 * 显式删掉两个 Key，而不是指望它们天然不存在——
 * 否则一个导出了 OPENAI_API_KEY 的终端会让整套降级用例的语义反过来。
 */
export function withNoAi<T>(fn: () => Promise<T> | T): Promise<T> {
  const patch: Patch = {};
  for (const key of AI_KEYS) patch[key] = undefined;
  return withEnv(patch, fn);
}

/** 只配 DeepSeek（项目默认），且 base URL 指向一个不会真的被请求的地址 */
export function withDeepSeek<T>(
  fn: () => Promise<T> | T,
  extra: Patch = {},
): Promise<T> {
  const patch: Patch = {
    DEEPSEEK_API_KEY: "sk-test-deepseek",
    DEEPSEEK_API_BASE_URL: "https://fake-upstream.test/v1",
    DEEPSEEK_MODEL: "test-model",
    OPENAI_API_KEY: undefined,
    ...extra,
  };
  return withEnv(patch, fn);
}
