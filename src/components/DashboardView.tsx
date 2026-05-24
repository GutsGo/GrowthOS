"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { db, Habit, HabitLog, DailyRecord } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code,
  MessageSquare,
  Activity,
  User,
  Zap,
  Check,
  Plus,
  BookOpen,
  ArrowRight,
  Sparkles,
  Info,
  X,
  Target,
} from "lucide-react";

interface DashboardViewProps {
  isWoopModalOpen: boolean;
  setIsWoopModalOpen: (open: boolean) => void;
}

// 动态映射 Lucide 图标
const getHabitIcon = (iconName: string) => {
  switch (iconName) {
    case "Code":
      return <Code className="w-5 h-5" />;
    case "MessageSquare":
      return <MessageSquare className="w-5 h-5" />;
    case "Activity":
      return <Activity className="w-5 h-5" />;
    case "User":
      return <User className="w-5 h-5" />;
    default:
      return <Target className="w-5 h-5" />;
  }
};

export default function DashboardView({
  isWoopModalOpen,
  setIsWoopModalOpen,
}: DashboardViewProps) {
  const { currentDate, setActiveTab, setReviewMode, setFlowTimerMinutes } = useAppStore();

  // 从本地数据库读取数据
  const habits = useLiveQuery(() => db.habits.toArray()) || [];
  const todayLogs = useLiveQuery(() => db.habitLogs.where({ date: currentDate }).toArray()) || [];
  const todayRecord = useLiveQuery(() => db.dailyRecords.get(currentDate));
  
  // 查询今日到期需要复习的卡片数
  const overdueCardsCount = useLiveQuery(async () => {
    const now = new Date();
    return await db.cards.filter((c) => c.nextReview <= now).count();
  }) || 0;

  // 连续打卡天数（计算包含今天在内的连续有打卡记录的活跃天数，此处做轻量化连续打卡统计）
  const streakDays = useLiveQuery(async () => {
    const logs = await db.habitLogs.toArray();
    if (logs.length === 0) return 0;
    
    // 获取所有打卡日期并去重、排序
    const dates = Array.from(new Set(logs.map((l) => l.date))).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );
    
    let streak = 0;
    let checkDate = new Date();
    
    // 如果今天或昨天有打卡，则开始计算连击
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${date}`;
    };

    const todayStr = formatDate(checkDate);
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayStr = formatDate(checkDate);

    if (!dates.includes(todayStr) && !dates.includes(yesterdayStr)) {
      return 0;
    }

    checkDate = dates.includes(todayStr) ? new Date() : checkDate;

    while (true) {
      const targetStr = formatDate(checkDate);
      if (dates.includes(targetStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }) || 0;

  // 今日能量滑块状态
  const [energy, setEnergy] = useState<number>(5);

  useEffect(() => {
    if (todayRecord?.energyLevel !== undefined) {
      setEnergy(todayRecord.energyLevel);
    }
  }, [todayRecord]);

  // 修改今日能量值并写入数据库
  const handleEnergyChange = async (val: number) => {
    setEnergy(val);
    const record = await db.dailyRecords.get(currentDate);
    await db.dailyRecords.put({
      date: currentDate,
      woopWish: record?.woopWish || "",
      woopOutcome: record?.woopOutcome || "",
      woopObstacle: record?.woopObstacle || "",
      woopPlan: record?.woopPlan || "",
      energyLevel: val,
      createdAt: record?.createdAt || new Date(),
    });
  };

  // 打卡操作
  const toggleHabitLog = async (habitId: string) => {
    const existing = await db.habitLogs.where({ habitId, date: currentDate }).first();
    if (existing) {
      await db.habitLogs.delete(existing.id);
    } else {
      await db.habitLogs.add({
        id: crypto.randomUUID(),
        habitId,
        date: currentDate,
        createdAt: new Date(),
      });
    }
  };

  // 今日打卡过习惯的集合，用于 O(1) 渲染
  const loggedHabitIds = useMemo(() => {
    return new Set(todayLogs.map((l) => l.habitId));
  }, [todayLogs]);

  // 本地能量高亮推荐规则
  // 能量 >= 7 高亮 high; 5-6 高亮 medium; <= 4 高亮 low
  const recommendedDemand = useMemo(() => {
    if (energy >= 7) return "high";
    if (energy >= 5) return "medium";
    return "low";
  }, [energy]);

  // WOOP 表单状态
  const [wish, setWish] = useState("");
  const [outcome, setOutcome] = useState("");
  const [obstacle, setObstacle] = useState("");
  const [plan, setPlan] = useState("");

  // 当打开 Modal 时，填充今日已有数据
  useEffect(() => {
    if (isWoopModalOpen && todayRecord) {
      setWish(todayRecord.woopWish || "");
      setOutcome(todayRecord.woopOutcome || "");
      setObstacle(todayRecord.woopObstacle || "");
      setPlan(todayRecord.woopPlan || "");
    }
  }, [isWoopModalOpen, todayRecord]);

  const handleSaveWoop = async (e: React.FormEvent) => {
    e.preventDefault();
    await db.dailyRecords.put({
      date: currentDate,
      woopWish: wish,
      woopOutcome: outcome,
      woopObstacle: obstacle,
      woopPlan: plan,
      energyLevel: energy,
      createdAt: todayRecord?.createdAt || new Date(),
    });
    setIsWoopModalOpen(false);
  };

  // 处理到期复习跳转
  const handleStartReview = () => {
    setReviewMode(true);
    setActiveTab("flow");
  };

  // 处理 AI 教练挑战
  const handleAcceptChallenge = () => {
    setFlowTimerMinutes(15); // 设定挑战为 15 分钟番茄钟
    setReviewMode(false);
    setActiveTab("flow");
  };

  // 格式化顶部友好日期
  const friendlyDate = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      month: "short",
      day: "numeric",
    };
    return new Date(currentDate).toLocaleDateString("zh-CN", options);
  }, [currentDate]);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
      {/* 顶部 Header Area */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <p className="text-xs text-text-secondary font-mono uppercase tracking-widest">
            {friendlyDate}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1 text-text-primary">
            今日指挥舱
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            你已经连续打卡 <span className="text-primary font-bold">{streakDays}</span> 天 🔥 继续保持！
          </p>
        </div>

        {/* 能量管理滑块 */}
        <div className="w-full md:w-[280px] bg-surface-1 p-4 rounded-xl border border-border-subtle flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-text-secondary font-semibold flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-primary" /> 今日能量状态
            </span>
            <span className="text-primary font-bold text-sm">{energy} / 10</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={energy}
            onChange={(e) => handleEnergyChange(Number(e.target.value))}
            className="w-full h-1 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <span className="text-[10px] text-text-secondary text-right">
            AI 已根据此调整今日习惯阻力高亮
          </span>
        </div>
      </header>

      {/* 主体 Grid 布局 (2列) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左侧大列 (占比 60% -> 3/5) */}
        <div className="lg:col-span-3 space-y-6">
          {/* WOOP 意图卡片 */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary font-mono flex items-center gap-2">
              <span>🎯 WOOP 意图设定</span>
            </h2>
            
            {todayRecord && todayRecord.woopWish ? (
              <div className="bg-surface-1 rounded-xl p-5 border border-border-subtle relative group overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                <button
                  onClick={() => setIsWoopModalOpen(true)}
                  className="absolute top-4 right-4 text-xs text-text-secondary hover:text-primary transition-colors font-semibold"
                >
                  编辑意图
                </button>
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-primary font-bold block mb-1">
                      Wish 愿望
                    </span>
                    <p className="text-text-primary text-sm font-semibold">{todayRecord.woopWish}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border-subtle/50">
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-ai-blue font-bold block mb-1">
                        Outcome 最佳结果
                      </span>
                      <p className="text-text-secondary text-xs">{todayRecord.woopOutcome}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-amber-500 font-bold block mb-1">
                        Obstacle 潜在障碍
                      </span>
                      <p className="text-text-secondary text-xs">{todayRecord.woopObstacle}</p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border-subtle/50">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-500 font-bold block mb-1">
                      If-Then Plan 应对计划
                    </span>
                    <p className="text-text-primary text-xs font-mono bg-surface-2 p-2.5 rounded border border-border-subtle">
                      💡 {todayRecord.woopPlan}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsWoopModalOpen(true)}
                className="w-full flex flex-col items-center justify-center py-10 px-6 rounded-xl border-2 border-dashed border-border-subtle hover:border-primary/50 bg-surface-1/40 hover:bg-surface-1 transition-all duration-200 text-center group"
              >
                <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center text-text-secondary group-hover:text-primary group-hover:scale-110 transition-all duration-200">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-text-primary mt-3 group-hover:text-primary transition-colors">
                  设定今日 WOOP 意图
                </span>
                <span className="text-xs text-text-secondary mt-1 max-w-[280px]">
                  用科学方法锁定今日愿望，预测障碍并制定应对策略
                </span>
              </button>
            )}
          </section>

          {/* 习惯矩阵 */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary font-mono flex items-center gap-2">
              <span>⚡ 习惯打卡矩阵 (Habit Grid)</span>
            </h2>
            
            {habits.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-secondary bg-surface-1 rounded-xl border border-border-subtle">
                暂无习惯。请前往 [系统设置] 页面添加你的第一个原子习惯。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {habits.map((habit) => {
                  const isLogged = loggedHabitIds.has(habit.id);
                  const isRecommended = habit.energyDemand === recommendedDemand && !isLogged;
                  
                  return (
                    <motion.div
                      key={habit.id}
                      whileHover={{ scale: 1.03 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      onClick={() => toggleHabitLog(habit.id)}
                      className={`relative p-4 rounded-xl border cursor-pointer select-none transition-all duration-200 overflow-hidden flex items-center justify-between ${
                        isLogged
                          ? "bg-surface-1 border-primary/40 shadow-[0_0_12px_rgba(29,185,84,0.15)]"
                          : isRecommended
                          ? "bg-surface-1 border-primary shadow-[0_0_15px_rgba(29,185,84,0.25)]"
                          : "bg-surface-1 border-border-subtle hover:border-text-secondary"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                            isLogged
                              ? "bg-primary text-black"
                              : isRecommended
                              ? "bg-primary/20 text-primary animate-pulse"
                              : "bg-surface-3 text-text-secondary"
                          }`}
                        >
                          {getHabitIcon(habit.icon)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-text-primary">{habit.name}</p>
                          <span className="text-[10px] text-text-secondary uppercase tracking-widest font-mono">
                            阻力: {habit.energyDemand} 能量
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isRecommended && (
                          <span className="text-[9px] bg-primary/20 text-primary font-bold font-mono px-1.5 py-0.5 rounded uppercase tracking-wider">
                            当前最宜
                          </span>
                        )}
                        <div
                          className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                            isLogged
                              ? "bg-primary border-primary text-black"
                              : "border-muted-gray group-hover:border-text-secondary bg-transparent"
                          }`}
                        >
                          {isLogged && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* 右侧小列 (占比 40% -> 2/5) */}
        <div className="lg:col-span-2 space-y-6">
          {/* SM-2 记忆卡片复习引导 */}
          <section className="bg-surface-1 p-5 rounded-xl border border-border-subtle flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-text-secondary font-mono flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-ai-blue" /> 记忆卡片队列
              </span>
              {overdueCardsCount > 0 && (
                <span className="text-[10px] bg-error/20 text-error font-bold px-2 py-0.5 rounded-full">
                  今日待复习
                </span>
              )}
            </div>
            
            <div className="py-2">
              <h3 className="text-3xl font-extrabold tracking-tight">
                {overdueCardsCount} <span className="text-sm text-text-secondary font-normal">张卡片到期</span>
              </h3>
              <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                间隔重复算法 (SM-2) 已为你计算出今日黄金复习时间。复习有助于打破遗忘曲线。
              </p>
            </div>

            <button
              onClick={handleStartReview}
              disabled={overdueCardsCount === 0}
              className={`w-full py-2.5 rounded-full font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                overdueCardsCount > 0
                  ? "bg-primary text-primary-text hover:bg-primary-hover hover:scale-[1.04]"
                  : "bg-surface-3 text-text-secondary cursor-not-allowed"
              }`}
            >
              <span>开始复习</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </section>

          {/* AI 教练洞察 */}
          <section className="bg-gradient-to-br from-surface-1 to-surface-2 p-5 rounded-xl border border-border-subtle flex flex-col gap-4 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-ai-blue/10 rounded-full blur-2xl" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-ai-blue/20 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-ai-blue" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-ai-blue font-mono">
                AI Coach Insight
              </span>
            </div>

            <div>
              <p className="text-xs text-text-primary leading-relaxed font-semibold">
                “你今天尚未进行 AI 编码深度训练。根据当前的高能量状态（{energy}/10），我为你生成了一个 15 分钟的 TypeScript 泛型实战挑战，是否立即开启？”
              </p>
            </div>

            <div className="flex gap-2 pt-2 z-10">
              <button
                onClick={handleAcceptChallenge}
                className="flex-1 bg-surface-3 hover:bg-primary hover:text-black transition-colors duration-150 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
              >
                接受挑战 (15m)
              </button>
              <button
                onClick={() => {}}
                className="px-3 bg-surface-3/50 hover:bg-surface-3 py-2 rounded-lg text-xs text-text-secondary transition-colors"
              >
                忽略
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* WOOP 弹窗 Modal */}
      <AnimatePresence>
        {isWoopModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-[500px] bg-surface-1 border border-border-subtle rounded-xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
                <h3 className="font-extrabold text-sm flex items-center gap-2 text-primary uppercase tracking-wider">
                  <Target className="w-4 h-4" /> 设定今日意图 (WOOP)
                </h3>
                <button
                  onClick={() => setIsWoopModalOpen(false)}
                  className="text-text-secondary hover:text-text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveWoop} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-primary">
                    Wish 愿望
                  </label>
                  <input
                    type="text"
                    required
                    value={wish}
                    onChange={(e) => setWish(e.target.value)}
                    placeholder="今天你最想实现的事情是？(例如：写完 WOOP 模块代码)"
                    className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-ai-blue">
                    Outcome 最佳结果
                  </label>
                  <input
                    type="text"
                    required
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="实现这个愿望会带给你什么好处和成就感？"
                    className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-amber-500">
                    Obstacle 潜在障碍
                  </label>
                  <input
                    type="text"
                    required
                    value={obstacle}
                    onChange={(e) => setObstacle(e.target.value)}
                    placeholder="在实现过程中，你最可能遇到什么内心/外部阻碍？"
                    className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">
                    If-Then Plan 应对计划
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    placeholder="如果 [障碍发生]，那么我将 [执行某个应对措施]"
                    className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 mt-2 bg-primary hover:bg-primary-hover transition-colors rounded-full text-primary-text text-xs font-bold uppercase tracking-widest"
                >
                  保存今日意图
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
