#!/usr/bin/env node
/**
 * 测试总入口
 *
 * 存在的理由不是「把 node --test 包一层好看点」，而是补上 node --test 不肯管的四件事：
 *
 * 1. **零用例必须失败。**
 *    `node --test "src/**\/__tests__/*.test.ts"` 在匹配不到任何文件时**退出码为 0**。
 *    也就是说：目录从 __tests__ 改了名、或者通配符少写一个字符，
 *    CI 会亮绿灯并报告「0 个失败」。这是测试系统最危险的一种坏法——它看起来是好的。
 *
 * 2. **没人 import 的模块不会出现在覆盖率里。**
 *    覆盖率只统计「跑过的文件」。一个从没被任何测试加载的模块在报告里根本不存在，
 *    而报告照样写着 100%。这里用 lcov 反查实际加载了哪些文件，
 *    对 `src/lib`、`src/app/api`、`src/middleware.ts` 逐个点名核对。
 *
 * 3. **用例总数只许涨。**
 *    删测试比加测试容易。设一个下限，删了就红。
 *
 * 4. **一句话结论。**
 *    失败时直接说清哪条闸门没过，而不是让人在几百行输出里翻。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * 闸门参数。
 *
 * minTests 只加不减：新增用例后把这里的数字抄成最新值，
 * 它就会一路把「测试被悄悄删掉」挡在 CI 上。
 * 2026-10-28：351 → 350，删除 estimateMinutes 的用例（函数本体一并移除，见
 * contexts/upgrade-plan-learning-methods.md 偏差记录）。
 */
const GATES = {
  minTests: 350,
  minLines: 95,
};

/** 必须被至少一个用例真正执行过的模块（不是被 mock 掉，是跑过） */
const MUST_EXECUTE = {
  include: ["src/lib/**/*.ts", "src/app/api/**/route.ts", "src/middleware.ts"],
  /** 豁免清单。每条都要写理由，否则半年后没人敢删。 */
  exempt: {
    "src/lib/supabase.ts": "模块加载时按环境变量决定导出 client 还是 null，一个进程只能验一侧；9 行无分支逻辑。",
    "src/lib/learning/use-daily-queue.ts": "React hook，需要 renderer 才能执行；它只是把已测过的 queue.ts 结果接进组件。",
    "src/lib/learning/types.ts": "纯类型文件，运行时常量由引用它的模块间接覆盖。",
  },
};

const flags = new Set(process.argv.slice(2));
const withCoverage = !flags.has("--no-coverage");

// ---------------------------------------------------------------- 找测试文件

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const toRel = (file) => path.relative(ROOT, file).split(path.sep).join("/");

const SRC_DIR = path.join(ROOT, "src");

const testFiles = (existsSync(SRC_DIR) ? walk(SRC_DIR) : [])
  .filter((file) => {
    const rel = toRel(file);
    return rel.includes("/__tests__/") && rel.endsWith(".test.ts");
  })
  .sort();

if (testFiles.length === 0) {
  console.error(
    "\n✖ 一个测试文件都没找到。\n" +
      "  约定：测试放在 <模块目录>/__tests__/*.test.ts。\n" +
      "  如果你刚搬过目录，该改的是这里，不是关掉检查。\n",
  );
  process.exit(1);
}

// ---------------------------------------------------------------- 跑

const workDir = mkdtempSync(path.join(tmpdir(), "gos-test-"));
const tapPath = path.join(workDir, "report.tap");
const lcovPath = path.join(workDir, "coverage.lcov");

const nodeArgs = [
  ...(withCoverage
    ? [
        "--experimental-test-coverage",
        "--test-coverage-exclude=**/__tests__/**",
        "--test-coverage-exclude=test/**",
        "--test-coverage-exclude=node_modules/**",
        "--test-reporter=lcov",
        `--test-reporter-destination=${lcovPath}`,
      ]
    : []),
  "--test-reporter=spec",
  "--test-reporter-destination=stdout",
  "--test-reporter=tap",
  `--test-reporter-destination=${tapPath}`,
  "--test-timeout=20000",
  "--test",
  ...testFiles.map(toRel),
];

const env = {
  ...process.env,
  // 这两个 flag 必须经 NODE_OPTIONS 下发：--test 会为每个测试文件起子进程，
  // 只有 NODE_OPTIONS 才会被继承，直接写在命令行上会随父进程止步。
  NODE_OPTIONS: [
    "--experimental-strip-types",
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--import ./test/hooks.mjs",
  ].join(" "),
};

const started = Date.now();
const child = spawn(process.execPath, nodeArgs, { cwd: ROOT, env, stdio: "inherit" });
const nodeExit = await new Promise((resolve) => child.on("close", resolve));
const elapsed = Date.now() - started;

// ---------------------------------------------------------------- 读结果

function readTapSummary() {
  const tap = existsSync(tapPath) ? readFileSync(tapPath, "utf8") : "";
  const pick = (label) => {
    const match = tap.match(new RegExp(`^# ${label} (\\d+)$`, "m"));
    return match ? Number(match[1]) : null;
  };
  return { tests: pick("tests"), pass: pick("pass"), fail: pick("fail") };
}

/** lcov → { 文件: {found, hit} }，顺带算总行数 */
function readLcov() {
  const files = new Map();
  let linesFound = 0;
  let linesHit = 0;
  if (!existsSync(lcovPath)) return { files, linesFound, linesHit };

  let current = null;
  for (const line of readFileSync(lcovPath, "utf8").split("\n")) {
    if (line.startsWith("SF:")) {
      current = toRel(path.resolve(ROOT, line.slice(3)));
      files.set(current, { found: 0, hit: 0 });
    } else if (current && line.startsWith("LF:")) {
      const found = Number(line.slice(3));
      files.get(current).found = found;
      linesFound += found;
    } else if (current && line.startsWith("LH:")) {
      const hit = Number(line.slice(3));
      files.get(current).hit = hit;
      linesHit += hit;
    }
  }
  return { files, linesFound, linesHit };
}

/** 把 `src/lib/**\/*.ts` 这类通配展开成确定的文件清单 */
function expand(pattern) {
  const star = pattern.indexOf("*");
  if (star === -1) return [pattern];
  const prefix = pattern.slice(0, star).replace(/\/$/, "");
  const suffix = pattern.slice(pattern.lastIndexOf("*") + 1);
  const base = path.join(ROOT, prefix);
  if (!existsSync(base)) return [];
  return walk(base)
    .map(toRel)
    .filter((rel) => rel.endsWith(suffix) && !rel.includes("/__tests__/"));
}

const required = new Set();
for (const pattern of MUST_EXECUTE.include) {
  for (const rel of expand(pattern)) required.add(rel);
}
for (const exempted of Object.keys(MUST_EXECUTE.exempt)) required.delete(exempted);

const coverage = readLcov();
const coverageMissing = withCoverage && coverage.files.size === 0;
const missing = coverageMissing
  ? []
  : [...required].filter((rel) => !coverage.files.has(rel)).sort();

const summary = readTapSummary();
const problems = [];

if (summary.tests === null) {
  problems.push("拿不到用例统计（TAP 报告为空）：进程可能在启动阶段就崩了。");
} else {
  if (summary.fail > 0) problems.push(`${summary.fail} 个用例失败。`);
  if (summary.tests < GATES.minTests) {
    problems.push(
      `用例数 ${summary.tests} 低于下限 ${GATES.minTests}。测试被删了？` +
        "确实要降门槛就改 scripts/test-run.mjs 的 GATES.minTests。",
    );
  }
}

if (coverageMissing) {
  // 覆盖率文件没生成，多半是 node 在启动阶段就崩了。
  // 这时「30 个模块没被执行」是误报，会把人带偏，所以单独说清楚。
  problems.push("没有生成覆盖率报告：测试进程可能没跑起来（先看上面的输出）。");
}

if (withCoverage && !coverageMissing && missing.length > 0) {
  problems.push(
    `${missing.length} 个模块没有任何用例执行过：\n` +
      missing.map((rel) => `      · ${rel}`).join("\n") +
      "\n      要么给它们写测试，要么加进 MUST_EXECUTE.exempt 并写清理由。",
  );
}
const linePct = coverage.linesFound > 0 ? (coverage.linesHit / coverage.linesFound) * 100 : 0;
if (withCoverage && coverage.linesFound > 0 && linePct < GATES.minLines) {
  problems.push(
    `行覆盖率 ${linePct.toFixed(2)}% 低于下限 ${GATES.minLines}%（口径：被加载过的源码）。`,
  );
}

if (nodeExit !== 0 && problems.length === 0) {
  problems.push(`node --test 退出码 ${nodeExit}，但没解析出具体原因。`);
}

// ---------------------------------------------------------------- 结论

const rule = "─".repeat(66);
console.log(`\n${rule}`);
if (problems.length === 0) {
  const tail = withCoverage
    ? `${coverage.files.size} 个源文件被执行 · 行覆盖 ${linePct.toFixed(1)}% · ` +
      `必测模块 ${required.size} 个全部命中 · `
    : "（跳过覆盖率与必测模块检查） · ";
  console.log(
    `✔ ${summary.pass} 个用例通过 · ${testFiles.length} 个测试文件 · ` +
      `${tail}${(elapsed / 1000).toFixed(1)}s`,
  );
} else {
  console.log(`✖ 测试闸门未通过（${problems.length} 项）`);
  for (const problem of problems) console.log(`  - ${problem}`);
  if (withCoverage) console.log(`  必测模块 ${required.size} 个，未执行 ${missing.length} 个`);
}
console.log(rule);

rmSync(workDir, { recursive: true, force: true });
process.exit(problems.length === 0 ? 0 : 1);
