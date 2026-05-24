"use client";

import React, { useMemo, useState } from "react";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Flame, Target, Award, Info, Zap } from "lucide-react";

export default function StatsView() {
  const habitLogs = useLiveQuery(() => db.habitLogs.toArray()) || [];
  const habits = useLiveQuery(() => db.habits.toArray()) || [];
  const dailyRecords = useLiveQuery(() => db.dailyRecords.toArray()) || [];

  // 能量波动折线图 Hover 状态
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);

  // ==========================================
  // 0. 7 天能量波动折线数据计算
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
  // 1. GitHub 风格 12 周打卡热力图计算
  // ==========================================
  const heatmapData = useMemo(() => {
    // 过去 12 周 (84 天) 的数据
    const totalDays = 84;
    const data: { dateStr: string; count: number; dayOfWeek: number }[] = [];
    const now = new Date();

    // 格式化 YYYY-MM-DD
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${date}`;
    };

    // 统计每天的打卡量
    const logsCountMap: Record<string, number> = {};
    habitLogs.forEach((log) => {
      logsCountMap[log.date] = (logsCountMap[log.date] || 0) + 1;
    });

    for (let i = totalDays - 1; i >= 0; i--) {
      const tempDate = new Date();
      tempDate.setDate(now.getDate() - i);
      const dateStr = formatDate(tempDate);
      data.push({
        dateStr,
        count: logsCountMap[dateStr] || 0,
        dayOfWeek: tempDate.getDay(), // 0:周日, 1:周一...
      });
    }

    // 转化为按列（每周一列，共 12 列，每列 7 个格子）排列的网格
    // 补齐使网格从周一开始，此处做轻量化一维网格渲染
    return data;
  }, [habitLogs]);

  // ==========================================
  // 2. 五维能力雷达图计算 (SVG 绘制)
  // ==========================================
  // 维度：技术深度、语言广度、身体机能、社交连接、表达魅力
  const radarDimensions = [
    { key: "tech", label: "技术深度 (AI/代码)" },
    { key: "lang", label: "语言广度 (英语)" },
    { key: "body", label: "身体机能 (力量/健身)" },
    { key: "social", label: "社交连接 (表达/倾听)" },
    { key: "feynman", label: "表达魅力 (费曼输出)" },
  ];

  const radarScores = useMemo(() => {
    // 按习惯类型统计次数
    const techCount = habitLogs.filter((l) => l.habitId === "habit-1").length;
    const langCount = habitLogs.filter((l) => l.habitId === "habit-2").length;
    const bodyCount = habitLogs.filter((l) => l.habitId === "habit-3").length;
    const socialCount = habitLogs.filter((l) => l.habitId === "habit-4").length;
    // 默认给表达魅力赋予一点基础值加上卡片总量和打卡总量的综合加成
    const feynmanCount = Math.floor(habitLogs.length * 0.2) + 2;

    // 映射分值在 30 ~ 100 之间
    const getScore = (count: number) => Math.min(30 + count * 15, 100);

    return {
      tech: getScore(techCount),
      lang: getScore(langCount),
      body: getScore(bodyCount),
      social: getScore(socialCount),
      feynman: getScore(feynmanCount),
    };
  }, [habitLogs]);

  // 绘制 SVG 雷达图计算属性
  const radarSvgPoints = useMemo(() => {
    const size = 300;
    const center = size / 2;
    const radius = 100; // 最大半径 (对应 100 分)
    const points: { x: number; y: number }[] = [];

    // 五角星每个角的弧度
    // 0: 顶部, 1: 右上, 2: 右下, 3: 左下, 4: 左上
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
    
    // 背景多边形网格线 (50%, 75%, 100%)
    const gridPolygons = [0.25, 0.5, 0.75, 1.0].map((ratio) => {
      const gPoints = angles.map((angle) => {
        const x = center + radius * ratio * Math.cos(angle);
        const y = center + radius * ratio * Math.sin(angle);
        return `${x},${y}`;
      });
      return gPoints.join(" ");
    });

    // 文字标注的坐标
    const labels = radarDimensions.map((dim, idx) => {
      // 稍微往外拉一点以防文本重叠
      const labelRadius = radius + 24;
      const x = center + labelRadius * Math.cos(angles[idx]);
      const y = center + labelRadius * Math.sin(angles[idx]);
      // 左右文字对齐调整
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

  // 根据数据评估当前的卓越特质
  const highestTrait = useMemo(() => {
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
  }, [radarScores]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 space-y-8">
      {/* 顶部 Header */}
      <div>
        <span className="text-xs text-text-secondary font-mono uppercase tracking-widest">
          STATISTICS & REVIEW
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight mt-1">数据与复盘看板</h1>
        <p className="text-sm text-text-secondary mt-1">
          直观呈现你的成长足迹。用确凿的数据构建起长期自驱的底层自信。
        </p>
      </div>

      {/* 1. 年度 GitHub 风格习惯打卡热力图 */}
      <section className="bg-surface-1 border border-border-subtle p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary font-mono flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" /> 近期习惯活跃热力图 (Last 12 Weeks)
          </h2>
          <div className="flex items-center gap-1.5 text-[10px] text-text-secondary font-mono">
            <span>少</span>
            <div className="w-2.5 h-2.5 rounded-sm bg-surface-3" />
            <div className="w-2.5 h-2.5 rounded-sm bg-primary/30" />
            <div className="w-2.5 h-2.5 rounded-sm bg-primary/60" />
            <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
            <span>多</span>
          </div>
        </div>

        {/* 热力图网格 */}
        <div className="overflow-x-auto pb-2 select-none">
          <div className="grid grid-flow-col auto-cols-max gap-1.5 justify-start">
            {/* 每列代表 7 天的方格，总共约 12 列 */}
            {Array.from({ length: 12 }).map((_, colIdx) => (
              <div key={colIdx} className="grid grid-rows-7 gap-1.5">
                {heatmapData.slice(colIdx * 7, (colIdx + 1) * 7).map((item, rowIdx) => {
                  let colorClass = "bg-surface-3";
                  if (item.count === 1) colorClass = "bg-primary/30";
                  if (item.count === 2) colorClass = "bg-primary/60";
                  if (item.count >= 3) colorClass = "bg-primary shadow-[0_0_8px_rgba(29,185,84,0.3)]";

                  return (
                    <div
                      key={rowIdx}
                      title={`${item.dateStr}: 打卡 ${item.count} 次`}
                      className={`w-3.5 h-3.5 rounded-[3px] transition-colors duration-150 ${colorClass}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. 下方 Grid (五维雷达图与特质描述) */}
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
              {/* 定义线性渐变层 */}
              <defs>
                <linearGradient id="energyAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1DB954" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#1DB954" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              {/* 绘制背景横格线（分别代表能量 1, 4, 7, 10） */}
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

              {/* 折线上的数据圆点 */}
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

            {/* Hover 浮动 Tooltip */}
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

      {/* 3. 整行：AI 教练习惯特质诊断 */}
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
