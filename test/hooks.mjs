/**
 * 测试进程的模块解析钩子
 *
 * 为什么需要它：源码是按 **webpack / Turbopack 的规矩**写的——
 * `@/lib/db` 这种别名、`./adapters` 这种省略扩展名的相对导入，两种都能被 Next 解析，
 * 但 Node 的 ESM 解析器一个都不认。于是「路由能不能被测试」在很长一段时间里的答案是不能：
 * 想测 `src/app/api/exam/route.ts`，它第一行 `import { NextResponse } from "next/server"`
 * 就抛 ERR_MODULE_NOT_FOUND（Next 的 exports 只映射了 `next/server.js`）。
 *
 * 这个钩子只做三件事，都在解析阶段，不改任何源码：
 *   1. `@/x`        → `<repo>/src/x`（自动补 .ts / .tsx / /index.ts）
 *   2. `./x`        → 补扩展名后重试一次
 *   3. `next/server`→ `next/server.js`（打包器的隐式补全）
 *
 * 刻意不设 `format`：交给 `--experimental-strip-types` 判定，
 * 手动指定 "module" 会让 .ts 跳过类型擦除而直接语法报错。
 */
import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(import.meta.dirname, "..", "src");
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"];

function findFile(base) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // 不存在就试下一个后缀
    }
  }
  return null;
}

function asModule(url) {
  return { url, shortCircuit: true };
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // 1. 路径别名
    if (specifier.startsWith("@/")) {
      const hit = findFile(path.join(SRC, specifier.slice(2)));
      if (hit) return asModule(pathToFileURL(hit).href);
    }

    // 2. 省略扩展名的相对导入
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      try {
        return nextResolve(specifier, context);
      } catch (err) {
        if (err?.code !== "ERR_MODULE_NOT_FOUND" || !context.parentURL) throw err;
        const parentDir = path.dirname(fileURLToPath(context.parentURL));
        const hit = findFile(path.resolve(parentDir, specifier));
        if (hit) return asModule(pathToFileURL(hit).href);
        throw err;
      }
    }

    // 3. 裸包：打包器默认补 .js 的那些（next/server → next/server.js）
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err?.code === "ERR_MODULE_NOT_FOUND" && !specifier.startsWith("node:")) {
        return nextResolve(`${specifier}.js`, context);
      }
      throw err;
    }
  },
});
