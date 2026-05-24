import { create } from "zustand";

// 支持的路由子页面 Tab
export type AppTab = "dashboard" | "flow" | "brain" | "coach" | "stats" | "settings";

interface AppState {
  activeTab: AppTab;
  isCommandPaletteOpen: boolean;
  currentDate: string; // 格式为 YYYY-MM-DD
  isReviewMode: boolean; // 是否处于卡片复习专注模式
  flowTimerMinutes: number; // 专注计时时长（默认 25 分钟，挑战时设为 15 等）
  theme: "light" | "dark"; // 全局主题：浅色或深色
  setActiveTab: (tab: AppTab) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCurrentDate: (date: string) => void;
  setReviewMode: (mode: boolean) => void;
  setFlowTimerMinutes: (mins: number) => void;
  setTheme: (theme: "light" | "dark") => void;
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
  isReviewMode: false,
  flowTimerMinutes: 25,
  theme: "dark", // 默认采用沉浸式暗黑风格
  
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
  setCurrentDate: (date) => set({ currentDate: date }),
  setReviewMode: (mode) => set({ isReviewMode: mode }),
  setFlowTimerMinutes: (mins) => set({ flowTimerMinutes: mins }),
  setTheme: (theme) => set({ theme }),
}));
