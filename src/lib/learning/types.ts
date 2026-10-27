/**
 * 学习闭环领域类型（Phase 0 契约层）
 *
 * 设计原则：
 * 1. 本文件只放**类型与常量**，不含任何运行时依赖，方便被单测、API 路由、UI 共同引用。
 * 2. 领域层用 SM-2 的规范命名（easeFactor / repetitions / repeatInterval / due）；
 *    存储层（Dexie `cards` 表）继续沿用历史命名（ease / reps / interval / nextReview），
 *    两者通过 `adapters.ts` 做防腐层转换。**不要为了命名统一去改存储字段**——
 *    那只会让 FlowView / StatsView / BrainView 三个组件同时编译失败，且对用户零价值。
 * 3. 时间一律用 epoch 毫秒（number）表达，只有在落库时转 Date。
 *    这样纯函数可测、可序列化、可跨时区比较。
 */

/** 卡片类型。交错练习靠它识别题型，随机混排时不至于连着刷三张同类型。 */
export type CardType = "concept" | "interview" | "mistake";

export const CARD_TYPES: readonly CardType[] = [
  "concept",
  "interview",
  "mistake",
] as const;

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  concept: "概念卡",
  interview: "面试题卡",
  mistake: "错题卡",
};

/**
 * 复习自评四档（手册 4.5 节，档位数值冻结）
 *
 * | 档位 | 判断标准 | 算法动作 |
 * |------|----------|----------|
 * | 忘记 0 | 完全想不起来，或答错 | 重置间隔，今天稍后或明天再见 |
 * | 困难 3 | 想了很久、卡顿后才想起，回答不完整 | 缩短间隔，提前再见 |
 * | 良好 4 | 顺利想起，略有停顿，回答完整 | 按默认间隔推进 |
 * | 简单 5 | 脱口而出，毫不费力 | 拉长间隔，减少重复次数 |
 *
 * 数值沿用 SM-2 的 quality 刻度（0–5），这样既兼容标准算法里的
 * EF 惩罚公式 (0.1 - (5-q)(0.08+(5-q)·0.02))，也保留了「困难」的独立档位。
 */
export type Rating = 0 | 3 | 4 | 5;

export const RATINGS: readonly Rating[] = [0, 3, 4, 5] as const;

export interface RatingMeta {
  rating: Rating;
  /** 按钮文案 */
  label: string;
  /** 自评标准（手册 4.5 节原文，复习页直接展示，避免用户凭手感乱点） */
  hint: string;
  /** 算法动作说明（用于设置页/帮助浮层解释「为什么下次是 3 天后」） */
  action: string;
  /** 语义色，Phase 4 视觉收口时映射到设计 token */
  tone: "danger" | "warning" | "success" | "info";
}

export const RATING_META: Record<Rating, RatingMeta> = {
  0: {
    rating: 0,
    label: "忘记",
    hint: "想不起来，或答错。",
    action: "重置间隔，明天再见",
    tone: "danger",
  },
  3: {
    rating: 3,
    label: "困难",
    hint: "卡顿后才想起，答不完整。",
    action: "缩短间隔，提前再见",
    tone: "warning",
  },
  4: {
    rating: 4,
    label: "良好",
    hint: "顺利想起，略有停顿，回答完整。",
    action: "按默认间隔推进",
    tone: "success",
  },
  5: {
    rating: 5,
    label: "简单",
    hint: "脱口而出，毫不费力。",
    action: "拉长间隔，减少重复次数",
    tone: "info",
  },
};

/**
 * 一张卡的复习状态（纯算法视角，不含业务字段）
 *
 * 与存储字段的对应关系：
 * - easeFactor   ←→ Card.ease        （简易度因子，默认 2.5，下限 1.3）
 * - repetitions  ←→ Card.reps        （连续成功次数，忘记时归零）
 * - interval     ←→ Card.interval    （当前间隔，单位天）
 * - due          ←→ Card.nextReview  （下次到期时间，epoch ms）
 */
export interface ReviewState {
  easeFactor: number;
  repetitions: number;
  interval: number;
  due: number;
}

/**
 * 一次复习事件（append-only 日志）
 *
 * 老项目只把结果写回 cards，没有事件流，导致「复习热力图」只能拿 habitLogs 凑数，
 * 看不出复习频率。这张表是看板与统计的唯一真实数据源。
 */
/**
 * 考官模式的两轮问答。
 *
 * 定义放在 types 而不是 exam.ts，因为 `ReviewEvent` 要引用它；
 * 反过来 exam.ts 从这里 import 再 re-export，避免两个模块互相依赖。
 */
export interface ExamTurn {
  question: string;
  answer: string;
}

export interface ReviewEvent {
  id: string;
  cardId: string;
  rating: Rating;
  /** 评分发生时间，epoch ms（索引） */
  at: number;
  /** 评分前的间隔（天），用于复盘「这次为什么提前了」 */
  intervalBefore: number;
  /** 评分后的间隔（天） */
  intervalAfter: number;
  easeAfter: number;
  repetitionsAfter: number;
  /** 本次是否判定为「忘记」（触发重置） */
  lapsed: boolean;
  /**
   * 翻面前的两轮考官问答。没走考官模式就没有这个字段。
   *
   * 为什么值得存：判断「这张卡是不是其实没懂」，评分不可靠（点「良好」太便宜），
   * 而这两轮回答里有多少虚词是可回看的证据。周复盘和「哪些卡该重做」都从这里取数。
   */
  exam?: ExamTurn[];
}

/** 每日一句复盘（对应手册「写一句 → 复盘」） */
export interface DailyNote {
  /** YYYY-MM-DD */
  date: string;
  /** 今天哪里卡住了 */
  stuck?: string;
  /** 明天先补哪一个（小到 2 分钟内能启动） */
  next?: string;
  createdAt: number;
  updatedAt?: number;
}

/**
 * 周复盘（手册 4.2：周日 15 分钟，只问三件事）
 * 和老项目已有的「AI 晚间灵魂复盘」分工：日复盘负责扎心提问，周复盘负责做减法。
 */
export interface WeeklyReview {
  id: string;
  /** 该周的周一，YYYY-MM-DD（索引） */
  weekStart: string;
  /** 这一周，哪一步我真的做到了 */
  effective: string;
  /** 哪一步是伪努力（看了但没提取） */
  pseudoWork: string;
  /** 下周只改哪一个变量——只能一个，多填就是没有重点 */
  oneChange: string;
  createdAt: number;
  updatedAt?: number;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  done: boolean;
  doneAt?: number;
}

/** 「难题—解法」记录。面试故事的原料就在这里，比写简历管用。 */
export interface ProjectPitfall {
  id: string;
  problem: string;
  solution: string;
  at: number;
}

export type ProjectStatus = "active" | "shipped" | "paused" | "archived";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "进行中",
  shipped: "已完成",
  paused: "暂停",
  archived: "归档",
};

/**
 * 一周一个可展示小项目（手册 4.2）
 * 新建时默认 targetEndAt = startAt + 7 天，这是硬约束不是建议。
 */
export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  startAt: number;
  targetEndAt: number;
  /** 一句话：这个项目能展示什么 */
  summary?: string;
  milestones: ProjectMilestone[];
  pitfalls: ProjectPitfall[];
  createdAt: number;
  updatedAt?: number;
}

/** 费曼输出记录（扩展老项目的 feynmanRecords） */
export interface FeynmanOutput {
  id: string;
  /** 关联卡片，可空（有些概念还没制卡） */
  cardId?: string;
  concept: string;
  /** 讲解正文 */
  text: string;
  /** 卡壳点，讲不通的地方就是要回去补的点 */
  stuckPoints: string[];
  /** 100 字大白话总结（硬约束：不许堆术语） */
  plainSummary: string;
  /** AI 追问（Phase 4 启用）：AI 指出的漏讲点 */
  aiGaps?: string[];
  /** 老项目遗留字段，保留兼容 */
  score?: number;
  grade?: string;
  tips?: string[];
  createdAt: number;
  updatedAt?: number;
}

/**
 * 学习闭环全局设置（单行表，id 固定 "main"）
 *
 * 刻意不做成「一大堆可调参数」——手册 4.4 节原话：
 * 「设定每日新卡上限、if-then 触发情境、休息与运动提醒；不在这里调复杂参数。」
 */
export interface LearningSettings {
  id: "main";
  /** 每日新卡硬上限。手册建议首周 1–2 张，宁可少做不可积压。 */
  dailyNewCardLimit: number;
  /** 学习前仪式提示是否已被手动关闭 */
  ritualDismissed: boolean;
  /** WOOP 引导是否已提示过（只提示一次，不再强制弹窗） */
  woopPromptedOnce: boolean;
  /**
   * 是否开启交错练习（现代码里唯一会改变「下一张是哪张」的开关）。
   *
   * 默认开启。关掉不是「关闭某个功能」，而是回到「到期在前、新卡在后」
   * 的老顺序——有些人复习时就想先还完旧账，那也是一种合理偏好。
   */
  interleavingEnabled: boolean;
  /** if-then 触发情境，如「晚饭后 → 坐到书桌前先做 1 张卡」 */
  ifThenCue?: string;
  /** 休息提醒间隔（分钟），0 表示关闭 */
  restReminderMinutes?: number;
  updatedAt?: number;
}

export const SETTINGS_ROW_ID = "main" as const;

export const DEFAULT_LEARNING_SETTINGS: LearningSettings = {
  id: SETTINGS_ROW_ID,
  dailyNewCardLimit: 2,
  ritualDismissed: false,
  woopPromptedOnce: false,
  interleavingEnabled: true,
  restReminderMinutes: 0,
};
