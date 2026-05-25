import Dexie, { type Table } from "dexie";

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
  customData?: any;              // 特化打卡表单提交的 JSON 数据
  imageUrl?: string;             // 打卡凭证图片 (Base64 或云端 URL)
}

// SM-2 记忆卡片接口
export interface Card {
  id: string;
  front: string; // 正面内容 (Markdown)
  back: string;  // 背面内容 (Markdown)
  tags: string[]; // 标签数组
  linkedCards?: string[]; // 双向链接关联的卡片 ID 或标题名称列表
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

    // 自动为写入的记录附带和维护 updatedAt 属性 (支持 Last-Write-Wins 冲突合并)
    const tablesToHook = ["habits", "habitLogs", "cards", "dailyRecords", "feynmanRecords"];
    tablesToHook.forEach((tbl) => {
      const table = this.table(tbl);
      table.hook("creating", (primKey, obj) => {
        obj.updatedAt = new Date();
      });
      table.hook("updating", (mods, primKey, obj) => {
        return { ...mods, updatedAt: new Date() };
      });
    });
  }
}

// 导出唯一的数据库实例
export const db = new GrowthOSDatabase();

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
          back: "<p>系统倡导<strong>键盘驱动 (Keyboard-driven)</strong>。随时随地唤起 <code>Cmd + K</code>（或 Windows 下的 <code>Ctrl + K</code>）全局命令面板，即可执行新建 WOOP、打卡、页面穿梭等所有核心操作，降低界面点击摩擦。</p>",
          tags: ["新手向导", "快捷键"],
          reps: 0,
          interval: 0,
          ease: 2.5,
          nextReview: new Date(),
          createdAt: new Date(),
        },
        {
          id: "guide-card-2",
          front: "什么是 WOOP 意图设定，它的四个英文字母分别代表什么？",
          back: "<p>WOOP 是一种基于行为科学的计划制定法：</p><ul><li><strong>W (Wish)</strong> - 愿望：今日最想达成的明确目标</li><li><strong>O (Outcome)</strong> - 最佳结果：达成后给你带来的情绪或成就感</li><li><strong>O (Obstacle)</strong> - 潜在障碍：执行中可能遇到的主客观阻碍</li><li><strong>P (Plan)</strong> - If-Then 计划：如果障碍发生，我就执行对应的微习惯预案</li></ul>",
          tags: ["新手向导", "行为科学"],
          reps: 0,
          interval: 0,
          ease: 2.5,
          nextReview: new Date(),
          createdAt: new Date(),
        },
        {
          id: "guide-card-3",
          front: "记忆卡片的复习是如何在后台运转的？",
          back: "<p>系统内置了 <strong>SM-2 间隔重复算法</strong>。在复习卡片时，你只需客观评估自己的记忆程度（Again 忘记 / Hard 吃力 / Good 轻松）。算法会智能计算该卡片下次应该在几天后重现，抗击遗忘曲线。</p>",
          tags: ["新手向导", "SM-2算法"],
          reps: 0,
          interval: 0,
          ease: 2.5,
          nextReview: new Date(),
          createdAt: new Date(),
        },
        {
          id: "guide-card-4",
          front: "习惯卡片上的「最宜」或绿色边框高亮是什么意思？",
          back: "<p>这是<strong>能量需求匹配推荐</strong>。当你拖动主页右上角的能量滑块（1-10）时，系统会自动匹配符合当前能耗需求的习惯（高、中、低能量习惯），并在界面上亮起绿色外框。顺应你的生理精力，将开启阻力降到最低。</p>",
          tags: ["新手向导", "能量管理"],
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

