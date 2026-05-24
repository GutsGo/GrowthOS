"use client";

import React, { useState } from "react";
import { db, Habit } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
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
} from "lucide-react";

export default function SettingsView() {
  const habits = useLiveQuery(() => db.habits.toArray()) || [];

  // 表单状态
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Code");
  const [energyDemand, setEnergyDemand] = useState<"high" | "medium" | "low">("medium");

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
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
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

          {/* AI 密钥预留提示 */}
          <div className="bg-gradient-to-br from-surface-1 to-surface-2 border border-border-subtle p-5 rounded-2xl space-y-3 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-ai-blue/10 rounded-full blur-xl" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-ai-blue font-mono flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-ai-blue" />
              AI Coach API 配置 (Phase 3)
            </h3>
            <p className="text-[10px] text-text-secondary leading-relaxed">
              云端智库与 API Key 将在 Phase 3 AI 注入路线中上线。届时，系统会支持通过 DeepSeek-V3/GPT-4o 驱动你的主动复盘 Agent 以及实时拟真陪练智能体。
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                disabled
                placeholder="sk-••••••••••••••••"
                className="flex-1 px-3 py-1.5 bg-surface-3 rounded-lg text-xs text-text-secondary border border-border-subtle cursor-not-allowed outline-none"
              />
              <button
                disabled
                className="px-3 py-1.5 bg-surface-3 text-text-secondary rounded-lg text-[10px] font-semibold cursor-not-allowed"
              >
                配置
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
