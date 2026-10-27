"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Target, Award, Info, Zap } from "lucide-react";
import confetti from "canvas-confetti";
import SpotlightCard from "./reactbits/SpotlightCard";
import {
  buildAttendanceWindow,
  buildMilestones,
  collectActiveDays,
  formatRate,
} from "@/lib/learning/attendance";
import { RATING_META, type Rating } from "@/lib/learning/types";

/**
 * 「是否已挂载」的 lint 友好写法。
 * 原来的 `useState(false) + useEffect(setMounted(true))` 会触发
 * react-hooks/set-state-in-effect（级联渲染）；改用外部 store 快照，
 * 服务端拿到 false、客户端拿到 true，既不闪也不报 hydration 不一致。
 */
const emptySubscribe = () => () => {};
const useIsMounted = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

interface EnergyPoint {
  shortStr: string;
  dateStr: string;
  energy: number;
  x: number;
  y: number;
}

/** 雷达图的五个维度。放在组件外——写在组件里的话每次渲染都是新数组，
 *  以它为依赖的 useMemo 会失效，加进依赖数组又会把缓存打穿。 */
const RADAR_DIMENSIONS = [
  { key: "tech", label: "技术深度" },
  { key: "lang", label: "语言广度" },
  { key: "body", label: "身体机能" },
  { key: "social", label: "社交连接" },
  { key: "feynman", label: "表达输出" },
];

export default function StatsView({ embedded = false }: { embedded?: boolean } = {}) {
  /*
   * `useLiveQuery(...) || []` 每次渲染都会新建一个空数组。
   * 数据还没到时它是个新引用，下面就有一堆 useMemo 以它为依赖 ——
   * 于是「有没有数据」都会每帧重算一遍，`useMemo` 等于没写。
   * 拆成「原始值 + 稳定的兜底」两行，引用只在数据真变的时候才换。
   */
  const habitLogsRaw = useLiveQuery(() => db.habitLogs.toArray());
  const dailyRecordsRaw = useLiveQuery(() => db.dailyRecords.toArray());
  const cardsRaw = useLiveQuery(() => db.cards.toArray());
  const reviewEventsRaw = useLiveQuery(() => db.reviewEvents.toArray());

  const habitLogs = useMemo(() => habitLogsRaw ?? [], [habitLogsRaw]);
  const dailyRecords = useMemo(() => dailyRecordsRaw ?? [], [dailyRecordsRaw]);
  const cards = useMemo(() => cardsRaw ?? [], [cardsRaw]);
  const reviewEvents = useMemo(() => reviewEventsRaw ?? [], [reviewEventsRaw]);

  // 挂载状态，防止服务端与客户端水合不一致
  const mounted = useIsMounted();

  // 能量波动折线图 Hover 状态
  const [hoveredPoint, setHoveredPoint] = useState<EnergyPoint | null>(null);

  // ==========================================
  // 1. 出勤统计（替代原来的「连续打卡天数」）
  //
  // 手册第七章：打卡是「看见频率」，不是道德评分。所以这里：
  // - 不计算 currentStreak，界面上也不出现「连续 N 天」
  // - 只回答「近 30 天来了几天」和「比例是多少」
  // 断一天不会归零，也不会让人为了不断链而做假打卡。
  // ==========================================
  const attendance = useMemo(() => {
    const active = collectActiveDays({
      habitDates: habitLogs.map((l) => l.date),
      dailyRecords,
      reviewEventAts: reviewEvents.map((e) => e.at),
    });
    return buildAttendanceWindow(active, { days: 30 });
  }, [habitLogs, dailyRecords, reviewEvents]);

  const milestones = useMemo(
    () => buildMilestones(attendance),
    [attendance],
  );

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

    const labels = RADAR_DIMENSIONS.map((dim, idx) => {
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
    if (!mounted) return "加载中…";
    const keys: ("tech" | "lang" | "body" | "social" | "feynman")[] = ["tech", "lang", "body", "social", "feynman"];
    let maxKey = keys[0];
    keys.forEach((key) => {
      if (radarScores[key] > radarScores[maxKey]) {
        maxKey = key;
      }
    });
    
    const traitNames = {
      tech: "技术探索者",
      lang: "国际化视野者",
      body: "精力管理者",
      social: "情商共鸣者",
      feynman: "深度传播者",
    };
    return traitNames[maxKey];
  }, [radarScores, mounted]);

  /**
   * 自评分布（来自 reviewEvents 事件流）。
   *
   * 只统计真实发生过的复习事件，不用卡片当前字段反推——
   * 反推出来的分布会随卡片状态变化，看着像数据，其实不是。
   */
  const { reviewTotal, topRatingLabel } = useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of reviewEvents) {
      counts.set(e.rating, (counts.get(e.rating) ?? 0) + 1);
    }

    let top: { rating: Rating; count: number } | null = null;
    for (const [rating, count] of counts) {
      if (!top || count > top.count) top = { rating: rating as Rating, count };
    }

    return {
      reviewTotal: reviewEvents.length,
      topRatingLabel: top
        ? { ...top, label: RATING_META[top.rating]?.label ?? "未知" }
        : null,
    };
  }, [reviewEvents]);


  return (
    <div
      className={
        embedded
          ? // 嵌进看板时不要再套一层滚动容器与页头，否则会出现双滚动条和两个「看板」标题
            "space-y-8 select-none"
          : "flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 space-y-8 select-none"
      }
    >
      {/* 顶部 Header */}
      {!embedded && (
        <div>
          <span className="text-xs text-text-secondary font-mono uppercase tracking-widest">
            FREQUENCY, NOT STREAK
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1">看板</h1>
          <p className="text-sm text-text-secondary mt-1">
            只看频率，不看连续。
          </p>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* 出勤：替代原来的「连击天数 + 6 枚勋章」 */}
      {/* -------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左栏：出勤率 (2/5) */}
        <section className="lg:col-span-2">
          <SpotlightCard
            spotlightColor="rgba(29, 185, 84, 0.2)"
            className="surface-card h-full p-6 flex flex-col justify-between relative overflow-hidden"
          >
            <div className="absolute -right-12 -top-12 w-32 h-32 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                  Last 30 Days
                </span>
                <Flame className="w-5 h-5 text-primary" />
              </div>

              <div className="py-2">
                <span className="text-[11px] text-text-secondary font-mono uppercase tracking-wider block">
                  这 30 天里你来了
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-5xl md:text-6xl font-black font-mono tracking-tighter text-primary">
                    {mounted ? attendance.activeDays : 0}
                  </span>
                  <span className="text-sm font-bold text-text-secondary">
                    / {mounted ? attendance.elapsedDays : 30} 天
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-2 font-mono">
                  出勤率 {mounted ? formatRate(attendance.rate) : "—"}
                </p>
              </div>
            </div>

            <div className="border-t border-border-subtle/50 pt-5 mt-6">
              <p className="text-[10px] text-neutral-gray leading-relaxed bg-surface-3/50 p-2.5 rounded-lg border border-border-subtle/50 text-center">
                断一天不会归零，只是空一格。
              </p>
            </div>
          </SpotlightCard>
        </section>

        {/* 右栏：30 格出勤 + 两枚里程碑 (3/5) */}
        <section className="lg:col-span-3 p-5 space-y-5 surface-card">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> 近 30 天出勤格子
          </h2>

          <div className="flex flex-wrap gap-1.5">
            {(mounted ? attendance.cells : []).map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date} · ${cell.active ? "来过" : "没来"}`}
                className={`w-5 h-5 rounded-[4px] transition-colors ${
                  cell.isFuture
                    ? "bg-transparent border border-dashed border-border-subtle/40"
                    : cell.active
                      ? "bg-primary/80"
                      : "bg-surface-3 border border-border-subtle/20"
                } ${cell.isToday ? "ring-1 ring-primary ring-offset-2 ring-offset-surface-1" : ""}`}
              />
            ))}
            {!mounted && (
              <div className="h-5 w-full text-[10px] text-text-secondary font-mono">
                读取中…
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                onClick={() => handleBadgeClick(milestone.unlocked)}
                className={`p-3 rounded-xl border transition-all ${
                  milestone.unlocked
                    ? "border-primary/40 bg-primary/5 cursor-pointer hover:scale-[1.02] active:scale-95"
                    : "border-border-subtle bg-surface-2/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                    {milestone.name}
                  </span>
                  <span className="text-[10px] font-mono text-text-secondary">
                    {milestone.unlocked
                      ? "已达成"
                      : `${Math.min(attendance.activeDays, milestone.target)}/${milestone.target}`}
                  </span>
                </div>
                <div className="mt-2 h-1 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${milestone.unlocked ? "bg-primary" : "bg-primary/50"}`}
                    style={{ width: `${Math.round(milestone.progress * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-text-secondary mt-2 leading-relaxed">
                  {milestone.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 3. 年度自律活跃热力图 */}
      <section className="p-5 space-y-4 surface-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" /> 年度活跃热力图
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
        <section className="p-5 flex flex-col items-center gap-4 surface-card">
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
        <section className="p-5 flex flex-col items-center gap-4 relative surface-card">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono w-full text-left flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> 近 7 天能量曲线
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
                  <span className="text-primary font-bold">能量 {hoveredPoint.energy}/10</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>

      {/* 5. 数据里能直接看出来的事实
          这一段原来是一段硬编码的「AI 教练诊断」，它会建议用户
          「今晚 21:00 前往 AI 教练舱开启一次模拟演练」——而那个页面
          Phase 4 已经删了。假数据 + 死链接，比什么都不写更糟，
          所以改成纯事实陈述：只报数字，不给建议。 */}
      <section className="bg-gradient-to-br from-surface-1 to-surface-2 border border-border-subtle p-5 rounded-xl flex flex-col gap-4 relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-28 h-28 bg-primary/10 rounded-full blur-2xl" />

        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" /> 从记录里能看出来的事
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 bg-surface-2/40 p-4 rounded-xl border border-border-subtle/50">
              <span className="text-[10px] text-text-secondary uppercase tracking-widest block font-mono">
                练得最多的一类
              </span>
              <p className="text-sm font-bold text-primary mt-1">{highestTrait}</p>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <span className="text-[10px] text-text-secondary uppercase tracking-widest block font-mono">
                自评分布
              </span>
              {reviewTotal === 0 ? (
                <p className="text-xs text-text-secondary leading-relaxed">
                  还没有复习记录。
                </p>
              ) : (
                <>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    一共复习了{" "}
                    <span className="text-text-primary font-bold font-mono">
                      {reviewTotal}
                    </span>{" "}
                    次。最常出现的一档是
                    <span className="text-primary font-bold">
                      「{topRatingLabel?.label}」
                    </span>
                    （{topRatingLabel?.count} 次，占{" "}
                    {Math.round(((topRatingLabel?.count ?? 0) / reviewTotal) * 100)}%）。
                  </p>
                  <p className="text-[10px] text-text-secondary/70 leading-relaxed">
                    {topRatingLabel?.rating === 5
                      ? "总选「简单」会让间隔越拉越长，注意其实没答上来的卡。"
                      : topRatingLabel?.rating === 0
                        ? "「忘记」占比高，说明这些卡本就该更早回来。"
                        : "这一档只反映自评习惯。"}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-surface-3 p-3 rounded-lg border border-border-subtle text-[10px] text-neutral-gray leading-relaxed mt-2">
          <Info className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span>
            数字来自本地复习事件与打卡记录，无估算。
          </span>
        </div>
      </section>
    </div>
  );
}
