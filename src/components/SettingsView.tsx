"use client";

import React, { useState } from "react";
import { db, Habit } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Plus,
  Trash2,
  Sliders,
  Code,
  MessageSquare,
  Activity,
  User,
  Target,
  Sparkles,
  Info,
  Cloud,
  Database,
  Mail,
  CheckCircle,
  RefreshCw,
  LogOut,
} from "lucide-react";

export default function SettingsView() {
  const habits = useLiveQuery(() => db.habits.toArray()) || [];

  // 表单状态
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Code");
  const [energyDemand, setEnergyDemand] = useState<"high" | "medium" | "low">("medium");

  // 云端同步与登录控制台状态
  const [email, setEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // 本地 Dexie 数据量实时统计
  const cardsCount = useLiveQuery(() => db.cards.count()) || 0;
  const habitsCount = habits.length;
  const logsCount = useLiveQuery(() => db.habitLogs.count()) || 0;
  const recordsCount = useLiveQuery(() => db.dailyRecords.count()) || 0;

  // 局部 Toast 悬浮通知提示
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: "success" | "error" }>({
    show: false,
    msg: "",
    type: "success",
  });

  // 模拟发送魔法链接邮箱登录
  const handleSendMagicLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSendingLink(true);
    setTimeout(() => {
      setIsSendingLink(false);
      setIsLoggedIn(true);
      setToast({
        show: true,
        msg: `✨ 魔法链接发送成功！已为您自动登录云端空间。`,
        type: "success",
      });
      // 4 秒后自动关闭 Toast
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 4000);
    }, 1500);
  };

  // 模拟双向云端 PostgreSQL 数据库同步
  const handleCloudSync = () => {
    if (!isLoggedIn) {
      setToast({
        show: true,
        msg: `🔒 授权失败：请先输入邮箱并发送魔法链接登录后再同步。`,
        type: "error",
      });
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
      return;
    }

    setIsSyncing(true);
    const steps = [
      "正在建立与 Supabase PostgreSQL 数据库连接...",
      "比对 IndexedDB 本地数据与云端 Schema 结构...",
      "双向合并本地卡片及打卡记录...",
      "上传成功！同步成果已记录归档。",
    ];

    let currentStep = 0;
    setSyncStatusText(steps[0]);

    const interval = setInterval(() => {
      currentStep++;
      if (currentStep < steps.length) {
        setSyncStatusText(steps[currentStep]);
      } else {
        clearInterval(interval);
        setIsSyncing(false);
        const now = new Date();
        setLastSyncTime(
          `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
        );
        setToast({
          show: true,
          msg: `✨ 双向云端数据同步备份完成！共处理了 ${habitsCount + logsCount + cardsCount + recordsCount} 项数据。`,
          type: "success",
        });
        setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 4000);
      }
    }, 700);
  };

  // 注销登录
  const handleLogout = () => {
    setIsLoggedIn(false);
    setEmail("");
    setLastSyncTime(null);
    setToast({
      show: true,
      msg: "已退出云端空间，本地数据将继续完全保留在 IndexedDB 中。",
      type: "success",
    });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
  };

  // 动态渲染图标名称
  const getIconPreview = (iconName: string) => {
    switch (iconName) {
      case "Code":
        return <Code className="w-4 h-4" />;
      case "MessageSquare":
        return <MessageSquare className="w-4 h-4" />;
      case "Activity":
        return <Activity className="w-4 h-4" />;
      case "User":
        return <User className="w-4 h-4" />;
      default:
        return <Target className="w-4 h-4" />;
    }
  };

  // 添加习惯
  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await db.habits.add({
      id: crypto.randomUUID(),
      name: name.trim(),
      icon,
      frequency: "daily",
      energyDemand,
      createdAt: new Date(),
    });

    setName("");
    setIcon("Code");
    setEnergyDemand("medium");
  };

  // 删除习惯
  const handleDeleteHabit = async (id: string) => {
    if (confirm("确定要删除这个习惯项吗？删除后相关的今日打卡记录仍会保留，但它不会再出现在 Dashboard 上。")) {
      await db.habits.delete(id);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 space-y-8">
      {/* 顶部 Header */}
      <div>
        <span className="text-xs text-text-secondary font-mono uppercase tracking-widest">
          SYSTEM PREFERENCES
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight mt-1">系统设置</h1>
        <p className="text-sm text-text-secondary mt-1">
          在此定制专属你的原子习惯矩阵、API 密钥与教练干预规则。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* 左侧习惯管理器 (占 3/5) */}
        <section className="lg:col-span-3 space-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              ⚡ 原子习惯配置管理 (Atomic Habits)
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed">
              增加你的原子成长习惯，并设置其对应的认知负荷与能量阻力。系统将据此动态高亮“最易开启”的项目。
            </p>
          </div>

          {/* 习惯列表展示 */}
          <div className="space-y-3">
            {habits.length === 0 ? (
              <div className="text-center py-10 text-xs text-text-secondary bg-surface-1 rounded-xl border border-border-subtle">
                暂无配置习惯，请通过右侧表单添加。
              </div>
            ) : (
              habits.map((habit) => (
                <div
                  key={habit.id}
                  className="flex items-center justify-between p-4 bg-surface-1 rounded-xl border border-border-subtle hover:border-text-secondary transition-colors duration-150"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center text-primary">
                      {getIconPreview(habit.icon)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {habit.name}
                      </p>
                      <span className="text-[10px] text-text-secondary uppercase tracking-widest font-mono">
                        频次: 每日 · 能量负荷: {habit.energyDemand}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteHabit(habit.id)}
                    className="p-2 text-text-secondary hover:text-error transition-colors rounded-lg bg-surface-2 hover:bg-surface-3"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 右侧添加习惯表单 (占 2/5) */}
        <section className="lg:col-span-2 space-y-6">
          <form
            onSubmit={handleAddHabit}
            className="bg-surface-1 border border-border-subtle p-5 rounded-2xl space-y-4"
          >
            <h3 className="text-xs font-bold uppercase tracking-widest text-primary font-mono flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-primary" />
              添加新习惯 (Add Habit)
            </h3>

            {/* 习惯名称 */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                习惯名称
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：早起半小时晨读"
                className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none"
              />
            </div>

            {/* 习惯图标 */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                代表图标
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { name: "Code", label: "代码" },
                  { name: "MessageSquare", label: "英语" },
                  { name: "Activity", label: "力量" },
                  { name: "User", label: "社交" },
                ].map((ic) => {
                  const isSelected = icon === ic.name;
                  return (
                    <button
                      key={ic.name}
                      type="button"
                      onClick={() => setIcon(ic.name)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border-subtle bg-surface-2 text-text-secondary hover:border-text-secondary"
                      }`}
                    >
                      {getIconPreview(ic.name)}
                      <span className="text-[8px] mt-1 font-sans">{ic.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 能量需求 */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono block">
                能量阻力分级
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: "low", label: "Low (轻松)" },
                  { val: "medium", label: "Medium (中等)" },
                  { val: "high", label: "High (挑战)" },
                ].map((level) => {
                  const isSelected = energyDemand === level.val;
                  return (
                    <button
                      key={level.val}
                      type="button"
                      onClick={() => setEnergyDemand(level.val as "low" | "medium" | "high")}
                      className={`py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border-subtle bg-surface-2 text-text-secondary hover:border-text-secondary"
                      }`}
                    >
                      {level.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-primary hover:bg-primary-hover text-primary-text transition-all rounded-full text-xs font-bold uppercase tracking-widest"
            >
              保存原子习惯
            </button>
          </form>

          {/* 云端同步与登录控制中心 */}
          <div className="bg-gradient-to-br from-surface-1 to-surface-2 border border-border-subtle p-5 rounded-2xl space-y-4 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-primary/10 rounded-full blur-xl animate-pulse" />
            
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary font-mono flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-primary" />
                Supabase 云端同步中心
              </h3>
              <span className="text-[9px] bg-primary/10 text-primary font-bold font-mono px-1.5 py-0.5 rounded uppercase">
                Local-First
              </span>
            </div>

            {/* 1. 登录模块 */}
            {isLoggedIn ? (
              <div className="space-y-3 p-3 bg-surface-2/60 rounded-xl border border-border-subtle/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span className="text-text-primary font-semibold truncate max-w-[140px]">{email || "GrowthOS 用户"}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-[10px] text-error hover:underline flex items-center gap-1 font-semibold"
                  >
                    <LogOut className="w-3 h-3" /> 注销
                  </button>
                </div>
                <p className="text-[10px] text-text-secondary">
                  已与云端备份成功对接。离线数据将自动在本地沙箱进行安全双写同步。
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendMagicLink} className="space-y-2">
                <p className="text-[10px] text-text-secondary leading-relaxed">
                  输入您的云端邮箱，我们将发送 Magic Link 魔法链接。点击即自动完成 GrowthOS 的登录与云端空间授权。
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 relative flex items-center">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-7 pr-3 py-1.5 bg-surface-2 rounded-lg text-xs text-text-primary border border-border-subtle focus:border-primary outline-none font-mono"
                    />
                    <Mail className="w-3.5 h-3.5 text-neutral-gray absolute left-2" />
                  </div>
                  <button
                    type="submit"
                    disabled={isSendingLink}
                    className="bg-primary hover:bg-primary-hover text-black px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider flex items-center gap-1"
                  >
                    {isSendingLink ? (
                      <span className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    ) : "登录"}
                  </button>
                </div>
              </form>
            )}

            {/* 2. 本地数据盘点与同步执行 */}
            <div className="pt-3 border-t border-border-subtle/50 space-y-3">
              <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
                <span>本地数据盘点 (IndexedDB)</span>
                <span className="text-text-primary font-bold">共 {habitsCount + logsCount + cardsCount + recordsCount} 项</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-[9px] text-text-secondary font-mono">
                <div className="bg-surface-2 p-1.5 rounded border border-border-subtle/50 flex justify-between">
                  <span>习惯:</span>
                  <span className="text-text-primary font-bold">{habitsCount}</span>
                </div>
                <div className="bg-surface-2 p-1.5 rounded border border-border-subtle/50 flex justify-between">
                  <span>打卡:</span>
                  <span className="text-text-primary font-bold">{logsCount}</span>
                </div>
                <div className="bg-surface-2 p-1.5 rounded border border-border-subtle/50 flex justify-between">
                  <span>闪卡:</span>
                  <span className="text-text-primary font-bold">{cardsCount}</span>
                </div>
                <div className="bg-surface-2 p-1.5 rounded border border-border-subtle/50 flex justify-between">
                  <span>意图:</span>
                  <span className="text-text-primary font-bold">{recordsCount}</span>
                </div>
              </div>

              {isSyncing ? (
                <div className="py-2 space-y-2">
                  <div className="h-1 bg-surface-3 rounded-full overflow-hidden relative">
                    <div className="absolute top-0 bottom-0 left-0 bg-primary w-2/3 rounded-full animate-pulse" />
                  </div>
                  <p className="text-[9px] text-primary font-mono animate-pulse">{syncStatusText}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCloudSync}
                  className="w-full py-2 bg-surface-3 hover:bg-primary hover:text-black transition-all duration-200 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-border-subtle"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>与 Supabase 云端 PostgreSQL 同步</span>
                </button>
              )}

              {lastSyncTime && (
                <div className="text-[9px] text-neutral-gray text-right font-mono">
                  上次同步时间: {lastSyncTime}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Toast 提示通知层 */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed bottom-6 left-6 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 font-mono ${
              toast.type === "success"
                ? "bg-surface-1 border-primary/40 text-primary shadow-[0_0_15px_rgba(29,185,84,0.2)]"
                : "bg-surface-1 border-error/40 text-error shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            }`}
          >
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
