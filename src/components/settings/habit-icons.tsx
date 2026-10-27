/**
 * 习惯图标：选项清单与渲染器。
 *
 * 抽出来的理由：以前「图标名 → 组件」的 switch 写在 SettingsView 里，
 * 添加表单和习惯列表各自调用；一旦把添加表单搬进弹窗，弹窗和列表
 * 就成了两个文件，两边各写一份 switch 迟早会漂移（弹窗里有 5 个图标，
 * 列表里只认得 4 个，第 5 个静默落到 Target）。
 * 所以：一份清单，两处 import。
 */
import { Activity, Code, MessageSquare, Target, User } from "lucide-react";

/**
 * 可选图标。顺序即表单里的排列顺序。
 * `name` 会原样写进 Habit.icon，改名等于改数据，别随手改。
 */
export const HABIT_ICON_OPTIONS = [
  { name: "Code", label: "代码" },
  { name: "MessageSquare", label: "英语" },
  { name: "Activity", label: "力量" },
  { name: "User", label: "社交" },
] as const;

export type HabitIconName = (typeof HABIT_ICON_OPTIONS)[number]["name"];

/**
 * 按名字渲染图标。认不出的一律给 Target ——
 * 老数据里可能有已下线的图标名，宁可显示一个中性图标，也不要空白。
 */
export function HabitIcon({
  name,
  className = "w-4 h-4",
}: {
  name: string;
  className?: string;
}) {
  switch (name) {
    case "Code":
      return <Code className={className} />;
    case "MessageSquare":
      return <MessageSquare className={className} />;
    case "Activity":
      return <Activity className={className} />;
    case "User":
      return <User className={className} />;
    default:
      return <Target className={className} />;
  }
}
