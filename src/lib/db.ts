import Dexie, { type Table } from "dexie";
import type { HabitCustomData } from "./habit-data";
import { normalizeCardForV4 } from "./learning/adapters";
import type { CardCandidate } from "./learning/probe";
import {
  DEFAULT_LEARNING_SETTINGS,
  SETTINGS_ROW_ID,
  type CardType,
  type LearningSettings,
  type Project,
  type ReviewEvent,
  type WeeklyReview,
} from "./learning/types";

// 习惯配置接口
export interface Habit {
  id: string;
  name: string;
  icon: string;
  frequency: "daily" | "weekly";
  energyDemand: "high" | "medium" | "low"; // 能量需求：高、中、低
  createdAt: Date;
  updatedAt?: Date;              // 增量同步：最后更新时间
  isDeleted?: boolean;           // 增量同步：是否逻辑删除
  // Sprint 2 字段
  order?: number;                // 自定义拖拽顺序
  dependsOn?: string;            // 前置依赖的习惯 ID
  customFormType?: "none" | "fitness" | "social"; // 特化数据表单类型
}

// 习惯打卡记录接口
export interface HabitLog {
  id: string;
  habitId: string;
  date: string; // 打卡日期，格式 YYYY-MM-DD
  createdAt: Date;
  updatedAt?: Date;              // 增量同步：最后更新时间
  isDeleted?: boolean;           // 增量同步：是否逻辑删除
  // Sprint 2 字段
  customData?: HabitCustomData;  // 特化打卡表单提交的 JSON 数据（形状见 habit-data.ts）
  imageUrl?: string;             // 打卡凭证图片 (Base64 或云端 URL)
}

// SM-2 记忆卡片接口
export interface Card {
  id: string;
  front: string; // 正面内容 (Markdown)
  back: string;  // 背面内容 (Markdown)
  tags: string[]; // 标签数组
  linkedCards?: string[]; // 双向链接关联的卡片 ID 或标题名称列表
  // ---- v4 新增：对齐《学习方法手册》4.4 节的制卡规格 ----
  type?: CardType;    // 卡片类型：概念卡 / 面试题卡 / 错题卡（交错练习靠它识别题型）
  example?: string;   // 一个自己能记住的例子或类比（不看资料讲的时候靠它落地）
  // ---- 复习状态：字段名沿用历史命名，领域层用 SM-2 规范名，由 adapters.ts 翻译 ----
  reps: number;  // 连续成功复习次数
  interval: number; // 距离下一次复习的间隔天数
  ease: number;  // 简易度因子 (Ease Factor)，默认 2.5
  nextReview: Date; // 下一次复习的绝对时间
  createdAt: Date;
  updatedAt?: Date;              // 增量同步：最后更新时间
  isDeleted?: boolean;           // 增量同步：是否逻辑删除
}

// 每日意图与状态记录接口 (WOOP 与能量)
export interface DailyRecord {
  date: string; // 格式 YYYY-MM-DD，作为主键
  woopWish?: string;
  woopOutcome?: string;
  woopObstacle?: string;
  woopPlan?: string;
  energyLevel?: number; // 能量值：1-10
  reviewQuestions?: string[]; // AI 生成的灵魂反思问题
  reviewAnswers?: string[];   // 用户的回答
  reviewCompletedAt?: Date;   // 复盘提交的时间
  createdAt: Date;
  updatedAt?: Date;              // 增量同步：最后更新时间
  // Sprint 2 字段
  aiTasks?: {                 // 当天 AI 生成规划的任务排程
    id: string;
    name: string;
    reason: string;
    energyDemand: "high" | "medium" | "low";
    isCompleted: boolean;
    completedAt?: Date;
  }[];
  aiTasksGeneratedAt?: Date; // AI 任务生成时间
}

// 费曼输出板记录接口
export interface FeynmanRecord {
  id: string; // 唯一ID (uuid)
  topic: string; // 解释概念主题
  content: string; // 讲述文本
  score: number; // 易懂度评分
  grade: string; // 评分等级
  tips: string[]; // 改进建议列表
  // ---- v4 新增：让「输出」真的产出东西，而不是只产出一个分数 ----
  cardId?: string;       // 关联的记忆卡片，方便「讲不通 → 回去补那张卡」
  stuckPoints?: string[]; // 卡壳点：讲不顺的地方就是要补的点
  plainSummary?: string;  // 100 字大白话总结（硬约束：不许堆术语）
  aiGaps?: { point: string; why?: string }[]; // AI 指出的漏讲点（Phase 4 由「打分」改为「追问」后写入）
  aiTerms?: string[];     // AI 挑出的「用了但没解释」的术语
  createdAt: Date; // 创建时间
  updatedAt?: Date;              // 增量同步：最后更新时间
}

// 物理删除记录接口，用于支持离线同步冲突合并
export interface DeletedRecord {
  id: string;        // 被删除记录的 ID
  tableName: string; // 被删除的数据表名
  deletedAt: Date;   // 删除时间
}

// 数据库类定义
class GrowthOSDatabase extends Dexie {
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  cards!: Table<Card, string>;
  dailyRecords!: Table<DailyRecord, string>;
  feynmanRecords!: Table<FeynmanRecord, string>;
  deletedRecords!: Table<DeletedRecord, string>;
  // ---- v4 新增 ----
  reviewEvents!: Table<ReviewEvent, string>;   // 复习事件流（append-only，统计与热力图的唯一真实数据源）
  weeklyReviews!: Table<WeeklyReview, string>; // 周复盘
  projects!: Table<Project, string>;           // 项目实战看板（含「难题—解法」）
  settings!: Table<LearningSettings, string>;  // 学习闭环设置（单行，id = "main"）
  // ---- v5 新增 ----
  // 候选池：AI 给的追问（只有问题、没有答案），等用户自己回来答。
  // 它**不是**卡片，所以不进复习队列、不占每日新卡上限。
  cardCandidates!: Table<CardCandidate, string>;

  constructor() {
    super("GrowthOSDatabase");
    
    // 定义表和索引。带有星号 * 的字段代表多值索引 (Multi-entry index)
    this.version(1).stores({
      habits: "id, name, frequency, energyDemand, createdAt",
      habitLogs: "id, habitId, date, createdAt",
      cards: "id, front, back, *tags, reps, interval, ease, nextReview, createdAt",
      dailyRecords: "date, energyLevel, createdAt",
    });

    this.version(2).stores({
      habits: "id, name, frequency, energyDemand, createdAt",
      habitLogs: "id, habitId, date, createdAt",
      cards: "id, front, back, *tags, reps, interval, ease, nextReview, createdAt",
      dailyRecords: "date, energyLevel, createdAt",
      feynmanRecords: "id, topic, score, createdAt",
    });

    this.version(3).stores({
      habits: "id, name, frequency, energyDemand, createdAt",
      habitLogs: "id, habitId, date, createdAt",
      cards: "id, front, back, *tags, reps, interval, ease, nextReview, createdAt",
      dailyRecords: "date, energyLevel, createdAt",
      feynmanRecords: "id, topic, score, createdAt",
      deletedRecords: "id, tableName, deletedAt",
    });

    /**
     * v4：学习闭环升级（Phase 0）
     *
     * 纯增量，**不改任何已有字段名**：
     * - cards 增加 type / example 两个可选字段（迁移时回填，老卡片不会被丢）
     * - 新增 reviewEvents（复习事件流）、weeklyReviews（周复盘）、
     *   projects（项目实战）、settings（学习设置）四张表
     * - feynmanRecords 增加 cardId 索引，供「输出 → 回补卡片」跳转
     *
     * 为什么要单独存事件流：老项目只把结果写回 cards，
     * 导致「复习热力图」只能拿 habitLogs 凑数，看不出复习频率。
     */
    this.version(4)
      .stores({
        habits: "id, name, frequency, energyDemand, createdAt",
        habitLogs: "id, habitId, date, createdAt",
        cards:
          "id, front, back, *tags, type, reps, interval, ease, nextReview, createdAt",
        dailyRecords: "date, energyLevel, createdAt",
        feynmanRecords: "id, cardId, topic, score, createdAt",
        deletedRecords: "id, tableName, deletedAt",
        reviewEvents: "id, cardId, at, rating",
        weeklyReviews: "id, weekStart, createdAt",
        projects: "id, status, startAt, targetEndAt, createdAt",
        settings: "id",
      })
      .upgrade(async (tx) => {
        const now = Date.now();

        // 1. 回填 cards：修正脏类型、补齐 type/example。
        //    normalizeCardForV4 是幂等的，重复执行结果不变。
        await tx
          .table("cards")
          .toCollection()
          .modify((card: Record<string, unknown>) => {
            const patch = normalizeCardForV4(card, now);
            card.ease = patch.ease;
            card.reps = patch.reps;
            card.interval = patch.interval;
            card.nextReview = patch.nextReview;
            card.type = patch.type;
            card.example = patch.example;
          });

        // 2. 落一条默认设置，保证「每日新卡上限」等开关总有值可读
        const settingsTable = tx.table("settings");
        const existing = await settingsTable.get(SETTINGS_ROW_ID);
        if (!existing) {
          await settingsTable.put({ ...DEFAULT_LEARNING_SETTINGS, updatedAt: now });
        }
      });

    /**
     * v5：候选池（Phase 4）
     *
     * 纯增量，仍然不动任何已有字段。
     *
     * 为什么候选池要落库而不是放在内存里：
     * 用户划选一段文字 → AI 给 3 个追问 → 他关掉页面去干别的。
     * 如果追问只在内存里，这一次提取就白做了；而追问本身是「还没答的作业」，
     * 作业丢了比题做错更浪费。
     *
     * 刻意**不挂 updatedAt hook**：候选池没有同步语义，
     * 也没有「修改」这个概念（要么没答，要么被接走建卡）。
     */
    this.version(5).stores({
      habits: "id, name, frequency, energyDemand, createdAt",
      habitLogs: "id, habitId, date, createdAt",
      cards:
        "id, front, back, *tags, type, reps, interval, ease, nextReview, createdAt",
      dailyRecords: "date, energyLevel, createdAt",
      feynmanRecords: "id, cardId, topic, score, createdAt",
      deletedRecords: "id, tableName, deletedAt",
      reviewEvents: "id, cardId, at, rating",
      weeklyReviews: "id, weekStart, createdAt",
      projects: "id, status, startAt, targetEndAt, createdAt",
      settings: "id",
      cardCandidates: "id, createdAt, adopted",
    });

    // 自动为写入的记录附带和维护 updatedAt 属性 (支持 Last-Write-Wins 冲突合并)
    // 注意：reviewEvents 是 append-only 事件流，没有 updatedAt 语义，刻意不挂 hook。
    const tablesToHook = [
      "habits",
      "habitLogs",
      "cards",
      "dailyRecords",
      "feynmanRecords",
      "projects",
      "weeklyReviews",
    ];
    tablesToHook.forEach((tbl) => {
      const table = this.table(tbl);
      // Dexie 的 hook 参数是按位置传的，用不到的只能占位（下划线前缀表示「已知不用」）
      table.hook("creating", (_primKey, obj) => {
        obj.updatedAt = new Date();
      });
      table.hook("updating", (mods, _primKey, _obj) => {
        return { ...mods, updatedAt: new Date() };
      });
    });
  }
}

// 导出唯一的数据库实例
export const db = new GrowthOSDatabase();

/**
 * 局部更新当天的 DailyRecord。
 *
 * 为什么需要它：改造前每个组件都手写一遍
 * `put({ ...record, date, woopWish: record?.woopWish || '', ... })`，
 * 一共 6 个字段逐个兜底。拆成子组件后如果继续这么写，每加一个字段就要改 4 处，
 * 漏一处就会把用户的 WOOP 或复盘答案清空。
 *
 * 这里统一成「读 → 合并 → 写」，且保证 date / createdAt 一定存在。
 */
export async function upsertDailyRecord(
  date: string,
  patch: Partial<Omit<DailyRecord, "date" | "createdAt">>,
): Promise<DailyRecord> {
  const existing = await db.dailyRecords.get(date);
  const next: DailyRecord = {
    date,
    createdAt: existing?.createdAt ?? new Date(),
    ...existing,
    ...patch,
  };
  await db.dailyRecords.put(next);
  return next;
}

// 导出物理删除跟踪助手方法
export async function trackDeletion(tableName: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    await db.deletedRecords.put({
      id,
      tableName,
      deletedAt: new Date()
    });
  } catch (err) {
    console.error(`Failed to track deletion in table ${tableName} for ID ${id}:`, err);
  }
}

// 自动注入默认新手引导数据
export async function seedDefaultData() {
  if (typeof window === "undefined") return;
  try {
    // 检查并注入初始习惯
    const habitsCount = await db.habits.count();
    if (habitsCount === 0) {
      await db.habits.bulkAdd([
        {
          id: "guide-habit-cmdk",
          name: "唤起 Cmd+K 极速穿梭",
          icon: "Target",
          frequency: "daily",
          energyDemand: "low",
          createdAt: new Date(),
        },
        {
          id: "guide-habit-flow",
          name: "10分钟番茄心流深度输出",
          icon: "Code",
          frequency: "daily",
          energyDemand: "high",
          createdAt: new Date(),
        },
        {
          id: "guide-habit-feynman",
          name: "社交或表达一次费曼输出",
          icon: "MessageSquare",
          frequency: "daily",
          energyDemand: "medium",
          createdAt: new Date(),
        },
      ]);
    }

    // 检查并注入上手向导卡片（使用 HTML 结构契合 TipTap 富文本编辑器）
    const cardsCount = await db.cards.count();
    if (cardsCount === 0) {
      await db.cards.bulkAdd([
        {
          id: "guide-card-1",
          front: "GrowthOS 的核心交互媒介是什么？",
          back: "<p>以键盘操作为主。随时唤起 <code>Cmd + K</code>（Windows 用 <code>Ctrl + K</code>）命令面板，新建 WOOP、打卡、切换页面都在里面。</p>",
          tags: ["新手向导", "快捷键"],
          type: "concept",
          reps: 0,
          interval: 0,
          ease: 2.5,
          nextReview: new Date(),
          createdAt: new Date(),
        },
        {
          id: "guide-card-2",
          front: "什么是 WOOP 意图设定，它的四个英文字母分别代表什么？",
          back: "<p>WOOP 是行为科学的计划法：</p><ul><li><strong>W (Wish)</strong> 愿望：今天最想达成的一件事</li><li><strong>O (Outcome)</strong> 结果：达成后的状态</li><li><strong>O (Obstacle)</strong> 障碍：最可能卡住你的地方</li><li><strong>P (Plan)</strong> 应对：如果障碍发生，就执行哪一个动作</li></ul>",
          tags: ["新手向导", "行为科学"],
          type: "concept",
          reps: 0,
          interval: 0,
          ease: 2.5,
          nextReview: new Date(),
          createdAt: new Date(),
        },
        {
          id: "guide-card-3",
          front: "记忆卡片的复习是如何在后台运转的？",
          back: "<p>内置 <strong>SM-2 间隔重复算法</strong>。复习时评估记忆程度（忘记 / 困难 / 良好 / 简单），算法据此算出下次出现的时间。</p>",
          tags: ["新手向导", "SM-2算法"],
          type: "concept",
          reps: 0,
          interval: 0,
          ease: 2.5,
          nextReview: new Date(),
          createdAt: new Date(),
        },
        {
          id: "guide-card-4",
          front: "习惯卡片上的「最宜」或绿色边框高亮是什么意思？",
          back: "<p>能量匹配。拖动首页右上角的能量滑块（1-10），系统会高亮符合当前能耗需求的习惯。能量低时先做低阻力的事。</p>",
          tags: ["新手向导", "能量管理"],
          type: "concept",
          reps: 0,
          interval: 0,
          ease: 2.5,
          nextReview: new Date(),
          createdAt: new Date(),
        },
      ]);
    }
  } catch (err) {
    console.error("Failed to seed default data for GrowthOS:", err);
  }
}

// 自动执行种子注入逻辑
seedDefaultData();

