# 测试系统

> 这份文档解释的不是「有哪些测试」，而是**为什么测试会在该红的时候红**。
> 用例会过时，闸门不会。

---

## 一、体检结果：绿得很安心，但绿得没有意义

改造前：202 个用例，全绿，0.4 秒跑完。看起来很健康。实际查下来的情况是：

| 症状 | 后果 |
|---|---|
| 202 个用例**全部**落在 `src/lib/learning/` | 算法层有人盯，数据层、AI 层、接口层、鉴权层全靠肉眼 |
| `src/lib/db.ts`（402 行，用户全部数据）零用例 | 迁移写错了不会报错，只会安静地丢东西 |
| 6 个 API 路由（约 1000 行）零用例 | 降级路径、400 校验、prompt 拼装全靠跑一遍真接口才发现 |
| `src/middleware.ts`（全站唯一的锁）零用例 | 改一个豁免前缀，`/api` 就裸奔，测试照样全绿 |
| 覆盖率报告显示 78% | **这个数字是假的**：覆盖率只统计「跑过的文件」，从没被 import 的模块在报告里根本不存在 |

最后一条最要命。实测过：

```bash
node --experimental-test-coverage --test-coverage-include='src/lib/ai/provider.ts' \
     --test src/lib/learning/__tests__/sm2.test.ts
# all files | 100.00 | 100.00 | 100.00
```

`provider.ts` 一个用例都没有，报告说整体 100%。**覆盖率不会告诉你什么没被覆盖，只会告诉你什么被覆盖了。**

还有一个更隐蔽的：`node --test "src/**/__tests__/*.test.ts"` 在**匹配不到任何文件时退出码是 0**。
目录改名、通配符少一个字符、CI 上 shell 不吃引号——任何一种都会让流水线亮绿灯并报告「0 个失败」。

---

## 二、五道闸门

`pnpm test` 背后是 `scripts/test-run.mjs`。它跑完 `node --test` 之后，还要过五关：

| # | 闸门 | 拦住的情况 | 失败时的提示 |
|---|---|---|---|
| 1 | **找不到测试文件 → 失败** | 目录改名 / 通配符写错 / 分支上没有测试 | 「一个测试文件都没找到」 |
| 2 | **用例数 < 下限 → 失败** | 删测试比写测试容易 | 「用例数 341 低于下限」 |
| 3 | **有失败用例 → 失败** | 常规失败 | TAP 里逐个列出 |
| 4 | **必测模块没被执行 → 失败** | 新增模块没人测；或者测试被删到某个模块没人 import | 直接把文件路径列出来 |
| 5 | **行覆盖率 < 下限 → 失败** | 大段分支没走到 | 报百分比 |

第 4 条是这套系统里最有价值的一条，也是覆盖率永远给不了的那条。

实现方式：用 `--test-reporter=lcov` 导出一份报告，把 `SF:` 行解析成「本次真正执行过的文件集合」，
再和 `MUST_EXECUTE.include` 声明的清单做差集。

```js
const MUST_EXECUTE = {
  include: ["src/lib/**/*.ts", "src/app/api/**/route.ts", "src/middleware.ts"],
  exempt: { "src/lib/supabase.ts": "…理由…" },
};
```

**新增一个 `src/lib` 模块、又没写测试 → 这条闸门会红，并告诉你文件名。**
不想测就得往 `exempt` 里加，而加的时候必须写理由。半年后有人想删豁免，会先读到那条理由。

### 闸门本身也验过

不是「写完看着像对」。三个变体脚本各制造一种塌陷：

| 变体 | 制造的问题 | 结果 |
|---|---|---|
| A | 把 `src` 换成一个不存在的目录 | `✖ 一个测试文件都没找到`，退出码 1 |
| B | `minTests` 改成 99999 | `✖ 用例数 341 低于下限 99999`，退出码 1 |
| C | 往必测清单塞一个没人 import 的文件 | `✖ 1 个模块没有任何用例执行过`，退出码 1 |

---

## 三、三层结构

```
src/**/__tests__/*.test.ts        用例（与被测模块同目录）
test/hooks.mjs                    模块解析钩子（@/ 别名、省略扩展名、next/server.js）
test/helpers/ai.ts                假的 OpenAI 兼容上游
test/helpers/env.ts               环境变量临时改写，出来一定还原
test/helpers/http.ts              构造 Request / 读 Response
scripts/test-run.mjs              统一入口 + 五道闸门
```

### 第一层：纯函数

原来的 202 个用例，原样保留。SM-2 四档间隔、队列配额、交错排布、LCS 相似度、契约归一化。
它们快、稳、不依赖任何环境，是回归的第一道网。

### 第二层：路由集成（真 handler + 真 provider，只有最后一跳是假的）

这是这次新增的主体。**不去 mock `chatJSON`**，而是替换全局 `fetch`：

```
route handler → chatJSON → resolveProvider → fetch（假）
```

好处是测出来的是**部署时真正跑的那条链路**，而不是它的副本。断言因此分两类：

- **出口**：客户拿到的是 `{question, done, fallback}` 还是 400；
- **上游**：实际发出去的 `model` / `temperature` / `max_tokens` / `response_format` 对不对。

```ts
const upstream = installUpstream([aiBadRequest(), aiJson({ healed: true })]);
const res = await POST(jsonPost({ front: "…", back: "…" }));
assert.equal(upstream.usedJsonMode(1), false); // 重试必须去掉 response_format
```

`installUpstream` 的脚本用完就会抛错，而不是悄悄返回默认值——脚本外的调用一定是用例写漏了。

能这么写的前提是 `provider.ts` 的两个性质：`resolveProvider()` 每次调用时读 `process.env`，
`chatJSON` 用全局 `fetch`。这两条让「一个 Key 都没配」和「网关不认 json 模式」都变成了可构造的输入。

### 第三层：数据层（真 Dexie + 内存版 IndexedDB）

`db.test.ts` 的结构是刻意的：

1. 先用裸 `Dexie` 建一个 **v3 的老库**，塞进脏数据（EF=0、reps=-3、interval=0 但 reps>0、坏日期）
2. **再**动态 `import("@/lib/db.ts")`——它一加载就会接管这个同名库
3. 打开，检查数据是**被修好了**而不是**被丢了**

静态 import 做不到：ESM 会先把模块求值完，库还来不及造。所以这里用 `await import()`。
而 `import type { Card } from "@/lib/db"` 可以静态写——类型擦除阶段整段删掉，不触发求值。

---

## 四、写一个用例的约定

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../exam/route.ts";              // 相对路径带 .ts
import { installUpstream, aiJson } from "../../../../test/helpers/ai.ts";
import { withDeepSeek, withNoAi } from "../../../../test/helpers/env.ts";
import { jsonPost, readJson } from "../../../../test/helpers/http.ts";
```

三条硬规矩：

1. **路径写 `.ts`**。TypeScript 允许（`allowImportingTsExtensions` 已开），Node 的类型擦除需要它。
   `@/` 别名也能用，钩子会补扩展名——但测试里优先相对路径，跳转更直接。
2. **改环境变量走 `withEnv` / `withDeepSeek` / `withNoAi`**。不要直接 `process.env.X = ...`：
   一个用例忘了还原，后面所有「没配 Key 应该降级」的用例都会静默失真。
3. **替换全局 fetch 之后一定 `restore()`**，最好放 `finally`。测试文件之间是独立进程，
   同一文件内的用例却共享进程。

命名上：用例名写**行为**和**理由**，不写实现。
`"模型返回合法 JSON 但一个任务都没有 → 等同失败，回退本地"` 比 `"test normalizeTaskDrafts empty"` 有用得多，
因为半年后失败时，你读到的是「这里为什么重要」而不是「哪个函数坏了」。

---

## 五、这套系统已经抓到的两个真问题

不是演练，是用例第一次跑就红的两个地方。

**1. `resolveProvider` 只去掉了一个结尾斜杠。**
`DEEPSEEK_API_BASE_URL=https://proxy.test/v1//` 会拼出 `.../v1///chat/completions`，部分网关直接 404。
改成 `.replace(/\/+$/, "")`。

**2. 降级追问里有句话不是问句。**
`GENERIC_PROBES` 第三条是「举一个你自己遇到过的例子。」——句号结尾。
而 prompt 对追问的硬要求是「以问号结尾」。降级文案自己违反了规格，
候选池里会出现一条陈述句，用户会以为那是提示而不是要他回答的题。

两条都是「跑一百次也不会报错」的类型，只会在用户那边表现为「有点怪」。

---

## 六、没覆盖的部分，以及为什么

**组件层（`src/components/**`，约 8000 行）零单测。**

不是遗漏，是权衡：30 多个组件都是 `"use client"` + hooks + framer-motion，
要测就得引入 jsdom + Testing Library + JSX 编译链（`node --test` 的类型擦除**不转 JSX**）。
那套依赖的维护成本，会超过它对这样一个单人项目的收益。

代价要说清楚：**改样式、改渲染分支，测试不会拦你。** 那部分靠的是浏览器里看一眼 +
`npm run build` 能不能过。如果这个项目开始有多人协作，第一件该补的就是
「五个页面能渲染出来」的 smoke 测试——那是性价比最高的起点，而不是给每个按钮写断言。

**`src/lib/supabase.ts`（9 行）与 `use-daily-queue.ts`（React hook）在豁免清单里**，理由写在 `MUST_EXECUTE.exempt`。

---

## 七、当前数字

| 项 | 值 |
|---|---|
| 用例 | **351**（31 个文件） |
| 耗时 | 约 1 秒（含覆盖率） |
| 必测模块 | 31 个，**全部被执行** |
| 行覆盖 | 97.3%（口径：被加载过的源码） |
| 分支覆盖 | 90.5% |

跑法：

```bash
pnpm test           # 全套 + 覆盖率 + 五道闸门
pnpm test:fast      # 跳过覆盖率，0.6s，日常改代码时用
pnpm test:watch     # 监听模式
pnpm run check      # typecheck + lint + test，提交前跑这个
```

CI 在 `.github/workflows/ci.yml`，四步按「便宜的先跑」排序：类型 → lint → 测试 → 构建。
