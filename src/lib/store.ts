import { create } from "zustand";

// 支持的路由子页面 Tab
//
// 顺序即导航顺序，按「一天的动作」排而不是按功能模块排：
// 今日（决定做不做）→ 复习（做卡）→ 输出（讲出来）→ 制卡（补输入）→ 看板（回看）。
// Phase 3 把「专注」（番茄钟 + 白噪音）并进今日，把「数据」并进看板。
// Phase 4 删掉了 `coach`：它的两个真实用途（复盘提问、单卡追问）里，
// 前者归「看板 · 周复盘」，后者变成复习页的**考官模式**。
// 一个 1900 行的「AI 教练舱」如果只被用来问两个问题，那它就是导航噪音。
export type AppTab =
  | "dashboard"
  | "review"
  | "output"
  | "brain"
  | "board"
  | "settings";

/**
 * 进入复习页的两种意图。
 *
 * `one` 来自「今日」首屏那颗「先复习一张」——它承诺的是**一张**，
 * 所以进来后复习完一张就该收尾，而不是顺势滑进整队。
 * `all` 来自侧边栏、命令面板：用户明确点了「复习」，那就是整套。
 *
 * 这两者必须分开记，否则「先复习一张」就只是一句按钮文案，
 * 落地页仍然是「0 / 2」的整套进度——文案在骗人。
 */
export type ReviewScope = "one" | "all";

/**
 * 「带题进输出页」的载荷。
 *
 * 来源有两个：项目看板里的「难题—解法」（一键拿去讲），以及（Phase 4）
 * 复习页里讲不通的卡。用 store 传而不是 URL 参数，是因为这个 App 没有路由分段。
 */
export interface OutputSeed {
  concept: string;
  seed?: string;
  cardId?: string;
}

interface AppState {
  activeTab: AppTab;
  isCommandPaletteOpen: boolean;
  currentDate: string; // 格式为 YYYY-MM-DD
  flowTimerMinutes: number; // 专注计时时长（默认 25 分钟，挑战时设为 15 等）
  theme: "light" | "dark"; // 全局主题：浅色或深色
  outputSeed: OutputSeed | null; // 待讲解的题目（来自项目难题 / 复习卡壳）
  /** 本次复习是「只复习一张」还是整队 */
  reviewScope: ReviewScope;
  setActiveTab: (tab: AppTab) => void;
  /**
   * 进入复习页并指定意图。
   * 不要用 `setActiveTab("review")` 表达「先复习一张」——那条路会重置成整套。
   */
  startReview: (scope: ReviewScope) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCurrentDate: (date: string) => void;
  setFlowTimerMinutes: (mins: number) => void;
  setTheme: (theme: "light" | "dark") => void;
  setOutputSeed: (seed: OutputSeed | null) => void;
}

// 辅助函数：以北京时间获取本地 YYYY-MM-DD 日期字符串
const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
};

export const useAppStore = create<AppState>((set) => ({
  activeTab: "dashboard",
  isCommandPaletteOpen: false,
  currentDate: getLocalDateString(),
  flowTimerMinutes: 25,
  theme: "dark", // 默认采用沉浸式暗黑风格
  reviewScope: "all",

  setActiveTab: (tab) =>
    set((state) => ({
      activeTab: tab,
      // 从侧边栏 / 命令面板点「复习」进来，意图是整套：把上次残留的
      // 「只复习一张」清掉，否则第二次进复习页会莫名其妙只给一张。
      reviewScope: tab === "review" ? "all" : state.reviewScope,
    })),
  startReview: (scope) => set({ activeTab: "review", reviewScope: scope }),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
  setCurrentDate: (date) => set({ currentDate: date }),
  setFlowTimerMinutes: (mins) => set({ flowTimerMinutes: mins }),
  setTheme: (theme) => set({ theme }),
  outputSeed: null,
  setOutputSeed: (seed) => set({ outputSeed: seed }),
}));
