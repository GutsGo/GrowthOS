/**
 * 习惯两个枚举字段的中文说法与选项顺序。
 *
 * 为什么单独一个文件：这些词同时出现在「添加习惯弹窗」（选项按钮）和
 * 「设置页习惯列表」（标签）里。以前两处各写一份，于是同一个 `social`
 * 在弹窗叫「社交复盘」、在列表里叫「社交特化」—— 同一个字段两种说法，
 * 用户会以为是两件事。
 *
 * 不 import `Habit`：这个文件被 UI 和测试同时引用，
 * 拖进 db.ts 就等于把 Dexie 也拖进测试（同 habit-data.ts 的理由）。
 */

export type EnergyDemand = "low" | "medium" | "high";
export type HabitFormType = "none" | "fitness" | "social";

/** 弹窗里按钮的排列顺序：从最省力到最费劲，和「阻力」这个词的方向一致 */
export const ENERGY_ORDER: readonly EnergyDemand[] = ["low", "medium", "high"];

export const ENERGY_LABELS: Record<EnergyDemand, string> = {
  low: "轻松",
  medium: "中等",
  high: "挑战",
};

export const FORM_TYPE_ORDER: readonly HabitFormType[] = [
  "none",
  "fitness",
  "social",
];

export const FORM_TYPE_LABELS: Record<HabitFormType, string> = {
  none: "常规打卡",
  fitness: "健身特化",
  social: "社交复盘",
};
