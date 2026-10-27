"use client";

import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useAppStore, AppTab } from "@/lib/store";
import { db, trackDeletion } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Command,
  Zap,
  CheckCircle,
  BookOpen,
  ArrowRight,
  Layers,
  Flame,
  HelpCircle,
  Repeat,
} from "lucide-react";

interface CommandPaletteProps {
  onTriggerWoopModal?: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  category: "命令" | "导航" | "打卡" | "记忆卡片";
  icon: React.ReactNode;
  action: () => void;
}

export default function CommandPalette({ onTriggerWoopModal }: CommandPaletteProps) {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    setActiveTab,
  } = useAppStore();

  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 改搜索词时把高亮归零。
   *
   * 原来是一个 `useEffect(..., [search])` 干这件事：先让搜索词变、渲染一轮，
   * 再在 effect 里把索引改回 0、又渲染一轮。而「结果变短了」的那一帧里，
   * `commandItems[selectedIndex]` 可能是 undefined —— 回车正好落在这帧就会击空。
   * 现在改搜索词和归零是同一次事件里的两次 setState，React 会合并成一次渲染，
   * 中间那一帧不存在了。
   */
  const applySearch = useCallback((next: string) => {
    setSearch(next);
    setSelectedIndex(0);
  }, []);

  // 从数据库动态拉取习惯与卡片。同 StatsView：`|| []` 每帧新建空数组，
  // 会让下面那个 useMemo（搜索结果）每帧重算，拆成两行把引用稳定下来。
  const habitsRaw = useLiveQuery(() => db.habits.toArray());
  const cardsRaw = useLiveQuery(() => db.cards.toArray());
  const habits = useMemo(() => habitsRaw ?? [], [habitsRaw]);
  const cards = useMemo(() => cardsRaw ?? [], [cardsRaw]);

  // 快捷关闭
  const closePalette = useCallback(() => {
    applySearch("");
    setCommandPaletteOpen(false);
  }, [applySearch, setCommandPaletteOpen]);

  // 快捷键监听
  useEffect(() => {
    if (isCommandPaletteOpen) {
      inputRef.current?.focus();
      // 打开时禁止外层滚动
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [isCommandPaletteOpen, closePalette]);

  // 监听点击外部关闭
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePalette();
      }
    };
    if (isCommandPaletteOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isCommandPaletteOpen, closePalette]);

  // 核心路由与指令定义
  const commandItems = useMemo(() => {
    const items: CommandItem[] = [];
    const lowerSearch = search.toLowerCase().trim();

    // 1. 解析 `/goto` 路由指令
    // 路由表与 page.tsx 的 5+1 导航保持一致：主路径在前，支撑在后。
    const tabs: { name: string; label: string; icon: React.ReactNode }[] = [
      { name: "dashboard", label: "今日", icon: <Flame className="w-4 h-4 text-primary" /> },
      { name: "review", label: "复习", icon: <Repeat className="w-4 h-4 text-primary" /> },
      { name: "output", label: "输出", icon: <Zap className="w-4 h-4 text-amber-500" /> },
      { name: "brain", label: "制卡", icon: <BookOpen className="w-4 h-4 text-emerald-500" /> },
      { name: "board", label: "看板", icon: <Layers className="w-4 h-4 text-purple-500" /> },
      { name: "settings", label: "设置", icon: <HelpCircle className="w-4 h-4 text-gray-500" /> },
    ];

    if (lowerSearch.startsWith("/goto")) {
      const filterStr = lowerSearch.slice(5).trim();
      tabs.forEach((tab) => {
        if (!filterStr || tab.label.toLowerCase().includes(filterStr) || tab.name.includes(filterStr)) {
          items.push({
            id: `goto-${tab.name}`,
            title: `跳转至${tab.label}`,
            subtitle: `切换页面`,
            category: "导航",
            icon: tab.icon,
            action: () => {
              setActiveTab(tab.name as AppTab);
              closePalette();
            },
          });
        }
      });
      return items;
    }

    // 2. 解析 `/habit` 习惯打卡指令
    if (lowerSearch.startsWith("/habit")) {
      const filterStr = lowerSearch.slice(6).trim();
      habits.forEach((habit) => {
        if (!filterStr || habit.name.toLowerCase().includes(filterStr)) {
          items.push({
            id: `habit-${habit.id}`,
            title: `打卡：${habit.name}`,
            subtitle: `勾选习惯 · 能量 ${habit.energyDemand}`,
            category: "打卡",
            icon: <CheckCircle className="w-4 h-4 text-primary" />,
            action: async () => {
              const today = new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }).replace(/\//g, "-");
              // 检查今日是否已打卡
              const existingLog = await db.habitLogs.where({ habitId: habit.id, date: today }).first();
              if (!existingLog) {
                await db.habitLogs.add({
                  id: crypto.randomUUID(),
                  habitId: habit.id,
                  date: today,
                  createdAt: new Date(),
                });
              } else {
                // 已打卡则取消打卡
                await db.habitLogs.delete(existingLog.id);
                await trackDeletion("habitLogs", existingLog.id);
              }
              closePalette();
            },
          });
        }
      });
      return items;
    }

    // 3. 基础指令和快捷菜单 (当 search 不以特殊前缀开头时展示)
    if (!lowerSearch.startsWith("/")) {
      // 模糊搜索卡片与笔记
      const matchedCards = cards.filter(
        (c) =>
          c.front.toLowerCase().includes(lowerSearch) ||
          c.back.toLowerCase().includes(lowerSearch) ||
          c.tags.some((t) => t.toLowerCase().includes(lowerSearch))
      );

      matchedCards.slice(0, 5).forEach((card) => {
        items.push({
          id: `card-${card.id}`,
          title: `卡片：${card.front.substring(0, 40)}${card.front.length > 40 ? "..." : ""}`,
          subtitle: `标签：${card.tags.join(", ") || "无"}`,
          category: "记忆卡片",
          icon: <BookOpen className="w-4 h-4 text-ai-blue" />,
          action: () => {
            setActiveTab("brain"); // 跳转至知识库复习
            closePalette();
          },
        });
      });

      // 默认基础快捷动作
      if (lowerSearch === "") {
        items.push({
          id: "cmd-woop",
          title: "设定今日意图 (/woop)",
          subtitle: "愿望、结果、障碍、应对",
          category: "命令",
          icon: <Zap className="w-4 h-4 text-amber-500" />,
          action: () => {
            closePalette();
            onTriggerWoopModal?.();
          },
        });
        
        items.push({
          id: "cmd-review",
          title: "开始复习 (/review)",
          subtitle: "复习今日到期卡片（SM-2）",
          category: "命令",
          icon: <BookOpen className="w-4 h-4 text-ai-blue" />,
          action: () => {
            setActiveTab("review"); // 复习已经从「专注」里独立出来
            closePalette();
          },
        });
      }
    }

    // 当输入斜杠但未输入完整指令时提示
    if (lowerSearch === "/") {
      items.push({
        id: "hint-goto",
        title: "/goto",
        subtitle: "切换页面 (如 /goto dashboard)",
        category: "命令",
        icon: <ArrowRight className="w-4 h-4 text-gray-400" />,
        action: () => applySearch("/goto "),
      });
      items.push({
        id: "hint-habit",
        title: "/habit",
        subtitle: "习惯打卡 (如 /habit AI编程)",
        category: "命令",
        icon: <ArrowRight className="w-4 h-4 text-gray-400" />,
        action: () => applySearch("/habit "),
      });
      items.push({
        id: "hint-woop",
        title: "/woop",
        subtitle: "创建今日 WOOP",
        category: "命令",
        icon: <ArrowRight className="w-4 h-4 text-gray-400" />,
        action: () => {
          closePalette();
          onTriggerWoopModal?.();
        },
      });
    }

    return items;
  }, [search, habits, cards, setActiveTab, onTriggerWoopModal, applySearch, closePalette]);

  // 键盘操作绑定
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isCommandPaletteOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(commandItems.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + commandItems.length) % Math.max(commandItems.length, 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (commandItems[selectedIndex]) {
          commandItems[selectedIndex].action();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen, commandItems, selectedIndex]);

  return (
    <AnimatePresence>
      {isCommandPaletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.96, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            ref={containerRef}
            className="w-full max-w-[640px] overflow-hidden rounded-xl border border-border-subtle bg-surface-1 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
          >
            {/* 输入搜索栏 */}
            <div className="flex items-center gap-3 px-4 border-b border-border-subtle h-14">
              <Search className="w-5 h-5 text-neutral-gray" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => applySearch(e.target.value)}
                placeholder="输入 / 唤起指令，或搜索卡片"
                className="flex-1 h-full text-base bg-transparent border-0 outline-none text-text-primary placeholder:text-neutral-gray"
              />
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border-subtle bg-surface-2 text-xs text-neutral-gray font-mono">
                <Command className="w-3 h-3" />
                <span>K</span>
              </div>
            </div>

            {/* 指令列表项 */}
            <div className="max-h-[360px] overflow-y-auto py-2">
              {commandItems.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-neutral-gray">
                  没有匹配的指令或卡片。
                </div>
              ) : (
                commandItems.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => item.action()}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 ${
                        isSelected ? "bg-surface-2" : "hover:bg-surface-2/40"
                      }`}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3">
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-semibold truncate ${isSelected ? "text-primary" : "text-text-primary"}`}>
                            {item.title}
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-gray px-1.5 py-0.5 rounded bg-surface-3">
                            {item.category}
                          </span>
                        </div>
                        <div className="text-xs text-text-secondary truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 底部引导栏 */}
            <div className="flex items-center justify-between px-4 h-10 border-t border-border-subtle bg-surface-2 text-[11px] text-neutral-gray">
              <div className="flex items-center gap-4">
                <span>
                  <kbd className="font-mono bg-surface-3 px-1 py-0.5 rounded border border-border-subtle">↑↓</kbd> 导航
                </span>
                <span>
                  <kbd className="font-mono bg-surface-3 px-1 py-0.5 rounded border border-border-subtle">Enter</kbd> 选择
                </span>
                <span>
                  <kbd className="font-mono bg-surface-3 px-1 py-0.5 rounded border border-border-subtle">Esc</kbd> 关闭
                </span>
              </div>
              <span className="font-mono text-[9px] tracking-wider uppercase">GrowthOS MVP v1.0</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
