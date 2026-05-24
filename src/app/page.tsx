"use client";

import React, { useEffect, useState } from "react";
import { useAppStore, AppTab } from "@/lib/store";
import { db } from "@/lib/db";
import CommandPalette from "@/components/CommandPalette";
import DashboardView from "@/components/DashboardView";
import FlowView from "@/components/FlowView";
import BrainView from "@/components/BrainView";
import CoachView from "@/components/CoachView";
import StatsView from "@/components/StatsView";
import SettingsView from "@/components/SettingsView";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame,
  Zap,
  BookOpen,
  Sparkles,
  Layers,
  Settings,
  Command,
  PlusCircle,
  Sun,
  Moon,
} from "lucide-react";

export default function Home() {
  const {
    activeTab,
    setActiveTab,
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    toggleCommandPalette,
    theme,
    setTheme,
    currentDate,
  } = useAppStore();

  const [isWoopModalOpen, setIsWoopModalOpen] = useState(false);

  // 0. 初始化全局主题 (本地持久化)
  useEffect(() => {
    const savedTheme = (localStorage.getItem("theme") as "light" | "dark") || "dark";
    setTheme(savedTheme);
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [setTheme]);

  // 0.1 注册 PWA ServiceWorker
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && window.location.hostname !== "localhost") {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then((reg) => {
          console.log("PWA ServiceWorker 注册成功, scope: ", reg.scope);
        }).catch((err) => {
          console.warn("PWA ServiceWorker 注册失败: ", err);
        });
      });
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // 1. 初始化数据库默认数据（冷启动）
  useEffect(() => {
    const initDatabase = async () => {
      try {
        const habitCount = await db.habits.count();
        if (habitCount === 0) {
          await db.habits.bulkAdd([
            {
              id: "habit-1",
              name: "AI 编码深度训练",
              icon: "Code",
              frequency: "daily",
              energyDemand: "high",
              createdAt: new Date(),
            },
            {
              id: "habit-2",
              name: "英语口语表达演练",
              icon: "MessageSquare",
              frequency: "daily",
              energyDemand: "low",
              createdAt: new Date(),
            },
            {
              id: "habit-3",
              name: "三分化力量拉伸",
              icon: "Activity",
              frequency: "daily",
              energyDemand: "high",
              createdAt: new Date(),
            },
            {
              id: "habit-4",
              name: "高情商社交话术练习",
              icon: "User",
              frequency: "daily",
              energyDemand: "medium",
              createdAt: new Date(),
            },
          ]);
        }

        const cardCount = await db.cards.count();
        if (cardCount === 0) {
          await db.cards.bulkAdd([
            {
              id: "card-1",
              front: "什么是 AI Agent 的 ReAct 模式？",
              back: "ReAct (Reason + Action) 是一种大模型提示词工程和决策机制。LLM 交替进行‘推理’（思考现状、下一步计划）与‘行动’（调用外部工具 API 并获得 Observation），实现闭环的自主控制流。",
              tags: ["AI", "Agent", "方法论"],
              reps: 0,
              interval: 0,
              ease: 2.5,
              nextReview: new Date(),
              createdAt: new Date(),
            },
            {
              id: "card-2",
              front: "费曼学习法的核心四步骤是什么？",
              back: "1. 选择目标概念并系统性学习；\n2. 尝试将该概念以最通俗的语言向完全不懂的小白解释（降维输出）；\n3. 在卡壳、无法合理解释的地方重新查阅原资料（纠错与查漏补缺）；\n4. 简化并加入类比，建立直观的逻辑联系。",
              tags: ["学习科学", "费曼"],
              reps: 0,
              interval: 0,
              ease: 2.5,
              nextReview: new Date(),
              createdAt: new Date(),
            },
          ]);
        }
      } catch (err) {
        console.error("初始化 IndexedDB 数据失败: ", err);
      }
    };
    initDatabase();
  }, []);

  // 1.5 每日冷启动检测：若今日尚未设定 WOOP 意图，自动强制弹出设定窗口
  useEffect(() => {
    const checkTodayWoop = async () => {
      try {
        const todayRec = await db.dailyRecords.get(currentDate);
        if (!todayRec || !todayRec.woopWish) {
          setTimeout(() => {
            setIsWoopModalOpen(true);
          }, 800); // 稍微延迟 800ms 弹出以防首屏渲染闪烁
        }
      } catch (err) {
        console.error("检测今日 WOOP 意图失败:", err);
      }
    };
    checkTodayWoop();
  }, [currentDate]);

  // 2. 监听全局快捷键 Cmd+K
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [toggleCommandPalette]);

  // 渲染匹配的子页面 View
  const renderContentView = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <DashboardView
            isWoopModalOpen={isWoopModalOpen}
            setIsWoopModalOpen={setIsWoopModalOpen}
          />
        );
      case "flow":
        return <FlowView />;
      case "brain":
        return <BrainView />;
      case "coach":
        return <CoachView />;
      case "stats":
        return <StatsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <DashboardView isWoopModalOpen={isWoopModalOpen} setIsWoopModalOpen={setIsWoopModalOpen} />;
    }
  };

  const navLinks: { tab: AppTab; label: string; icon: React.ReactNode }[] = [
    { tab: "dashboard", label: "今日指挥舱", icon: <Flame className="w-4 h-4" /> },
    { tab: "flow", label: "专注与输出", icon: <Zap className="w-4 h-4" /> },
    { tab: "brain", label: "第二大脑", icon: <BookOpen className="w-4 h-4" /> },
    { tab: "coach", label: "AI 教练舱", icon: <Sparkles className="w-4 h-4" /> },
    { tab: "stats", label: "数据与复盘", icon: <Layers className="w-4 h-4" /> },
    { tab: "settings", label: "系统设置", icon: <Settings className="w-4 h-4" /> },
  ];

  // 在 Flow Space 专注模式下隐藏侧边栏，提供沉浸感
  const isFullScreenMode = activeTab === "flow";

  const getTabTitle = (tab: AppTab) => {
    switch (tab) {
      case "dashboard":
        return "今日指挥舱";
      case "flow":
        return "专注与输出";
      case "brain":
        return "第二大脑";
      case "coach":
        return "AI 教练舱";
      case "stats":
        return "数据与复盘";
      case "settings":
        return "系统设置";
      default:
        return "GrowthOS";
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background-void text-text-primary">
      {/* 移动端顶部状态栏 (Mobile Header) - 专注模式下隐藏 */}
      {!isFullScreenMode && (
        <header className="fixed top-0 left-0 right-0 h-14 z-40 bg-surface-1/90 backdrop-blur-md border-b border-border-subtle flex items-center justify-between px-4 md:hidden">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <span className="text-black font-extrabold text-xs">G</span>
            </div>
            <span className="font-bold tracking-tight text-sm text-text-primary">
              {getTabTitle(activeTab)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
              aria-label="命令面板"
            >
              <Command className="w-4 h-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
              aria-label="切换主题"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>
      )}

      {/* 侧边导航栏 (Sidebar) - 在沉浸式 Flow Space 下折叠隐藏，在移动端下隐藏 */}
      {!isFullScreenMode && (
        <aside className="w-[240px] flex-shrink-0 bg-surface-1 border-r border-border-subtle hidden md:flex md:flex-col">
          {/* Logo 区域 */}
          <div className="h-16 flex items-center px-6 border-b border-border-subtle gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <span className="text-black font-extrabold text-sm">G</span>
            </div>
            <span className="font-extrabold tracking-tight text-lg text-text-primary">
              Growth<span className="text-primary">OS</span>
            </span>
          </div>

          {/* 导航项 */}
          <nav className="flex-1 py-4 px-3 space-y-1">
            {navLinks.map((link) => {
              const isActive = activeTab === link.tab;
              return (
                <button
                  key={link.tab}
                  onClick={() => setActiveTab(link.tab)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 group relative ${
                    isActive
                      ? "text-primary bg-surface-1"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-1/55"
                  }`}
                >
                  <span className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-primary" : "text-text-secondary"}`}>
                    {link.icon}
                  </span>
                  <span>{link.label}</span>
                  {isActive && (
                    <span className="absolute right-3 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* 快捷引导与操作 */}
          <div className="p-4 border-t border-border-subtle space-y-2">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface-1 hover:bg-surface-2 border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors duration-150"
            >
              <div className="flex items-center gap-2">
                <Command className="w-3.5 h-3.5" />
                <span>指令面板</span>
              </div>
              <span className="font-mono text-[10px] bg-surface-3 px-1 py-0.5 rounded border border-border-subtle">
                ⌘K
              </span>
            </button>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface-1 hover:bg-surface-2 border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors duration-150"
            >
              <div className="flex items-center gap-2">
                {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{theme === "dark" ? "浅色模式 (Light)" : "深色模式 (Dark)"}</span>
              </div>
            </button>
            <div className="text-[10px] text-center text-text-secondary py-1 font-mono">
              LOCAL-FIRST ARCHITECT
            </div>
          </div>
        </aside>
      )}

      {/* 主视图区 (Main View) */}
      <main
        className={`flex-1 flex flex-col min-w-0 overflow-hidden relative bg-background-void transition-all duration-200 ${
          !isFullScreenMode ? "pt-14 pb-16 md:pt-0 md:pb-0" : ""
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="flex-1 flex flex-col min-w-0 overflow-hidden h-full"
          >
            {renderContentView()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 移动端底部导航栏 (Mobile Bottom Nav) - 专注模式下隐藏 */}
      {!isFullScreenMode && (
        <nav className="fixed bottom-0 left-0 right-0 h-16 z-40 bg-surface-1/90 backdrop-blur-md border-t border-border-subtle flex items-center justify-around px-2 md:hidden">
          {navLinks.map((link) => {
            const isActive = activeTab === link.tab;
            return (
              <button
                key={link.tab}
                onClick={() => setActiveTab(link.tab)}
                className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all duration-200 ${
                  isActive ? "text-primary" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <span className={`transition-transform duration-200 ${isActive ? "scale-110 text-primary" : "text-text-secondary"}`}>
                  {link.icon}
                </span>
                <span className="text-[9px] font-medium tracking-tight truncate max-w-[60px]">
                  {link.label.replace("今日", "").replace("与输出", "").replace("AI ", "")}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* 全局命令面板 (Command Palette) */}
      <CommandPalette onTriggerWoopModal={() => setIsWoopModalOpen(true)} />
    </div>
  );
}
