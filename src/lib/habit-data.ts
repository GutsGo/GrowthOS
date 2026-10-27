/**
 * 特化打卡表单的数据形状。
 *
 * 单独一个文件的理由：这个类型被三方共用——写库的 `db.ts`、填表的
 * `SpecializedRecordModal`、以及把它拼进 prompt 的 `/api/review`。
 * 放在 `db.ts` 里会让 API 路由为了拿一个类型而 import 到 Dexie；
 * 各写一份，则会出现「组件改了字段名，prompt 那边还在读老字段」，
 * 而 TypeScript 一个错都不报（因为两边都是 any / 各写各的）。
 *
 * 所以：一处定义，三处 import。
 * 全部字段可选，因为两种表单（健身 / 社交）共用一个字段。
 */
export interface HabitCustomData {
  // ---- 健身表单 ----
  /** 训练组。weight 单位 kg，reps 是次数 */
  sets?: { setNum: number; weight: number; reps: number }[];
  /** 训练精神状态 */
  mood?: "great" | "good" | "tired";
  /** 训练简记 */
  notes?: string;

  // ---- 社交表单 ----
  /** 交往对象 */
  contact?: string;
  /** 探讨主题 */
  topic?: string;
  /** 沟通反思 */
  reflect?: string;
  /** 后续跟进 */
  followUp?: string;
}

/** 训练状态的中文说法。界面和 prompt 用同一份，避免两处措辞漂移。 */
export const MOOD_LABELS: Record<NonNullable<HabitCustomData["mood"]>, string> = {
  great: "精力充沛",
  good: "状态平稳",
  tired: "略显疲惫",
};
