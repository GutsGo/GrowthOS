"use client";

import React, { useMemo, useState, useEffect } from "react";
import { db, HabitLog, Card } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Flame, Target, Award, Info, Zap, Lock, Unlock, Trophy } from "lucide-react";
import confetti from "canvas-confetti";
import SpotlightCard from "./reactbits/SpotlightCard";

export default function StatsView() {
  const habitLogs = useLiveQuery(() => db.habitLogs.toArray()) || [];
  const habits = useLiveQuery(() => db.habits.toArray()) || [];
  const dailyRecords = useLiveQuery(() => db.dailyRecords.toArray()) || [];
  const cards = useLiveQuery(() => db.cards.toArray()) || [];

  // 挂载状态，防止服务端与客户端水合不一致
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 能量波动折线图 Hover 状态
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);

  // ==========================================
  // 1. Streak 连续打卡自适应算法（包含常规习惯打卡与已完成 AI 任务排程）
  // ==========================================
  const streakInfo = useMemo(() => {
    const datesSet = new Set<string>();

    // 1. 收集常规与特化习惯打卡日期
    habitLogs.forEach((l) => datesSet.add(l.date));

    // 2. 收集有完成过至少一项 AI 排程任务的日期
    dailyRecords.forEach((r) => {
      if (r.aiTasks && r.aiTasks.some((t) => t.isCompleted)) {
        datesSet.add(r.date);
      }
    });

    const dates = Array.from(datesSet).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );

    if (dates.length === 0) return { current: 0, max: 0 };

    // 格式化当前时区的今日和昨日日期
    const getLocalDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${date}`;
    };

    const todayStr = getLocalDateStr(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterday);

    let current = 0;
    const latestDate = dates[0];

    // 如果最晚的打卡日期既不是今天也不是昨天，说明已经断签，当前 Streak 为 0
    if (latestDate !== todayStr && latestDate !== yesterdayStr) {
      current = 0;
    } else {
      current = 1;
      let prevDate = new Date(latestDate.replace(/-/g, "/")); // 避免 Safari NaN 兼容问题
      
      for (let i = 1; i < dates.length; i++) {
        const currDate = new Date(dates[i].replace(/-/g, "/"));
        const diffTime = prevDate.getTime() - currDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          current++;
          prevDate = currDate;
        } else if (diffDays > 1) {
          break; // 中断了
        }
      }
    }

    // 计算历史最大连续天数 (Max Streak)
    const sortedDates = [...dates].reverse();
    let max = 0;
    let tempMax = 0;
    let lastDate: Date | null = null;

    sortedDates.forEach((dateStr) => {
      const d = new Date(dateStr.replace(/-/g, "/"));
      if (!lastDate) {
        tempMax = 1;
      } else {
        const diffDays = Math.round((d.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempMax++;
        } else if (diffDays > 1) {
          if (tempMax > max) max = tempMax;
          tempMax = 1;
        }
      }
      lastDate = d;
    });
    if (tempMax > max) max = tempMax;

    return { current, max };
  }, [habitLogs, dailyRecords]);

  // ==========================================
  // 2. 6 大极客成就徽章锁定义与计算
  // ==========================================
  const badges = useMemo(() => {
    // 🌱 破土萌芽: 7 天 Streak
    const isSprout = mounted && streakInfo.current >= 7;
    // 🔥 烈火淬炼: 30 天 Streak
    const isFlame = mounted && streakInfo.current >= 30;
    // 👑 傲视群雄: 100 天 Streak
    const isCrown = mounted && streakInfo.current >= 100;
    
    // ⚡️ 能量掌控者: 能量滑块 10 或 1 且今日有打卡
    const isEnergyMaster = mounted && dailyRecords.some(
      (r) => r.energyLevel === 10 || r.energyLevel === 1
    ) && habitLogs.length > 0;
    
    // 🧠 记忆大师: card reps 累积 >= 25
    const totalReps = cards.reduce((acc, c) => acc + (c.reps || 0), 0);
    const isMemoryMaster = mounted && totalReps >= 25 && cards.length >= 4;

    // 🏆 社交博弈王: 社交打卡 >= 3 次
    const socialLogsCount = habitLogs.filter((l) => l.customData?.contact).length;
    const isSocialKing = mounted && socialLogsCount >= 3;

    return [
      {
        id: "sprout",
        name: "破土萌芽",
        desc: "习惯连续打卡达到 7 天。种下一颗自律的种子，开始破土拔节。",
        icon: "🌱",
        unlocked: isSprout,
        condition: "连续打卡 7 天",
        color: "from-emerald-500/10 to-teal-500/10 border-emerald-500/35 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
      },
      {
        id: "flame",
        name: "烈火淬炼",
        desc: "习惯连续打卡达到 30 天。你的习惯已熔铸成坚如磐石的物理记忆。",
        icon: "🔥",
        unlocked: isFlame,
        condition: "连续打卡 30 天",
        color: "from-orange-500/10 to-red-500/10 border-orange-500/35 text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.15)]",
      },
      {
        id: "crown",
        name: "傲视群雄",
        desc: "习惯连续打卡达到 100 天。登顶百日自律之巅，脱胎换骨的终极蜕变。",
        icon: "👑",
        unlocked: isCrown,
        condition: "连续打卡 100 天",
        color: "from-amber-500/10 to-yellow-500/10 border-amber-500/35 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]",
      },
      {
        id: "energy",
        name: "能量掌控者",
        desc: "在生理精力极佳(10)或极度疲惫(1)的状态下均能坚持打卡前行。",
        icon: "⚡️",
        unlocked: isEnergyMaster,
        condition: "在 1 或 10 能量下完成习惯",
        color: "from-indigo-500/10 to-purple-500/10 border-indigo-500/35 text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.15)]",
      },
      {
        id: "memory",
        name: "记忆大师",
        desc: "第二大脑闪卡复习 reps 累计达到 25 次以上，对抗遗忘曲线。",
        icon: "🧠",
        unlocked: isMemoryMaster,
        condition: "卡片累计复习 25 次",
        color: "from-blue-500/10 to-cyan-500/10 border-blue-500/35 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.15)]",
      },
      {
        id: "social_king",
        name: "社交博弈王",
        desc: "在社交特化表单中累计反思并记录 3 次以上的深度对话博弈细节。",
        icon: "🏆",
        unlocked: isSocialKing,
        condition: "记录 3 次社交谈话反思",
        color: "from-pink-500/10 to-rose-500/10 border-pink-500/35 text-pink-400 shadow-[0_0_12px_rgba(236,72,153,0.15)]",
      },
    ];
  }, [streakInfo, dailyRecords, cards, habitLogs, mounted]);

  // 点击已解锁徽章触发彩屑爆破
  const handleBadgeClick = (unlocked: boolean) => {
    if (unlocked) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  };


  // ==========================================
  // 3. 7 天能量波动折线数据计算
  // ==========================================
  const energyTrendData = useMemo(() => {
    const data = [];
    const now = new Date();
    
    const formatDateShort = (d: Date) => {
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      return `${month}/${date}`;
    };
    const formatDateFull = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${date}`;
    };

    const recordMap = new Map<string, number>();
    dailyRecords.forEach((rec) => {
      if (rec.energyLevel !== undefined) {
        recordMap.set(rec.date, rec.energyLevel);
      }
    });

    for (let i = 6; i >= 0; i--) {
      const temp = new Date();
      temp.setDate(now.getDate() - i);
      const fullStr = formatDateFull(temp);
      const shortStr = formatDateShort(temp);
      data.push({
        shortStr,
        dateStr: fullStr,
        energy: recordMap.get(fullStr) ?? 5, // 若未填，后备默认 5 分
      });
    }
    return data;
  }, [dailyRecords]);

  // 折线图 SVG 坐标映射
  const energyChartPoints = useMemo(() => {
    const sizeW = 320;
    const sizeH = 160;
    const chartW = 280;
    const chartH = 90;
    const padX = 20;
    const padY = 30;

    const points = energyTrendData.map((d, i) => {
      const x = padX + i * (chartW / 6);
      const y = padY + chartH - ((d.energy - 1) / 9) * chartH;
      return { x, y, ...d };
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const areaD = `${pathD} L ${points[points.length - 1].x} ${padY + chartH} L ${points[0].x} ${padY + chartH} Z`;

    return {
      sizeW,
      sizeH,
      chartW,
      chartH,
      padX,
      padY,
      points,
      pathD,
      areaD,
    };
  }, [energyTrendData]);

  // ==========================================
  // 4. GitHub 风格年度打卡热力图计算 (12个月, 53周)
  // ==========================================
  // 4. GitHub 风格年度打卡热力图计算 (12个月, 53周)
  // ==========================================
  const heatmapData = useMemo(() => {
    const data: { dateStr: string; count: number; dayOfWeek: number; isFuture: boolean; isMonthStart: boolean; monthLabel: string }[] = [];
    const now = new Date();
    // 归零今日时间的时分秒，仅保留年月日
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${date}`;
    };

    // 1. 找出本周日，并往前倒推 370 天（53周-1天）算出起始周一，保证今天必定包含在最后一列中
    const day = today.getDay();
    const daysToAdd = day === 0 ? 0 : 7 - day; // 如果今天是周日加0天，否则加到周日的天数
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + daysToAdd);

    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 370);

    const logsCountMap: Record<string, number> = {};
    if (mounted) {
      // 1. 收集习惯打卡次数
      habitLogs.forEach((log) => {
        logsCountMap[log.date] = (logsCountMap[log.date] || 0) + 1;
      });

      // 2. 收集已完成的位置排程任务数量
      dailyRecords.forEach((r) => {
        if (r.aiTasks) {
          const completedCount = r.aiTasks.filter((t) => t.isCompleted).length;
          if (completedCount > 0) {
            logsCountMap[r.date] = (logsCountMap[r.date] || 0) + completedCount;
          }
        }
      });
    }

    // 2. 生成 53 周全量日期数据 (53 * 7 = 371 天)
    const totalDays = 53 * 7;
    const temp = new Date(startDate);
    let lastMonth = -1;
    for (let i = 0; i < totalDays; i++) {
      const dateStr = formatDate(temp);
      // 归零临时日期的时分秒进行严格日期比较，防止时分秒毫秒差异导致把今天错判为未来
      const tempDayOnly = new Date(temp.getFullYear(), temp.getMonth(), temp.getDate());
      const isFuture = tempDayOnly.getTime() > today.getTime();
      
      const dayOfWeek = temp.getDay() === 0 ? 7 : temp.getDay();
      const currentMonth = temp.getMonth();
      
      let isMonthStart = false;
      let monthLabel = "";
      
      // 在每周的第一天（周一）来确定是否展示跨月标签
      if (dayOfWeek === 1 && currentMonth !== lastMonth) {
        isMonthStart = true;
        const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
        monthLabel = monthNames[currentMonth];
        lastMonth = currentMonth;
      }
      
      data.push({
        dateStr,
        count: logsCountMap[dateStr] || 0,
        dayOfWeek,
        isFuture,
        isMonthStart,
        monthLabel,
      });

      temp.setDate(temp.getDate() + 1);
    }

    return data;
  }, [habitLogs, dailyRecords, mounted]);

  // ==========================================
  // 5. 五维能力雷达图计算 (SVG 绘制)
  // ==========================================
  const radarDimensions = [
    { key: "tech", label: "技术深度 (AI/代码)" },
    { key: "lang", label: "语言广度 (英语)" },
    { key: "body", label: "身体机能 (力量/健身)" },
    { key: "social", label: "社交连接 (表达/倾听)" },
    { key: "feynman", label: "表达魅力 (费曼输出)" },
  ];

  const radarScores = useMemo(() => {
    if (!mounted) {
      return { tech: 30, lang: 30, body: 30, social: 30, feynman: 30 };
    }
    const techCount = habitLogs.filter((l) => l.habitId === "habit-1" || l.habitId.includes("code") || l.habitId.includes("guide-habit-flow")).length;
    const langCount = habitLogs.filter((l) => l.habitId === "habit-2" || l.habitId.includes("word") || l.habitId.includes("speak")).length;
    const bodyCount = habitLogs.filter((l) => l.habitId === "habit-3" || l.habitId.includes("fit") || l.habitId.includes("gym")).length;
    const socialCount = habitLogs.filter((l) => l.habitId === "habit-4" || l.habitId.includes("social") || l.habitId.includes("guide-habit-feynman")).length;
    const feynmanCount = Math.min(cards.length + Math.floor(habitLogs.length * 0.15) + 3, 20);

    const getScore = (count: number) => Math.min(30 + count * 12, 100);

    return {
      tech: getScore(techCount),
      lang: getScore(langCount),
      body: getScore(bodyCount),
      social: getScore(socialCount),
      feynman: getScore(feynmanCount),
    };
  }, [habitLogs, cards, mounted]);

  const radarSvgPoints = useMemo(() => {
    const size = 300;
    const center = size / 2;
    const radius = 100; 
    const points: { x: number; y: number }[] = [];
    const angles = [-Math.PI / 2, -Math.PI / 10, (3 * Math.PI) / 10, (7 * Math.PI) / 10, (11 * Math.PI) / 10];
    const keys: ("tech" | "lang" | "body" | "social" | "feynman")[] = ["tech", "lang", "body", "social", "feynman"];

    keys.forEach((key, idx) => {
      const score = radarScores[key];
      const valRadius = (score / 100) * radius;
      const x = center + valRadius * Math.cos(angles[idx]);
      const y = center + valRadius * Math.sin(angles[idx]);
      points.push({ x, y });
    });

    const polygonPointsStr = points.map((p) => `${p.x},${p.y}`).join(" ");
    
    const gridPolygons = [0.25, 0.5, 0.75, 1.0].map((ratio) => {
      const gPoints = angles.map((angle) => {
        const x = center + radius * ratio * Math.cos(angle);
        const y = center + radius * ratio * Math.sin(angle);
        return `${x},${y}`;
      });
      return gPoints.join(" ");
    });

    const labels = radarDimensions.map((dim, idx) => {
      const labelRadius = radius + 24;
      const x = center + labelRadius * Math.cos(angles[idx]);
      const y = center + labelRadius * Math.sin(angles[idx]);
      let textAnchor: "inherit" | "end" | "middle" | "start" = "middle";
      if (idx === 1 || idx === 2) textAnchor = "start";
      if (idx === 3 || idx === 4) textAnchor = "end";
      return { label: dim.label, x, y, textAnchor };
    });

    return {
      size,
      center,
      polygonPointsStr,
      gridPolygons,
      labels,
    };
  }, [radarScores]);

  const highestTrait = useMemo(() => {
    if (!mounted) return "数据加载中...";
    const keys: ("tech" | "lang" | "body" | "social" | "feynman")[] = ["tech", "lang", "body", "social", "feynman"];
    let maxKey = keys[0];
    keys.forEach((key) => {
      if (radarScores[key] > radarScores[maxKey]) {
        maxKey = key;
      }
    });
    
    const traitNames = {
      tech: "技术探索者 (专注深度代码与工程挑战)",
      lang: "国际化视野者 (持续学习英语与拓宽触角)",
      body: "精力管理者 (极佳的身体恢复和能量充电)",
      social: "情商共鸣者 (注重与他人建立真实深入的连接)",
      feynman: "深度传播者 (善于通过费曼法输出提炼核心知识)",
    };
    return traitNames[maxKey];
  }, [radarScores, mounted]);


  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 space-y-8 select-none">
      {/* 顶部 Header */}
      <div>
        <span className="text-xs text-text-secondary font-mono uppercase tracking-widest">
          STATISTICS & ACHIEVEMENTS
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight mt-1">数据、复盘与成就系统</h1>
        <p className="text-sm text-text-secondary mt-1">
          用确凿的自律足迹打磨你的成长勋章。连续击破懈怠，成就终身成长者。
        </p>
      </div>

      {/* -------------------------------------------------- */}
      {/* 新增：自律连击指挥舱 & Achievement勋章墙双栏面板 */}
      {/* -------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* 左栏：打卡连击卡片 (2/5) */}
        <section className="lg:col-span-2">
          <SpotlightCard
            spotlightColor="rgba(29, 185, 84, 0.25)"
            className="h-full border border-primary/45 bg-gradient-to-br from-surface-1 to-surface-2 p-6 rounded-2xl flex flex-col justify-between shadow-[0_0_20px_rgba(29,185,84,0.1)] relative overflow-hidden"
          >
            <div className="absolute -right-12 -top-12 w-32 h-32 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                  Habit Streaks Dashboard
                </span>
                <Flame className="w-5 h-5 text-primary animate-pulse" />
              </div>
              
              <div className="py-2">
                <span className="text-[11px] text-text-secondary font-mono uppercase tracking-wider block">
                  当前自律连击天数
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-5xl md:text-6xl font-black font-mono tracking-tighter text-primary drop-shadow-[0_0_12px_rgba(29,185,84,0.3)]">
                    {mounted ? streakInfo.current : 0}
                  </span>
                  <span className="text-sm font-bold text-text-secondary">DAYS STREAK</span>
                </div>
              </div>
            </div>

            <div className="border-t border-border-subtle/50 pt-5 mt-6 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary font-medium">历史最高连击天数:</span>
                <span className="font-bold font-mono text-text-primary text-sm flex items-center gap-1">
                  🔥 {mounted ? streakInfo.max : 0} 天
                </span>
              </div>
              <p className="text-[10px] text-neutral-gray leading-relaxed bg-surface-3/50 p-2.5 rounded-lg border border-border-subtle/50 font-mono uppercase tracking-widest text-center">
                🔥 Keep the fire burning, build your momentum!
              </p>
            </div>
          </SpotlightCard>
        </section>

        {/* 右栏：6 大极客成就徽章墙 (3/5) */}
        <section className="lg:col-span-3 bg-surface-1 border border-border-subtle p-5 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" /> 极客成就勋章墙 (Achievements)
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {badges.map((badge) => (
              <div
                key={badge.id}
                onClick={() => handleBadgeClick(badge.unlocked)}
                title={badge.unlocked ? `${badge.name}: 点击炫耀一下！` : `未解锁：${badge.condition}`}
                className={`relative p-3 rounded-xl border flex flex-col items-center text-center justify-between gap-2.5 transition-all duration-300 ${
                  badge.unlocked
                    ? `bg-gradient-to-b cursor-pointer hover:scale-[1.03] active:scale-95 ${badge.color}`
                    : "bg-surface-2/40 border-border-subtle text-neutral-gray opacity-45 select-none"
                }`}
              >
                {/* 锁图标 */}
                <div className="absolute top-2 right-2">
                  {badge.unlocked ? (
                    <Unlock className="w-3 h-3 text-primary opacity-60" />
                  ) : (
                    <Lock className="w-3 h-3 text-neutral-gray opacity-60" />
                  )}
                </div>

                {/* 徽章大图标 */}
                <span className={`text-3xl filter transition-transform duration-300 ${badge.unlocked ? "drop-shadow-lg hover:rotate-12" : "grayscale"}`}>
                  {badge.icon}
                </span>

                <div>
                  <h4 className={`text-xs font-bold ${badge.unlocked ? "text-text-primary" : "text-text-secondary"}`}>
                    {badge.name}
                  </h4>
                  <p className="text-[8px] text-text-secondary mt-0.5 leading-tight line-clamp-2 max-w-[100px] mx-auto">
                    {badge.desc}
                  </p>
                </div>

                <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider ${
                  badge.unlocked ? "bg-primary/20 text-primary" : "bg-surface-3 text-neutral-gray"
                }`}>
                  {badge.unlocked ? "已解锁" : "未解锁"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 3. 年度自律活跃热力图 */}
      <section className="bg-surface-1 border border-border-subtle p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" /> 年度自律活跃热力图 (Last 12 Months)
          </h2>
          <div className="flex items-center gap-1.5 text-[10px] text-text-secondary font-mono">
            <span>少</span>
            <div className="w-2.5 h-2.5 rounded-sm bg-surface-3 border border-border-subtle/10" />
            <div className="w-2.5 h-2.5 rounded-sm bg-primary/30" />
            <div className="w-2.5 h-2.5 rounded-sm bg-primary/60" />
            <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
            <span>多</span>
          </div>
        </div>

        {/* 热力图网格 */}
        <div className="overflow-x-auto pb-2 select-none">
          <div className="flex gap-3 items-end min-w-[1100px] py-2">
            {/* 竖轴星期标签 (周一到周日) */}
            <div className="grid grid-rows-7 gap-1.5 pr-1.5 text-[9px] text-text-secondary font-mono select-none">
              <div className="h-3.5 flex items-center">周一</div>
              <div className="h-3.5 flex items-center opacity-0">周二</div>
              <div className="h-3.5 flex items-center">周三</div>
              <div className="h-3.5 flex items-center opacity-0">周四</div>
              <div className="h-3.5 flex items-center">周五</div>
              <div className="h-3.5 flex items-center opacity-0">周六</div>
              <div className="h-3.5 flex items-center">周日</div>
            </div>

            {/* 包含月份标签和打卡网格的右侧主容器 */}
            <div className="flex-1 flex flex-col gap-1.5 relative">
              {/* 月份横轴标签 */}
              <div className="grid grid-flow-col auto-cols-max gap-1.5 justify-start h-4 mb-0.5 select-none">
                {Array.from({ length: 53 }).map((_, colIdx) => {
                  const dayItem = heatmapData[colIdx * 7];
                  return (
                    <div key={colIdx} className="w-3.5 h-4 relative">
                      {dayItem?.isMonthStart && (
                        <span className="absolute left-0 top-0 whitespace-nowrap text-[9px] text-text-secondary font-mono leading-none">
                          {dayItem.monthLabel}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 53周打卡网格 */}
              <div className="grid grid-flow-col auto-cols-max gap-1.5 justify-start">
                {Array.from({ length: 53 }).map((_, colIdx) => (
                  <div key={colIdx} className="grid grid-rows-7 gap-1.5">
                    {heatmapData.slice(colIdx * 7, (colIdx + 1) * 7).map((item, rowIdx) => {
                      let colorClass = "bg-surface-3 border border-border-subtle/10";
                      if (item.isFuture) {
                        colorClass = "bg-transparent opacity-0 pointer-events-none";
                      } else if (item.count === 1) {
                        colorClass = "bg-primary/30";
                      } else if (item.count === 2) {
                        colorClass = "bg-primary/60";
                      } else if (item.count >= 3) {
                        colorClass = "bg-primary shadow-[0_0_8px_rgba(29,185,84,0.3)]";
                      }

                      return (
                        <div
                          key={rowIdx}
                          title={item.isFuture ? undefined : `${item.dateStr}: 打卡 ${item.count} 次`}
                          className={`w-3.5 h-3.5 rounded-[3px] transition-colors duration-150 ${colorClass}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 下方 Grid (五维雷达图与能量波动曲线) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左栏：五维能力雷达图 */}
        <section className="bg-surface-1 border border-border-subtle p-5 rounded-2xl flex flex-col items-center gap-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono w-full text-left flex items-center gap-2">
            <Target className="w-4 h-4 text-ai-blue" /> 五维能力雷达分布
          </h2>

          <div className="w-full flex justify-center py-2 relative">
            <svg
              viewBox={`0 0 ${radarSvgPoints.size} ${radarSvgPoints.size}`}
              className="w-full max-w-[300px] h-auto overflow-visible"
            >
              {/* 绘制背景多边形网格 */}
              {radarSvgPoints.gridPolygons.map((points, idx) => (
                <polygon
                  key={idx}
                  points={points}
                  fill="none"
                  stroke="#282828"
                  strokeWidth={1}
                />
              ))}

              {/* 绘制五个角的放射轴线 */}
              {radarSvgPoints.labels.map((lbl, idx) => (
                <line
                  key={idx}
                  x1={radarSvgPoints.center}
                  y1={radarSvgPoints.center}
                  x2={
                    radarSvgPoints.center +
                    100 * Math.cos(idx * (2 * Math.PI / 5) - Math.PI / 2)
                  }
                  y2={
                    radarSvgPoints.center +
                    100 * Math.sin(idx * (2 * Math.PI / 5) - Math.PI / 2)
                  }
                  stroke="#282828"
                  strokeWidth={1}
                />
              ))}

              {/* 绘制主数据能力多边形 */}
              <polygon
                points={radarSvgPoints.polygonPointsStr}
                fill="rgba(29, 185, 84, 0.15)"
                stroke="#1DB954"
                strokeWidth={2}
                className="transition-all duration-300"
              />

              {/* 绘制雷达各维度的文字标签 */}
              {radarSvgPoints.labels.map((lbl, idx) => (
                <text
                  key={idx}
                  x={lbl.x}
                  y={lbl.y}
                  textAnchor={lbl.textAnchor}
                  alignmentBaseline="middle"
                  className="fill-text-secondary text-[9px] font-sans font-bold uppercase tracking-wide"
                >
                  {lbl.label}
                </text>
              ))}
            </svg>
          </div>
        </section>

        {/* 右栏：近 7 天能量波动曲线 */}
        <section className="bg-surface-1 border border-border-subtle p-5 rounded-2xl flex flex-col items-center gap-4 relative">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono w-full text-left flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> 近 7 天能量波动曲线 (Energy Trend)
          </h2>

          <div className="w-full flex justify-center py-2 relative">
            <svg
              viewBox={`0 0 ${energyChartPoints.sizeW} ${energyChartPoints.sizeH}`}
              className="w-full max-w-[320px] h-auto overflow-visible select-none"
            >
              <defs>
                <linearGradient id="energyAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1DB954" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#1DB954" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              {/* 绘制背景横格线 */}
              {[0, 1, 2, 3].map((idx) => {
                const y = energyChartPoints.padY + idx * (energyChartPoints.chartH / 3);
                const score = 10 - idx * 3;
                return (
                  <g key={idx}>
                    <line
                      x1={energyChartPoints.padX}
                      y1={y}
                      x2={energyChartPoints.padX + energyChartPoints.chartW}
                      y2={y}
                      stroke="#282828"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                    <text
                      x={energyChartPoints.padX - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-text-secondary text-[8px] font-mono"
                    >
                      {score}
                    </text>
                  </g>
                );
              })}

              {/* 面积渐变填充 */}
              <path
                d={energyChartPoints.areaD}
                fill="url(#energyAreaGradient)"
                className="transition-all duration-300"
              />

              {/* 能量折线 */}
              <path
                d={energyChartPoints.pathD}
                fill="none"
                stroke="#1DB954"
                strokeWidth={2}
                className="transition-all duration-300"
              />

              {/* 数据圆点 */}
              {energyChartPoints.points.map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r={hoveredPoint?.dateStr === p.dateStr ? 6 : 4}
                  fill={hoveredPoint?.dateStr === p.dateStr ? "#1ED760" : "#1DB954"}
                  stroke="#121212"
                  strokeWidth={1.5}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredPoint(p)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              ))}

              {/* x 轴日期标注 */}
              {energyChartPoints.points.map((p, idx) => (
                <text
                  key={idx}
                  x={p.x}
                  y={energyChartPoints.padY + energyChartPoints.chartH + 15}
                  textAnchor="middle"
                  className="fill-text-secondary text-[8px] font-mono"
                >
                  {p.shortStr}
                </text>
              ))}
            </svg>

            {/* Hover Tooltip */}
            <AnimatePresence>
              {hoveredPoint && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute z-10 px-2.5 py-1.5 bg-surface-3 border border-border-subtle rounded-lg text-[10px] font-mono shadow-2xl flex flex-col gap-0.5 pointer-events-none"
                  style={{
                    left: `${hoveredPoint.x - 30}px`,
                    top: `${hoveredPoint.y - 45}px`
                  }}
                >
                  <span className="text-text-secondary">{hoveredPoint.dateStr}</span>
                  <span className="text-primary font-bold">🔋 能量: {hoveredPoint.energy}/10</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>

      {/* 5. AI 能力与习惯特质洞察 */}
      <section className="bg-gradient-to-br from-surface-1 to-surface-2 border border-border-subtle p-5 rounded-2xl flex flex-col gap-4 relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-28 h-28 bg-primary/10 rounded-full blur-2xl" />
        
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" /> AI 能力与习惯特质洞察 (AI Insights)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 bg-surface-2/40 p-4 rounded-xl border border-border-subtle/50">
              <span className="text-[10px] text-text-secondary uppercase tracking-widest block font-mono">
                当前最卓越能力标签
              </span>
              <p className="text-sm font-bold text-primary mt-1">{highestTrait}</p>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <span className="text-[10px] text-text-secondary uppercase tracking-widest block font-mono">
                教练复盘诊断建议 (Feynman Coach)
              </span>
              <p className="text-xs text-text-secondary leading-relaxed">
                你最近在技术深度训练上的完成率较高，展现了极强的专注力。但你在社交演练和口语训练中的参与次数偏少。为了实现更均衡的自我进化，教练建议在今晚 21:00 前往 AI 教练舱开启一次模拟演练，我们可以尝试将打卡难度从“低阻力”降为最轻松的 5 分钟起步。
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-surface-3 p-3 rounded-lg border border-border-subtle text-[10px] text-neutral-gray leading-relaxed mt-2">
          <Info className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span>
            能力分值与能量波动每晚根据 IndexedDB 中的实际打卡频率与大模型晚间复盘数据进行后台重新计算更新。
          </span>
        </div>
      </section>
    </div>
  );
}
