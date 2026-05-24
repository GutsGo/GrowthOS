import Dexie, { type Table } from "dexie";

// 习惯配置接口
export interface Habit {
  id: string;
  name: string;
  icon: string;
  frequency: "daily" | "weekly";
  energyDemand: "high" | "medium" | "low"; // 能量需求：高、中、低
  createdAt: Date;
}

// 习惯打卡记录接口
export interface HabitLog {
  id: string;
  habitId: string;
  date: string; // 打卡日期，格式 YYYY-MM-DD
  createdAt: Date;
}

// SM-2 记忆卡片接口
export interface Card {
  id: string;
  front: string; // 正面内容 (Markdown)
  back: string;  // 背面内容 (Markdown)
  tags: string[]; // 标签数组
  reps: number;  // 连续成功复习次数
  interval: number; // 距离下一次复习的间隔天数
  ease: number;  // 简易度因子 (Ease Factor)，默认 2.5
  nextReview: Date; // 下一次复习的绝对时间
  createdAt: Date;
}

// 每日意图与状态记录接口 (WOOP 与能量)
export interface DailyRecord {
  date: string; // 格式 YYYY-MM-DD，作为主键
  woopWish?: string;
  woopOutcome?: string;
  woopObstacle?: string;
  woopPlan?: string;
  energyLevel?: number; // 能量值：1-10
  createdAt: Date;
}

// 数据库类定义
class GrowthOSDatabase extends Dexie {
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  cards!: Table<Card, string>;
  dailyRecords!: Table<DailyRecord, string>;

  constructor() {
    super("GrowthOSDatabase");
    
    // 定义表和索引。带有星号 * 的字段代表多值索引 (Multi-entry index)
    this.version(1).stores({
      habits: "id, name, frequency, energyDemand, createdAt",
      habitLogs: "id, habitId, date, createdAt",
      cards: "id, front, back, *tags, reps, interval, ease, nextReview, createdAt",
      dailyRecords: "date, energyLevel, createdAt",
    });
  }
}

// 导出唯一的数据库实例
export const db = new GrowthOSDatabase();
