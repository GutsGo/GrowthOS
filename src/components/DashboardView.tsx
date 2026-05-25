"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { db, Habit, HabitLog, DailyRecord, trackDeletion } from "@/lib/db";
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
  Lock,
  Unlock,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import SpotlightCard from "./reactbits/SpotlightCard";
import SpecializedRecordModal from "./SpecializedRecordModal";
import { Reorder } from "framer-motion";

const MotionSpotlightCard = motion.create(SpotlightCard);

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

  // 挂载状态，防止日期等状态发生服务端与客户端水合不一致问题
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 拖拽排序状态
  const [sortedHabits, setSortedHabits] = useState<Habit[]>([]);
  const [isSorting, setIsSorting] = useState(false);

  useEffect(() => {
    if (habits.length > 0) {
      const sorted = [...habits].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setSortedHabits(sorted);
    }
  }, [habits]);

  const handleSortEnd = async (newOrderList: Habit[]) => {
    setSortedHabits(newOrderList);
    for (let i = 0; i < newOrderList.length; i++) {
      await db.habits.update(newOrderList[i].id, { order: i });
    }
  };

  // 特化习惯打卡弹窗状态
  const [isSpecializedOpen, setIsSpecializedOpen] = useState(false);
  const [activeSpecializedHabit, setActiveSpecializedHabit] = useState<Habit | null>(null);

  // AI 每日行动排程状态
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [aiTasksParticles, setAiTasksParticles] = useState<Record<string, any[]>>({});

  // 晚间灵魂复盘状态
  const [isReviewing, setIsReviewing] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<string[]>([]);
  const [ans1, setAns1] = useState("");
  const [ans2, setAns2] = useState("");
  const [ans3, setAns3] = useState("");
  const [particles, setParticles] = useState<any[]>([]);
  const [habitParticles, setHabitParticles] = useState<Record<string, any[]>>({});

  // 统计历史 7 天打卡率，用于 AI RAG 调度
  const getPast7DaysStats = async () => {
    const last7Days: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      last7Days.push(`${year}-${month}-${date}`);
    }

    const logs = await db.habitLogs.where("date").anyOf(last7Days).toArray();
    
    return habits.map((habit) => {
      const habitLogs = logs.filter((l) => l.habitId === habit.id);
      return {
        habitId: habit.id,
        name: habit.name,
        completedCount: habitLogs.length,
        totalCount: 7,
        rate: habitLogs.length / 7,
      };
    });
  };

  // 触发生成 AI 排程
  const handleGenerateAiTasks = async () => {
    setIsGeneratingTasks(true);
    try {
      const historyStats = await getPast7DaysStats();
      const res = await fetch("/api/generate-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          energy,
          woopWish: todayRecord?.woopWish || "",
          woopPlan: todayRecord?.woopPlan || "",
          historyStats,
        }),
      });

      if (!res.ok) throw new Error("生成 AI 任务排程失败");
      const data = await res.json() as { tasks: any[] };
      
      await db.dailyRecords.put({
        date: currentDate,
        woopWish: todayRecord?.woopWish || "",
        woopOutcome: todayRecord?.woopOutcome || "",
        woopObstacle: todayRecord?.woopObstacle || "",
        woopPlan: todayRecord?.woopPlan || "",
        energyLevel: energy,
        reviewQuestions: todayRecord?.reviewQuestions || [],
        reviewAnswers: todayRecord?.reviewAnswers || [],
        reviewCompletedAt: todayRecord?.reviewCompletedAt || undefined,
        createdAt: todayRecord?.createdAt || new Date(),
        aiTasks: data.tasks.map((t: any) => ({ ...t, isCompleted: false })),
        aiTasksGeneratedAt: new Date(),
      });
    } catch (e) {
      console.error(e);
      alert("AI 任务编排引擎异常，请检查网络或稍后重试");
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  // 切换 AI 任务完成状态
  const toggleAiTask = async (taskId: string) => {
    if (!todayRecord || !todayRecord.aiTasks) return;
    
    const updatedTasks = todayRecord.aiTasks.map((t) => {
      if (t.id === taskId) {
        const nextStatus = !t.isCompleted;
        if (nextStatus) {
          triggerAiTaskConfetti(taskId);
        }
        return {
          ...t,
          isCompleted: nextStatus,
          completedAt: nextStatus ? new Date() : undefined,
        };
      }
      return t;
    });

    await db.dailyRecords.put({
      ...todayRecord,
      aiTasks: updatedTasks,
    });
  };

  const triggerAiTaskConfetti = (taskId: string) => {
    const colors = ["#3b82f6", "#60a5fa", "#1DB954", "#10b981"];
    const newParticles = Array.from({ length: 12 }).map((_, idx) => ({
      id: idx,
      angle: (idx / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
      speed: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    setAiTasksParticles((prev) => ({ ...prev, [taskId]: newParticles }));
    setTimeout(() => {
      setAiTasksParticles((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }, 1000);
  };

  // 保存特化习惯打卡数据
  const handleSaveSpecializedLog = async (customData: any, imageUrl?: string) => {
    if (!activeSpecializedHabit) return;
    
    const habitId = activeSpecializedHabit.id;
    await db.habitLogs.add({
      id: crypto.randomUUID(),
      habitId,
      date: currentDate,
      customData,
      imageUrl,
      createdAt: new Date(),
    });

    const colors = ["#1DB954", "#1ED760", "#3b82f6", "#10b981"];
    const newParticles = Array.from({ length: 15 }).map((_, idx) => ({
      id: idx,
      angle: (idx / 15) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
      speed: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    setHabitParticles((prev) => ({ ...prev, [habitId]: newParticles }));
    setTimeout(() => {
      setHabitParticles((prev) => {
        const next = { ...prev };
        delete next[habitId];
        return next;
      });
    }, 1000);

    setIsSpecializedOpen(false);
    setActiveSpecializedHabit(null);
  };

  // 判定当前时间是否达到 21:00 晚间复盘最佳时间
  const [isAfterReviewTime, setIsAfterReviewTime] = useState(false);
  useEffect(() => {
    const checkTime = () => {
      const hours = new Date().getHours();
      setIsAfterReviewTime(hours >= 21);
    };
    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // 自研轻量级 Confetti 爆炸撒花效果，避免引入外部依赖
  const triggerConfetti = () => {
    const colors = ["#1DB954", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#10b981"];
    const tempParticles = Array.from({ length: 45 }).map((_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 60, // 初始随机偏移
      y: (Math.random() - 0.5) * 60,
      color: colors[Math.floor(Math.random() * colors.length)],
      angle: Math.random() * Math.PI * 2,
      speed: 4 + Math.random() * 8,
      size: 4 + Math.random() * 6,
    }));
    setParticles(tempParticles);
    // 3 秒后清空粒子
    setTimeout(() => setParticles([]), 3000);
  };

  // 开始灵魂复盘，拉取问题并支持降级
  const handleStartReviewFlow = async () => {
    setIsReviewing(true);
    setIsReviewLoading(true);
    try {
      const payload = {
        date: currentDate,
        woop: {
          wish: todayRecord?.woopWish || "",
          outcome: todayRecord?.woopOutcome || "",
          obstacle: todayRecord?.woopObstacle || "",
          plan: todayRecord?.woopPlan || "",
        },
        energy: energy,
        habits: habits.map((h) => {
          const log = todayLogs.find((l) => l.habitId === h.id);
          return {
            name: h.name,
            logged: !!log,
            customData: log?.customData || null,
            customFormType: h.customFormType || "none",
          };
        }),
        cardsCount: overdueCardsCount,
        aiTasks: todayRecord?.aiTasks || [],
      };

      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("获取复盘问题失败");
      const data = await res.json() as { questions: string[] };
      setReviewQuestions(data.questions || []);
    } catch (e) {
      console.warn("AI 复盘接口请求失败，启用本地自适应问题生成器:", e);
      // 根据打卡率生成降级本地问题
      const total = habits.length;
      const completed = habits.filter((h) => loggedHabitIds.has(h.id)).length;
      const rate = total > 0 ? completed / total : 1;
      const wishStr = todayRecord?.woopWish || "今日设定目标";
      const obstacleStr = todayRecord?.woopObstacle || "设定障碍";

      if (rate === 1) {
        setReviewQuestions([
          "今日达成 100% 打卡！在顺风时刻，你觉得哪个习惯给你带来了最大的心流状态？",
          "回顾今日愿望：“" + wishStr + "”，既然已完成，明天的成长边界你打算推到哪里？",
          "如果明天遇到突发的 3 分低能量状态，你将如何保住这一连击？有何防御计划？"
        ]);
      } else {
        setReviewQuestions([
          `今天习惯打卡率仅为 ${completed}/${total}，你的能量为 ${energy}/10。你在哪个时间节点对惰性妥协了？`,
          `回顾今日障碍：“${obstacleStr}”，你的 If-Then 计划没起作用，核心瓶颈出在哪个行为漏斗？`,
          `要阻断这种执行力下滑，你准备今晚对手机或作息做怎样的物理限制？明天哪一项需要减负？`
        ]);
      }
    } finally {
      setIsReviewLoading(false);
    }
  };

  // 提交灵魂反思
  const handleSubmitReview = async () => {
    if (!ans1.trim() || !ans2.trim() || !ans3.trim()) {
      alert("请完整填写这三个直击灵魂的反思问题，不要逃避哦！");
      return;
    }

    await db.dailyRecords.put({
      date: currentDate,
      woopWish: todayRecord?.woopWish || "",
      woopOutcome: todayRecord?.woopOutcome || "",
      woopObstacle: todayRecord?.woopObstacle || "",
      woopPlan: todayRecord?.woopPlan || "",
      energyLevel: energy,
      reviewQuestions: reviewQuestions,
      reviewAnswers: [ans1, ans2, ans3],
      reviewCompletedAt: new Date(),
      createdAt: todayRecord?.createdAt || new Date(),
    });

    triggerConfetti();
    setIsReviewing(false);
    setAns1("");
    setAns2("");
    setAns3("");
  };

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
    // 1. 前置依赖习惯约束校验
    const habit = habits.find((h) => h.id === habitId);
    if (habit && habit.dependsOn) {
      const isParentLogged = loggedHabitIds.has(habit.dependsOn);
      if (!isParentLogged) {
        const parent = habits.find((h) => h.id === habit.dependsOn);
        alert(`🔒 行为链受限：请先完成前置习惯【${parent?.name || "前置习惯"}】的打卡！`);
        return;
      }
    }

    // 2. 拦截特化表单打卡，弹出 Modal 录入数据
    if (habit && habit.customFormType && habit.customFormType !== "none") {
      const isAlreadyLogged = loggedHabitIds.has(habitId);
      if (isAlreadyLogged) {
        const existing = await db.habitLogs.where({ habitId, date: currentDate }).first();
        if (existing) {
          await db.habitLogs.delete(existing.id);
          await trackDeletion("habitLogs", existing.id);
        }
      } else {
        setActiveSpecializedHabit(habit);
        setIsSpecializedOpen(true);
      }
      return;
    }

    const existing = await db.habitLogs.where({ habitId, date: currentDate }).first();
    if (existing) {
      await db.habitLogs.delete(existing.id);
      await trackDeletion("habitLogs", existing.id);
    } else {
      await db.habitLogs.add({
        id: crypto.randomUUID(),
        habitId,
        date: currentDate,
        createdAt: new Date(),
      });
      
      // 触发局部 Check 圈圈微型 Confetti 粒子溅射
      const colors = ["#1DB954", "#1ED760", "#3b82f6", "#10b981"];
      const newParticles = Array.from({ length: 15 }).map((_, idx) => ({
        id: idx,
        angle: (idx / 15) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
        speed: 5 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)]
      }));
      setHabitParticles((prev) => ({ ...prev, [habitId]: newParticles }));
      // 1 秒后自动清除该习惯下的粒子，以便下次再次打卡时重复触发
      setTimeout(() => {
        setHabitParticles((prev) => {
          const next = { ...prev };
          delete next[habitId];
          return next;
        });
      }, 1000);
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
    <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 space-y-6 relative">
      {/* 粒子撒花层 */}
      {particles.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute left-1/2 top-1/3 rounded-full"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                x: p.x,
                y: p.y,
              }}
              animate={{
                x: p.x + Math.cos(p.angle) * p.speed * 30,
                y: p.y + Math.sin(p.angle) * p.speed * 30 + 150, // 自然抛物下坠
                opacity: [1, 1, 0],
                scale: [1, 1.2, 0.4],
              }}
              transition={{
                duration: 2.0,
                ease: "easeOut",
              }}
            />
          ))}
        </div>
      )}

      {/* 顶部 Header Area */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <p className="text-xs text-text-secondary font-mono uppercase tracking-widest">
            {mounted ? friendlyDate : ""}
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
              <SpotlightCard spotlightColor="rgba(29, 185, 84, 0.15)" className="p-5 relative group overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                <button
                  onClick={() => setIsWoopModalOpen(true)}
                  className="absolute top-4 right-4 text-xs text-text-secondary hover:text-primary transition-colors font-semibold z-20"
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
              </SpotlightCard>
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
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary font-mono flex items-center gap-2">
                <span>⚡ 习惯打卡矩阵 (Habit Grid)</span>
              </h2>
              {habits.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsSorting(!isSorting)}
                  className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 font-mono uppercase"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {isSorting ? "完成编排 (Done)" : "编排顺序 (Sort)"}
                </button>
              )}
            </div>
            
            {habits.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-secondary bg-surface-1 rounded-xl border border-border-subtle">
                暂无习惯。请前往 [系统设置] 页面添加你的第一个原子习惯。
              </div>
            ) : isSorting ? (
              // ==========================================
              // A. 拖拽排序编排模式 (单列大卡片)
              // ==========================================
              <Reorder.Group values={sortedHabits} onReorder={handleSortEnd} className="space-y-3">
                {sortedHabits.map((habit) => (
                  <Reorder.Item key={habit.id} value={habit} className="outline-none">
                    <div className="bg-surface-1 border border-border-subtle hover:border-primary/50 p-4 rounded-xl flex items-center justify-between cursor-grab active:cursor-grabbing select-none transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center text-text-secondary">
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-text-primary">{habit.name}</p>
                          <span className="text-[9px] text-text-secondary uppercase tracking-widest font-mono">
                            阻力: {habit.energyDemand} 能量 · {habit.customFormType && habit.customFormType !== "none" ? "📋 特化表单" : "常规打卡"}
                          </span>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-text-secondary">
                        {getHabitIcon(habit.icon)}
                      </div>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            ) : (
              // ==========================================
              // B. 正常展示与打卡模式 (两列网格)
              // ==========================================
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedHabits.map((habit) => {
                  const isLogged = loggedHabitIds.has(habit.id);
                  const isRecommended = habit.energyDemand === recommendedDemand && !isLogged;
                  
                  // 前置依赖校验
                  const parentHabit = habit.dependsOn ? habits.find((h) => h.id === habit.dependsOn) : null;
                  const isLocked = parentHabit ? !loggedHabitIds.has(parentHabit.id) : false;

                  return (
                    <MotionSpotlightCard
                      key={habit.id}
                      whileHover={isLocked ? {} : { scale: 1.03 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      onClick={() => toggleHabitLog(habit.id)}
                      spotlightColor={
                        isLocked 
                          ? "rgba(245, 158, 11, 0.05)" 
                          : isLogged 
                          ? "rgba(29, 185, 84, 0.25)" 
                          : isRecommended 
                          ? "rgba(29, 185, 84, 0.35)" 
                          : "rgba(29, 185, 84, 0.12)"
                      }
                      className={`relative rounded-xl border select-none overflow-hidden transition-all ${
                        isLocked
                          ? "border-border-subtle opacity-50 cursor-not-allowed"
                          : isLogged
                          ? "border-primary/40 shadow-[0_0_12px_rgba(29,185,84,0.15)] cursor-pointer"
                          : isRecommended
                          ? "border-primary shadow-[0_0_15px_rgba(29,185,84,0.25)] cursor-pointer"
                          : "border-border-subtle hover:border-text-secondary cursor-pointer"
                      }`}
                    >
                      <div className="w-full h-full flex items-center justify-between p-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                              isLocked
                                ? "bg-surface-2 text-neutral-gray"
                                : isLogged
                                ? "bg-primary text-black"
                                : isRecommended
                                ? "bg-primary/20 text-primary animate-pulse"
                                : "bg-surface-3 text-text-secondary"
                            }`}
                          >
                            {getHabitIcon(habit.icon)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-bold text-text-primary truncate">{habit.name}</p>
                              {isRecommended && !isLocked && (
                                <span className="text-[9px] bg-primary/20 text-primary font-bold font-mono px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                                  最宜
                                </span>
                              )}
                              {isLocked && (
                                <span className="text-[9px] bg-amber-500/15 text-amber-500 font-bold font-mono px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                                  锁定
                                </span>
                              )}
                            </div>
                            
                            {isLocked ? (
                              <span className="text-[10px] text-amber-500 font-medium font-mono block mt-0.5 truncate">
                                🔒 依赖于: {parentHabit?.name || "前置习惯"}
                              </span>
                            ) : (
                              <span className="text-[10px] text-text-secondary uppercase tracking-widest font-mono block mt-0.5">
                                阻力: {habit.energyDemand} 能量 · {habit.customFormType && habit.customFormType !== "none" ? "特化" : "常规"}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-center flex-shrink-0 ml-3">
                          <div className="relative flex items-center justify-center w-6 h-6">
                            {/* 局部打卡 Confetti 特效 */}
                            {habitParticles[habit.id] && habitParticles[habit.id].map((p) => (
                              <motion.div
                                key={p.id}
                                className="absolute w-1 h-1 rounded-full pointer-events-none z-10"
                                style={{ backgroundColor: p.color }}
                                animate={{
                                  x: Math.cos(p.angle) * p.speed * 3.5,
                                  y: Math.sin(p.angle) * p.speed * 3.5,
                                  scale: [1, 1.2, 0.1],
                                  opacity: [1, 1, 0]
                                }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                              />
                            ))}
                            <div
                              className={`w-full h-full rounded-full border flex items-center justify-center transition-all ${
                                isLocked
                                  ? "border-border-subtle bg-surface-2 text-neutral-gray"
                                  : isLogged
                                  ? "bg-primary border-primary text-black"
                                  : "border-muted-gray group-hover:border-text-secondary bg-transparent"
                              }`}
                            >
                              {isLocked ? (
                                <Lock className="w-3 h-3 text-neutral-gray" />
                              ) : isLogged ? (
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </MotionSpotlightCard>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* 右侧小列 (占比 40% -> 2/5) */}
        <div className="lg:col-span-2 space-y-6">
          {/* SM-2 记忆卡片复习引导 */}
          <SpotlightCard spotlightColor="rgba(59, 130, 246, 0.15)" className="p-5 flex flex-col gap-4">
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
              className={`w-full py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 ${
                overdueCardsCount > 0
                  ? "bg-primary text-primary-text hover:bg-primary-hover"
                  : "bg-surface-3 text-text-secondary cursor-not-allowed"
              }`}
            >
              <span>开始复习</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </SpotlightCard>

          {/* AI 每日行动排程 */}
          <SpotlightCard spotlightColor="rgba(59, 130, 246, 0.25)" className="p-5 flex flex-col gap-4 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-ai-blue/10 rounded-full blur-2xl z-0" />
            <div className="flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-ai-blue/20 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-ai-blue" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-ai-blue font-mono">
                  AI 每日任务排程
                </span>
              </div>
              
              {todayRecord?.aiTasks && todayRecord.aiTasks.length > 0 && !isGeneratingTasks && (
                <button
                  type="button"
                  onClick={handleGenerateAiTasks}
                  className="text-text-secondary hover:text-primary transition-colors p-1"
                  title="重新编排任务"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="z-10 space-y-3">
              {isGeneratingTasks ? (
                // A. 流式骨架屏状态
                <div className="space-y-4 py-2">
                  <div className="flex items-center justify-between">
                    <div className="h-4 bg-surface-3 rounded animate-pulse w-1/3" />
                    <div className="h-3.5 bg-surface-3 rounded animate-pulse w-1/4" />
                  </div>
                  <div className="border border-border-subtle/50 p-3 rounded-lg space-y-2 bg-surface-2/20">
                    <div className="h-4 bg-surface-3 rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-surface-3 rounded animate-pulse w-full" />
                    <div className="h-3 bg-surface-3 rounded animate-pulse w-5/6" />
                  </div>
                  <div className="border border-border-subtle/50 p-3 rounded-lg space-y-2 bg-surface-2/20">
                    <div className="h-4 bg-surface-3 rounded animate-pulse w-1/2" />
                    <div className="h-3 bg-surface-3 rounded animate-pulse w-full" />
                  </div>
                  <p className="text-[10px] text-text-secondary font-mono animate-pulse">AI 教练正在审阅您近7日打卡趋势，准备行为习惯拆解...</p>
                </div>
              ) : todayRecord?.aiTasks && todayRecord.aiTasks.length > 0 ? (
                // B. 已生成任务列表展示
                <div className="space-y-3.5">
                  {todayRecord.aiTasks.map((task) => {
                    const isCompleted = task.isCompleted;
                    return (
                      <div
                        key={task.id}
                        onClick={() => toggleAiTask(task.id)}
                        className={`p-3 rounded-xl border select-none transition-all duration-200 cursor-pointer relative overflow-hidden bg-surface-2/40 ${
                          isCompleted
                            ? "border-primary/30 opacity-60 bg-surface-2/20"
                            : "border-border-subtle hover:border-ai-blue hover:bg-surface-2/70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                task.energyDemand === "high"
                                  ? "bg-error/15 text-error"
                                  : task.energyDemand === "medium"
                                  ? "bg-amber-500/15 text-amber-500"
                                  : "bg-primary/15 text-primary"
                              }`}>
                                {task.energyDemand} 能耗
                              </span>
                              <p className={`text-xs font-bold text-text-primary ${isCompleted ? "line-through text-text-secondary" : ""}`}>
                                {task.name}
                              </p>
                            </div>
                            <p className="text-[10px] text-text-secondary mt-1.5 leading-relaxed font-mono">
                              💡 依据: {task.reason}
                            </p>
                          </div>

                          <div className="flex-shrink-0 relative w-5 h-5 flex items-center justify-center mt-0.5">
                            {/* 局部打卡粒子特效 */}
                            {aiTasksParticles[task.id] && aiTasksParticles[task.id].map((p) => (
                              <motion.div
                                key={p.id}
                                className="absolute w-1 h-1 rounded-full pointer-events-none z-10"
                                style={{ backgroundColor: p.color }}
                                animate={{
                                  x: Math.cos(p.angle) * p.speed * 3.5,
                                  y: Math.sin(p.angle) * p.speed * 3.5,
                                  scale: [1, 1.2, 0.1],
                                  opacity: [1, 1, 0]
                                }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                              />
                            ))}
                            <div className={`w-full h-full rounded-full border flex items-center justify-center transition-all ${
                              isCompleted
                                ? "bg-primary border-primary text-black"
                                : "border-muted-gray bg-transparent"
                            }`}>
                              {isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // C. 未生成状态
                <div className="py-4 text-center space-y-4">
                  <p className="text-xs text-text-secondary leading-relaxed max-w-[280px] mx-auto">
                    今日尚未生成排程任务。AI Coach 将融合今日能量值及过去 7 天打卡惯性为您智能派发定制任务。
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateAiTasks}
                    className="w-full bg-ai-blue hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-widest py-2.5 rounded-lg transition-all duration-200 active:scale-95 shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                  >
                    生成今日 AI 任务排程
                  </button>
                </div>
              )}
            </div>
          </SpotlightCard>

          {/* AI 晚间灵魂复盘卡片 */}
          <SpotlightCard
            spotlightColor={todayRecord?.reviewCompletedAt ? "rgba(29, 185, 84, 0.15)" : isAfterReviewTime ? "rgba(29, 185, 84, 0.3)" : "rgba(29, 185, 84, 0.12)"}
            className={`p-5 relative transition-all duration-300 ${
              todayRecord?.reviewCompletedAt
                ? "border-primary/20"
                : isAfterReviewTime
                ? "border-primary shadow-[0_0_15px_rgba(29,185,84,0.15)] animate-pulse-slow"
                : "border-border-subtle"
            }`}
          >
            <div className="flex items-center justify-between gap-3 min-w-0">
              <span className="text-xs font-bold uppercase tracking-widest text-text-secondary font-mono flex items-center gap-2 min-w-0 truncate">
                <Target className="w-4 h-4 text-primary flex-shrink-0" /> 
                <span className="truncate">晚间灵魂复盘</span>
                <span className="hidden sm:inline opacity-75">(Nightly Reflection)</span>
              </span>
              
              {todayRecord?.reviewCompletedAt ? (
                <span className="text-[10px] bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap flex-shrink-0">
                  已完成复盘 🔥
                </span>
              ) : isAfterReviewTime ? (
                <span className="text-[10px] bg-primary/25 text-primary font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap flex-shrink-0">
                  推荐开启
                </span>
              ) : (
                <span className="text-[10px] bg-surface-3 text-text-secondary font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap flex-shrink-0">
                  21:00 最佳
                </span>
              )}
            </div>

            {/* 1. 复盘进行时（答题模式） */}
            {isReviewing ? (
              <div className="mt-4 space-y-4 z-10 relative">
                {isReviewLoading ? (
                  <div className="space-y-3 py-4">
                    <div className="h-4 bg-surface-3 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-surface-3 rounded animate-pulse w-5/6" />
                    <div className="h-4 bg-surface-3 rounded animate-pulse w-2/3" />
                    <p className="text-[10px] text-text-secondary font-mono">AI 正在根据今日数据构思犀利的问题...</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-ai-blue font-semibold">
                      💡 严厉的 AI 灵魂教练已经审查完毕，请诚实作答：
                    </p>
                    
                    <div className="space-y-3">
                      {reviewQuestions.map((q, idx) => {
                        const setAns = [setAns1, setAns2, setAns3][idx];
                        const val = [ans1, ans2, ans3][idx];
                        return (
                          <div key={idx} className="space-y-1">
                            <p className="text-xs text-text-primary font-bold font-mono">
                              问题 {idx + 1}: {q}
                            </p>
                            <textarea
                              rows={2}
                              value={val}
                              required
                              onChange={(e) => setAns(e.target.value)}
                              placeholder="写下你真实的反思和明天的改进细节..."
                              className="w-full px-3 py-1.5 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none resize-none font-mono"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSubmitReview}
                        className="flex-1 bg-primary hover:bg-primary-hover text-black transition-all duration-200 py-2 rounded-lg text-xs font-bold uppercase tracking-wider active:scale-95"
                      >
                        提交今日反思
                      </button>
                      <button
                        onClick={() => setIsReviewing(false)}
                        className="px-4 bg-surface-3 hover:bg-surface-2 transition-all duration-200 py-2 rounded-lg text-xs text-text-secondary active:scale-95"
                      >
                        取消
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : todayRecord?.reviewCompletedAt ? (
              // 2. 复盘已完成（展示模式）
              <div className="mt-4 space-y-3.5 text-xs text-text-secondary">
                <p className="text-xs text-text-primary leading-relaxed font-semibold">
                  “你今天诚实地面对了自己。自律是一个反馈回路，你写下的反思已封存进第二大脑。”
                </p>
                <div className="space-y-2.5 bg-surface-2/60 p-3 rounded-lg border border-border-subtle">
                  {todayRecord.reviewQuestions?.map((q, idx) => (
                    <div key={idx} className="space-y-1">
                      <p className="text-text-primary font-bold font-mono text-[10px]">Q: {q}</p>
                      <p className="text-neutral-gray italic pl-2.5 border-l border-primary/30 text-[11px]">A: {todayRecord.reviewAnswers?.[idx]}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleStartReviewFlow}
                  className="text-[10px] text-primary hover:underline font-mono"
                >
                  重新进行今日复盘
                </button>
              </div>
            ) : (
              // 3. 复盘就绪（未开始模式）
              <div className="mt-4 space-y-3">
                <p className="text-xs text-text-secondary leading-relaxed">
                  每晚 21:00 提取今日打卡和 WOOP 状态，发送给大模型，生成 3 个犀利的个性化反思问题推送。
                </p>
                <button
                  onClick={handleStartReviewFlow}
                  className={`w-full py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 ${
                    isAfterReviewTime
                      ? "bg-primary text-black hover:scale-[1.02] shadow-[0_0_12px_rgba(29,185,84,0.3)]"
                      : "bg-surface-3 text-text-secondary hover:bg-surface-2"
                  }`}
                >
                  <span>立即开启今日灵魂复盘</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </SpotlightCard>
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
                {/* 智能灵感一键伴写 */}
                <div className="p-3 bg-surface-2/60 border border-border-subtle rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                      💡 智能灵感一键伴写
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      key="coding"
                      type="button"
                      onClick={() => {
                        setWish("编写完 GrowthOS 的核心引导交互逻辑");
                        setOutcome("代码跑通，功能闭环，获得满满的掌控感与成就感");
                        setObstacle("觉得逻辑繁杂，写一会就想切出去刷社交软件");
                        setPlan("如果我想切出去刷社交软件，我就深呼吸一次，强迫自己只留在编辑器里再写 3 行代码。");
                      }}
                      className="px-2.5 py-1 bg-surface-3 hover:bg-primary/20 hover:text-primary transition-all rounded-md text-[10px] font-bold text-text-secondary border border-border-subtle"
                    >
                      🚀 攻克核心编码
                    </button>
                    <button
                      key="exercise"
                      type="button"
                      onClick={() => {
                        setWish("进行 15 分钟的拉伸或俯卧撑练习");
                        setOutcome("唤醒身体细胞，精力恢复，晚上睡眠质量更高");
                        setObstacle("下班回到家觉得很疲惫，只想躺在沙发上刷视频");
                        setPlan("如果我躺在沙发上不想动，我就只穿上运动鞋在客厅站 2 分钟，即便不运动也行。");
                      }}
                      className="px-2.5 py-1 bg-surface-3 hover:bg-primary/20 hover:text-primary transition-all rounded-md text-[10px] font-bold text-text-secondary border border-border-subtle"
                    >
                      🏃‍♂️ 无压力运动
                    </button>
                    <button
                      key="review"
                      type="button"
                      onClick={() => {
                        setWish("复习完今日到期的所有记忆卡片");
                        setOutcome("彻底锁定今天学到的技术点，打破遗忘曲线，学习效率倍增");
                        setObstacle("看到卡片数量觉得有些累，产生拖延情绪");
                        setPlan("如果我产生拖延情绪，那么我先点开「开始复习」，只要求自己复习最前面 2 张卡片。");
                      }}
                      className="px-2.5 py-1 bg-surface-3 hover:bg-primary/20 hover:text-primary transition-all rounded-md text-[10px] font-bold text-text-secondary border border-border-subtle"
                    >
                      🧠 零阻力复习
                    </button>
                  </div>
                </div>

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
                  className="w-full py-2.5 mt-2 bg-primary hover:bg-primary-hover transition-all duration-200 rounded-lg text-primary-text text-xs font-bold uppercase tracking-widest active:scale-95"
                >
                  保存今日意图
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 特化习惯打卡弹窗 */}
      <SpecializedRecordModal
        isOpen={isSpecializedOpen}
        onClose={() => {
          setIsSpecializedOpen(false);
          setActiveSpecializedHabit(null);
        }}
        habit={activeSpecializedHabit}
        onSave={handleSaveSpecializedLog}
      />
    </div>
  );
}
