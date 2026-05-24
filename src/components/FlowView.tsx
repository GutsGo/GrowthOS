"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { db, Card } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  BookOpen,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Clock,
  ExternalLink,
} from "lucide-react";

export default function FlowView() {
  const {
    setActiveTab,
    isReviewMode,
    setReviewMode,
    flowTimerMinutes,
    setFlowTimerMinutes,
  } = useAppStore();

  // ==========================================
  // 1. 番茄钟核心计时逻辑
  // ==========================================
  const [secondsLeft, setSecondsLeft] = useState(flowTimerMinutes * 60);
  const [isActive, setIsActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 白噪音播放状态管理
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingNoise, setIsPlayingNoise] = useState(false);
  const [noiseType, setNoiseType] = useState<"none" | "rain" | "cafe">("none");
  const [noiseVolume, setNoiseVolume] = useState(0.4);

  const noiseSources = {
    rain: "https://www.soundjay.com/nature/sounds/rain-07.mp3",
    cafe: "https://www.soundjay.com/misc/sounds/ambient-dining-room-1.mp3",
  };

  // Web Audio API 警报蜂鸣音合成器
  const playBeepAlert = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (delay: number, duration: number, freq: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration);
      };
      playTone(0, 0.4, 523.25); // C5
      playTone(0.5, 0.4, 523.25);
      playTone(1.0, 0.6, 659.25); // E5
    } catch (err) {
      console.error("蜂鸣警报音播放失败:", err);
    }
  };

  // 申请浏览器推送通知权限
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  const sendFocusNotification = () => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification("🎯 GrowthOS 专注结束", {
        body: "恭喜完成一次深度专注！现在请休息 5 分钟，让大脑充充电，或开始费曼输出吧。",
      });
    }
  };

  // 白噪音播放切换逻辑
  useEffect(() => {
    if (noiseType === "none") {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsPlayingNoise(false);
      return;
    }

    const src = noiseSources[noiseType];
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.loop = true;
    } else {
      audioRef.current.src = src;
    }

    audioRef.current.volume = noiseVolume;

    if (isPlayingNoise) {
      audioRef.current.play().catch(err => console.log("白噪音播放需要交互授权:", err));
    } else {
      audioRef.current.pause();
    }
  }, [noiseType, isPlayingNoise]);

  // 音量动态调整
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = noiseVolume;
    }
  }, [noiseVolume]);

  // 离开专注或组件卸载时关闭白噪音
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 联动修改计时时长
  useEffect(() => {
    setSecondsLeft(flowTimerMinutes * 60);
    setIsActive(false);
  }, [flowTimerMinutes]);

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsActive(false);
            playBeepAlert();
            sendFocusNotification();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setSecondsLeft(flowTimerMinutes * 60);
  };

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // ==========================================
  // 2. 费曼输出板逻辑
  // ==========================================
  const [feynmanTopic, setFeynmanTopic] = useState("");
  const [feynmanContent, setFeynmanContent] = useState("");
  const [isFeynmanAnalysing, setIsFeynmanAnalysing] = useState(false);
  const [feynmanResult, setFeynmanResult] = useState<{
    score: number;
    tips: string[];
    grade: string;
  } | null>(null);

  const handleFeynmanAudit = async () => {
    if (!feynmanTopic || !feynmanContent) return;
    setIsFeynmanAnalysing(true);
    setFeynmanResult(null);

    try {
      const response = await fetch("/api/feynman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: feynmanTopic, content: feynmanContent }),
      });

      if (!response.ok) throw new Error("大模型评审接口请求失败");

      const data = await response.json();

      if (data.error === "NO_API_KEY") {
        runLocalFeynmanSimulation("⚠️ 未检测到 API 密钥，已自动为您降级为本地模拟分析。请在 .env.local 中配置密钥以使用真实大模型。");
      } else if (data.error) {
        throw new Error(data.message || "请求失败");
      } else {
        setFeynmanResult(data);
      }
    } catch (error) {
      console.error("Feynman Audit Error:", error);
      runLocalFeynmanSimulation("⚠️ 真实 AI 评审接口连接失败，已自动降级为本地模拟分析。请检查网络与后台服务。");
    } finally {
      setIsFeynmanAnalysing(false);
    }
  };

  const runLocalFeynmanSimulation = (warningMsg: string) => {
    const wordCount = feynmanContent.length;
    let score = 70 + Math.min(Math.floor(wordCount / 10), 20);
    const suggestions = [
      warningMsg,
      "你在解释该核心要点时使用了过多的抽象学术概念，对于零基础小白来说理解门槛较高。",
      "建议加入生动的生活实例（例如：将‘工具调用’类比为‘去餐馆根据菜单点菜’）。",
    ];

    if (feynmanContent.includes("也就是说") || feynmanContent.includes("比如")) {
      score += 5;
    } else {
      suggestions.push("可以多使用‘举个例子’、‘换句话说’来增强你口语化的输出直觉。");
    }

    setFeynmanResult({
      score: Math.min(score, 100),
      tips: suggestions,
      grade: score >= 90 ? "极易理解" : score >= 80 ? "基本易懂" : "较多术语",
    });
  };

  // ==========================================
  // 3. SM-2 卡片复习逻辑
  // ==========================================
  const reviewCards = useLiveQuery(async () => {
    const now = new Date();
    return await db.cards.filter((c) => c.nextReview <= now).toArray();
  }) || [];

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const activeCard = useMemo(() => {
    if (reviewCards.length === 0) return null;
    return reviewCards[currentCardIndex] || null;
  }, [reviewCards, currentCardIndex]);

  // SM-2 算法实现
  const handleSM2Rating = async (quality: 1 | 3 | 5) => {
    if (!activeCard) return;

    let { reps, interval, ease } = activeCard;

    // 1. 计算易记因子 (Ease Factor)
    // ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    ease = Math.max(1.3, ease);

    // 2. 连续复习成功次数 reps 与 间隔天数 interval
    if (quality < 3) {
      reps = 0;
      interval = 1;
    } else {
      if (reps === 0) {
        interval = 1;
      } else if (reps === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * ease);
      }
      reps += 1;
    }

    // 3. 计算下次复习时间 (nextReview = 当前时间 + interval 天)
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    // 4. 更新数据库中对应的卡片参数
    await db.cards.update(activeCard.id, {
      reps,
      interval,
      ease,
      nextReview,
    });

    // 5. 过渡到下一张卡片
    setIsFlipped(false);
    setTimeout(() => {
      if (currentCardIndex + 1 >= reviewCards.length) {
        // 复习完毕
        setCurrentCardIndex(0);
      } else {
        setCurrentCardIndex((prev) => prev + 1);
      }
    }, 150);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background-void relative">
      {/* 顶部退出全屏专注条 */}
      <div className="h-14 px-6 flex items-center justify-between border-b border-border-subtle bg-surface-1/40">
        <button
          onClick={() => {
            setReviewMode(false);
            setActiveTab("dashboard");
          }}
          className="flex items-center gap-2 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> 退出专注空间
        </button>
        <span className="text-[10px] tracking-widest uppercase font-bold text-primary font-mono flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 fill-primary" /> FLOW SPACE ACTIVE
        </span>
        <div className="w-20" /> {/* 布局平衡 */}
      </div>

      {/* 主画布 (双栏或专注单栏) */}
      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
        {isReviewMode ? (
          // ==========================================
          // 卡片复习专注模式视图 (SM-2 flashcards)
          // ==========================================
          <div className="w-full max-w-[560px] flex flex-col items-center justify-center min-h-[70vh] gap-6">
            <div className="text-center">
              <span className="text-xs font-mono uppercase tracking-widest text-ai-blue font-bold">
                SM-2 间隔重复记忆
              </span>
              <h2 className="text-xl font-bold mt-1">
                {reviewCards.length === 0 ? "全部搞定 🎉" : `复习队列中 [${currentCardIndex + 1}/${reviewCards.length}]`}
              </h2>
            </div>

            {reviewCards.length === 0 ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-surface-1 rounded-2xl border border-border-subtle p-8 text-center space-y-4 shadow-2xl"
              >
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto text-primary">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">今日到期卡片已全部复习完毕！</h3>
                <p className="text-xs text-text-secondary max-w-[320px] mx-auto">
                  完美，你已击败了遗忘曲线。你的意志力和长期记忆力得到了进一步增强。
                </p>
                <button
                  onClick={() => {
                    setReviewMode(false);
                    setActiveTab("dashboard");
                  }}
                  className="bg-primary hover:bg-primary-hover text-primary-text font-bold text-xs uppercase tracking-widest px-6 py-2.5 rounded-full transition-all"
                >
                  回到指挥舱
                </button>
              </motion.div>
            ) : (
              activeCard && (
                <div className="w-full flex flex-col gap-6">
                  {/* 3D 翻转卡片容器 */}
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="w-full h-[280px] cursor-pointer select-none perspective-[1000px]"
                  >
                    <motion.div
                      animate={{ rotateY: isFlipped ? 180 : 0 }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                      className="w-full h-full relative preserve-3d"
                    >
                      {/* 卡片正面 */}
                      <div className="absolute inset-0 backface-hidden bg-surface-1 border border-border-subtle hover:border-primary/40 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
                        <span className="text-[10px] font-mono tracking-widest text-text-secondary uppercase">
                          FRONT · 提示问题
                        </span>
                        <div className="flex-1 flex items-center justify-center text-center">
                          <p className="text-lg font-semibold text-text-primary leading-relaxed px-4">
                            {activeCard.front}
                          </p>
                        </div>
                        <span className="text-[10px] text-center text-text-secondary font-mono">
                          点击卡片翻看答案
                        </span>
                      </div>

                      {/* 卡片背面 */}
                      <div
                        style={{ transform: "rotateY(180deg)" }}
                        className="absolute inset-0 backface-hidden bg-surface-1 border border-border-subtle rounded-2xl p-6 flex flex-col justify-between shadow-xl"
                      >
                        <span className="text-[10px] font-mono tracking-widest text-ai-blue font-bold uppercase">
                          BACK · 核心解答
                        </span>
                        <div className="flex-1 flex items-center justify-center text-center overflow-y-auto py-2">
                          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap px-4">
                            {activeCard.back}
                          </p>
                        </div>
                        <span className="text-[10px] text-center text-text-secondary font-mono">
                          点击卡片回到正面
                        </span>
                      </div>
                    </motion.div>
                  </div>

                  {/* 评分操作栏 */}
                  <AnimatePresence>
                    {isFlipped && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="grid grid-cols-3 gap-3"
                      >
                        <button
                          onClick={() => handleSM2Rating(1)}
                          className="bg-surface-1 border border-border-subtle hover:border-error hover:text-error transition-all py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                        >
                          忘记 (Again)
                        </button>
                        <button
                          onClick={() => handleSM2Rating(3)}
                          className="bg-surface-1 border border-border-subtle hover:border-amber-500 hover:text-amber-500 transition-all py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                        >
                          吃力 (Hard)
                        </button>
                        <button
                          onClick={() => handleSM2Rating(5)}
                          className="bg-primary hover:bg-primary-hover text-primary-text transition-all py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                        >
                          轻松 (Good)
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            )}
          </div>
        ) : (
          // ==========================================
          // 常规专注计时与费曼输出板视图
          // ==========================================
          <div className="w-full max-w-[800px] grid grid-cols-1 md:grid-cols-5 gap-8 pt-4">
            {/* 左侧番茄钟区域 (占 2/5) */}
            <div className="md:col-span-2 flex flex-col items-center gap-6 bg-surface-1 border border-border-subtle p-6 rounded-2xl h-fit">
              <span className="text-xs font-bold uppercase tracking-widest text-text-secondary font-mono flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" /> Focus Timer
              </span>

              {/* 大倒计时 */}
              <div className="text-5xl font-mono font-extrabold tracking-wider py-4 select-none">
                {formatTime(secondsLeft)}
              </div>

              {/* 控制按钮 */}
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={toggleTimer}
                  className={`flex-1 py-2.5 rounded-full font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                    isActive
                      ? "bg-surface-2 border border-border-subtle text-text-primary hover:bg-surface-3"
                      : "bg-primary text-primary-text hover:bg-primary-hover hover:scale-[1.03]"
                  }`}
                >
                  {isActive ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>暂停</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>开始</span>
                    </>
                  )}
                </button>
                <button
                  onClick={resetTimer}
                  className="w-10 h-10 rounded-full bg-surface-2 border border-border-subtle hover:border-text-secondary flex items-center justify-center text-text-secondary hover:text-text-primary transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* 常用时间快捷选择 */}
              <div className="flex gap-2 w-full pt-2">
                {[15, 25, 45].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setFlowTimerMinutes(mins)}
                    className={`flex-1 py-1 rounded bg-surface-2 text-[10px] font-bold font-mono border ${
                      flowTimerMinutes === mins ? "border-primary text-primary" : "border-transparent text-text-secondary"
                    } hover:text-text-primary transition-colors`}
                  >
                    {mins}M
                  </button>
                ))}
              </div>

              {/* 白噪音环境音量播放控制器 */}
              <div className="w-full pt-4 border-t border-border-subtle/50 flex flex-col gap-3">
                <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                  <span className="flex items-center gap-1">
                    🎧 环境白噪音
                  </span>
                  {noiseType !== "none" && (
                    <span className="text-primary font-bold lowercase">
                      {noiseType} {isPlayingNoise ? "播放中" : "已暂停"}
                    </span>
                  )}
                </div>

                <div className="flex gap-2 w-full">
                  {[
                    { type: "none" as const, label: "无" },
                    { type: "rain" as const, label: "雨声" },
                    { type: "cafe" as const, label: "咖啡馆" },
                  ].map((noise) => (
                    <button
                      key={noise.type}
                      onClick={() => {
                        setNoiseType(noise.type);
                        if (noise.type !== "none") {
                          setIsPlayingNoise(true);
                        } else {
                          setIsPlayingNoise(false);
                        }
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        noiseType === noise.type
                          ? "bg-primary text-black border-primary font-bold"
                          : "bg-surface-2 border-transparent text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {noise.label}
                    </button>
                  ))}
                </div>

                {noiseType !== "none" && (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      onClick={() => setIsPlayingNoise(!isPlayingNoise)}
                      className="px-3 py-1 bg-surface-3 hover:bg-surface-2 border border-border-subtle rounded-lg text-[10px] font-bold text-text-primary transition-colors"
                    >
                      {isPlayingNoise ? "暂停" : "播放"}
                    </button>

                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[9px] text-text-secondary font-mono">音量</span>
                      <input
                        type="range"
                        min="0.05"
                        max="1.0"
                        step="0.05"
                        value={noiseVolume}
                        onChange={(e) => setNoiseVolume(Number(e.target.value))}
                        className="flex-1 h-1 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧费曼看板区域 (占 3/5) */}
            <div className="md:col-span-3 space-y-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  🧠 费曼输出板 (Feynman Board)
                </h2>
                <p className="text-xs text-text-secondary leading-relaxed">
                  通过向零基础的小白解释一个事物来达成深入掌握。在此写下你的讲述大纲，让 AI 评估你的语言易懂度。
                </p>
              </div>

              {/* 输入框 */}
              <div className="space-y-4 bg-surface-1 border border-border-subtle p-5 rounded-2xl">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-primary font-mono block">
                    解释目标概念
                  </label>
                  <input
                    type="text"
                    value={feynmanTopic}
                    onChange={(e) => setFeynmanTopic(e.target.value)}
                    placeholder="例如：AI Agent 的 ReAct 决策模式"
                    className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-ai-blue font-mono block">
                    通俗化解释讲述 (Markdown)
                  </label>
                  <textarea
                    rows={8}
                    value={feynmanContent}
                    onChange={(e) => setFeynmanContent(e.target.value)}
                    placeholder="用小白听得懂的类比和通俗语句把这个概念写下来..."
                    className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none resize-none font-mono"
                  />
                </div>

                <button
                  onClick={handleFeynmanAudit}
                  disabled={!feynmanTopic || !feynmanContent || isFeynmanAnalysing}
                  className={`w-full py-2.5 rounded-full font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                    !feynmanTopic || !feynmanContent || isFeynmanAnalysing
                      ? "bg-surface-3 text-text-secondary cursor-not-allowed"
                      : "bg-primary text-primary-text hover:bg-primary-hover hover:scale-[1.02]"
                  }`}
                >
                  {isFeynmanAnalysing ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>AI 判官深度分析中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 fill-current" />
                      <span>请求 [AI 判官] 评审</span>
                    </>
                  )}
                </button>
              </div>

              {/* AI 判官评审结果 */}
              <AnimatePresence>
                {feynmanResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="bg-surface-1 border border-border-subtle p-5 rounded-2xl flex flex-col gap-4 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-2 h-full bg-ai-blue" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-ai-blue" />
                        <span className="text-xs font-bold uppercase tracking-widest text-ai-blue font-mono">
                          Feynman Audit Result
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                        feynmanResult.score >= 85 ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-500"
                      }`}>
                        评级: {feynmanResult.grade}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold tracking-tight text-text-primary">
                        {feynmanResult.score}
                      </span>
                      <span className="text-xs text-text-secondary font-mono">/ 100 分</span>
                    </div>

                    <div className="space-y-2 border-t border-border-subtle/50 pt-3">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary block">
                        AI 卡壳点与改进提示：
                      </span>
                      <ul className="space-y-2">
                        {feynmanResult.tips.map((tip, idx) => (
                          <li key={idx} className="text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                            <span className="text-primary font-bold mt-0.5">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
