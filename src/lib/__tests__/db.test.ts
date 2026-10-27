import "fake-indexeddb/auto";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Dexie, { type Table } from "dexie";

// import type 会被类型擦除阶段整段删掉，不会触发模块求值——
// 所以这里可以安全地引用 @/lib/db 的类型，而不破坏「先造老库再加载新库」的顺序。
import type { Card, DailyRecord, DeletedRecord, Habit } from "@/lib/db.ts";

interface GrowthOSDatabaseLike {
  verno: number;
  tables: Table[];
  open(): Promise<unknown>;
  close(): void;
  delete(): Promise<void>;
  cards: Table<Card, string>;
  habits: Table<Habit, string>;
  dailyRecords: Table<DailyRecord, string>;
  deletedRecords: Table<DeletedRecord, string>;
  settings: Table<Record<string, unknown>, string>;
  reviewEvents: Table<Record<string, unknown>, string>;
}

/**
 * 数据层测试。
 *
 * 这是全仓风险最高的模块：它是**用户的全部数据**，而且迁移只跑一次——
 * 跑错了不会报错，只会安静地丢东西。之前 402 行零用例。
 *
 * 难点在于「升级」这件事本身：要验证 v3→v5，必须先真的存在一个 v3 的库。
 * 所以这个文件的结构是刻意的：
 *   1. 先用裸 Dexie 建一个 v3 库并塞进历史数据（脏值）
 *   2. **再**动态 import `@/lib/db`（它一加载就会接管这个同名库）
 *   3. 打开，检查数据被修好了而不是被丢了
 *
 * 静态 import 做不到这一点：ESM 会先把模块全部求值，库还来不及造好。
 */

const DB_NAME = "GrowthOSDatabase";

/** v3 时期的表结构，原样抄一份。改了这里就等于改了历史，别改。 */
const V3_SCHEMA = {
  habits: "id, name, frequency, energyDemand, createdAt",
  habitLogs: "id, habitId, date, createdAt",
  cards: "id, front, back, *tags, reps, interval, ease, nextReview, createdAt",
  dailyRecords: "date, energyLevel, createdAt",
  feynmanRecords: "id, topic, score, createdAt",
  deletedRecords: "id, tableName, deletedAt",
};

let db: GrowthOSDatabaseLike;

before(async () => {
  // ---- 1. 造一个「老用户」的库 ----
  const legacy = new Dexie(DB_NAME);
  legacy.version(3).stores(V3_SCHEMA);
  await legacy.open();

  await legacy.table("cards").bulkAdd([
    {
      id: "legacy-clean",
      front: "干净的老卡",
      back: "答案",
      tags: ["老数据"],
      reps: 3,
      interval: 7,
      ease: 2.5,
      nextReview: new Date("2026-10-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "legacy-dirty",
      front: "脏数据卡",
      back: "答案",
      tags: [],
      // 全是历史遗留的坏值：EF=0、reps=-3、interval=-1
      reps: -3,
      interval: -1,
      ease: 0,
      nextReview: new Date("不是日期"),
      createdAt: new Date("2026-01-02T00:00:00Z"),
    },
    {
      id: "legacy-zero-interval",
      front: "interval 为 0 但有 reps",
      back: "答案",
      tags: [],
      reps: 4,
      interval: 0,
      ease: 2.1,
      nextReview: new Date("2026-10-02T00:00:00Z"),
      createdAt: new Date("2026-01-03T00:00:00Z"),
    },
  ]);

  await legacy.table("habits").add({
    id: "h1",
    name: "早起",
    icon: "Sun",
    frequency: "daily",
    energyDemand: "medium",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });

  legacy.close();

  // ---- 2. 交给被测模块 ----
  const dbModule = await import("@/lib/db.ts");
  db = dbModule.db as unknown as GrowthOSDatabaseLike;
  await db.open();
});

after(() => {
  db?.close();
});

test("老库打开后升到 v5，表全部就位（没有一张表是新建时漏掉的）", () => {
  assert.equal(db.verno, 5);
  const names = db.tables.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "cardCandidates",
    "cards",
    "dailyRecords",
    "deletedRecords",
    "feynmanRecords",
    "habitLogs",
    "habits",
    "projects",
    "reviewEvents",
    "settings",
    "weeklyReviews",
  ]);
});

test("迁移不丢数据：三张老卡一条不少", async () => {
  const count = await db.cards.count();
  assert.equal(count, 3);
  const habitCount = await db.habits.count();
  assert.equal(habitCount, 1);
});

test("脏卡片的 EF / reps / interval 被修成可用值，而不是原样带进新版本", async () => {
  const card = await db.cards.get("legacy-dirty");
  assert.ok(card);
  assert.equal(card!.ease, 2.5, "EF=0 会让 SM-2 算出负间隔，必须回落默认");
  assert.equal(card!.reps, 0);
  assert.equal(card!.interval, 0);
  assert.ok(!Number.isNaN(card!.nextReview.getTime()), "坏日期要落到可用值");
  assert.equal(card!.type, "concept", "老卡没有题型，补默认题型才能进交错练习");
  assert.equal(card!.example, "");
});

test("reps>0 且 interval=0 的历史脏数据被修成 1 天，避免「立刻又到期」的死循环", async () => {
  const card = await db.cards.get("legacy-zero-interval");
  assert.equal(card!.reps, 4);
  assert.equal(card!.interval, 1);
});

test("干净的老卡排期原样保留（迁移不能顺手重置所有人的复习进度）", async () => {
  const card = await db.cards.get("legacy-clean");
  assert.equal(card!.reps, 3);
  assert.equal(card!.interval, 7);
  assert.equal(card!.ease, 2.5);
  assert.equal(card!.nextReview.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("迁移顺手落了默认设置行，让「每日新卡上限」永远有值可读", async () => {
  const settings = await db.settings.get("main");
  assert.ok(settings);
  assert.equal(settings!.dailyNewCardLimit, 2);
  assert.equal(settings!.interleavingEnabled, true);
});

test("再次打开库不会重复迁移、也不会重复插设置行", async () => {
  db.close();
  await db.open();
  assert.equal(await db.settings.count(), 1);
});

// ---------------------------------------------------------------- 写入约定

async function freshDatabase() {
  await db.delete();
  await db.open();
}

test("新建记录自动带 updatedAt（同步靠它做 Last-Write-Wins）", async () => {
  await freshDatabase();
  await db.habits.add({
    id: "h-new",
    name: "喝水",
    icon: "Droplet",
    frequency: "daily",
    energyDemand: "low",
    createdAt: new Date(),
  });

  const habit = await db.habits.get("h-new");
  assert.ok(habit!.updatedAt instanceof Date, "创建时必须自动打时间戳");
});

test("更新记录会把 updatedAt 推到更新，旧值不会一路留着", async () => {
  await freshDatabase();
  await db.habits.add({
    id: "h-2",
    name: "旧名",
    icon: "Sun",
    frequency: "daily",
    energyDemand: "low",
    createdAt: new Date("2020-01-01T00:00:00Z"),
  });
  const before = (await db.habits.get("h-2"))!.updatedAt as Date;

  await new Promise((resolve) => setTimeout(resolve, 5));
  await db.habits.update("h-2", { name: "新名" });

  const after = (await db.habits.get("h-2"))!.updatedAt as Date;
  assert.equal((await db.habits.get("h-2"))!.name, "新名");
  assert.ok(after.getTime() > before.getTime(), "updatedAt 必须变新，否则同步会判错赢家");
});

test("复习事件流是 append-only，刻意不挂 updatedAt（挂了就等于允许改写历史）", async () => {
  await freshDatabase();
  await db.reviewEvents.add({
    id: "ev-1",
    cardId: "c-1",
    at: Date.now(),
    rating: 4,
    type: "concept",
  } as never);

  const event = (await db.reviewEvents.get("ev-1")) as Record<string, unknown>;
  assert.equal(event.updatedAt, undefined);
});

// ---------------------------------------------------------------- upsertDailyRecord

test("upsertDailyRecord 只改提到的那一个字段，其余原样保留", async () => {
  await freshDatabase();
  const { upsertDailyRecord } = await import("@/lib/db.ts");

  await upsertDailyRecord("2026-10-27", {
    woopWish: "写完方案",
    woopObstacle: "手机",
    energyLevel: 7,
  });
  const merged = await upsertDailyRecord("2026-10-27", { energyLevel: 3 });

  assert.equal(merged.woopWish, "写完方案", "改能量不该把 WOOP 愿望冲掉");
  assert.equal(merged.woopObstacle, "手机");
  assert.equal(merged.energyLevel, 3);
});

test("upsertDailyRecord 保留首次创建时间（它标记「这一天什么时候开始的」）", async () => {
  await freshDatabase();
  const { upsertDailyRecord } = await import("@/lib/db.ts");

  const first = await upsertDailyRecord("2026-10-26", { energyLevel: 5 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await upsertDailyRecord("2026-10-26", { energyLevel: 6 });

  assert.equal(second.createdAt.getTime(), first.createdAt.getTime());
});

test("upsertDailyRecord 对不存在的日期会补 createdAt，不会写出半条记录", async () => {
  await freshDatabase();
  const { upsertDailyRecord } = await import("@/lib/db.ts");

  const record = await upsertDailyRecord("2026-01-01", {});
  assert.equal(record.date, "2026-01-01");
  assert.ok(record.createdAt instanceof Date);
  assert.equal((await db.dailyRecords.get("2026-01-01"))!.date, "2026-01-01");
});

// ---------------------------------------------------------------- 其它助手

test("trackDeletion 在服务端（没有 window）直接跳过，不写库也不抛错", async () => {
  await freshDatabase();
  const { trackDeletion } = await import("@/lib/db.ts");
  await trackDeletion("cards", "c-x");
  assert.equal(await db.deletedRecords.count(), 0);
});

test("trackDeletion 在浏览器里记一条墓碑，供同步时把删除推给云端", async () => {
  await freshDatabase();
  const g = globalThis as unknown as Record<string, unknown>;
  const originalWindow = g.window;
  g.window = {};
  try {
    const { trackDeletion } = await import("@/lib/db.ts");
    await trackDeletion("cards", "c-x");

    const tombstone = await db.deletedRecords.get("c-x");
    assert.ok(tombstone, "墓碑必须写进去，否则云端永远不知道这张卡被删了");
    assert.equal(tombstone!.tableName, "cards");
  } finally {
    g.window = originalWindow;
  }
});
