"use client";

import React, { useState, useRef, useEffect } from "react";
import { db } from "@/lib/db";
import { useAppStore } from "@/lib/store";
import {
  Sparkles,
  Send,
  User,
  Heart,
  Eye,
  Smile,
  BookOpen,
  ArrowRight,
  RefreshCw,
  PlusCircle,
  TrendingUp,
} from "lucide-react";
import SpotlightCard from "./reactbits/SpotlightCard";
import DecryptedText from "./reactbits/DecryptedText";
import Squares from "./reactbits/Squares";

interface Message {
  id: string;
  sender: "user" | "bot" | "coach";
  text: string;
  timestamp: Date;
  // 社交评练特有指标 (Coach反馈卡片)
  coachFeedback?: {
    emotionalValue: number; // 情绪价值
    needinessControl: number; // 需求感控制
    witScore: number; // 幽默风趣分
    advice: string;
  };
  // 新增：大模型工具执行指令属性
  toolCallInfo?: {
    action: string;
    success: boolean;
    message: string;
  };
}

export default function CoachView() {
  const { setActiveTab, setFlowTimerMinutes, setReviewMode } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init-1",
      sender: "coach",
      text: "你好！我是你的 AI 成长教练。在 MVP 阶段，你可以随时向我发起「社交演练」或请求「行动指南」。",
      timestamp: new Date(),
    },
  ]);

  const [inputVal, setInputVal] = useState("");
  const [roleplayTarget, setRoleplayTarget] = useState("刚认识的插画师女生");
  const [isTrainingActive, setIsTrainingActive] = useState(false);
  const [turnCount, setTurnCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 匹配本地正则工具调用
  const matchLocalRegexToolCall = (text: string) => {
    const createRegex = /(?:创建习惯|新建习惯|加个习惯|加习惯)\s*[:：\s]*([^\s，,。；!！]+)/i;
    const demandRegex = /(?:阻力|能量)(?:为|是|设为)?\s*(高|中|低)/i;
    const checkRegex = /([^\s，,。；!！]+)\s*(?:打卡|打个卡|签到)/i;
    const checkPrefixRegex = /(?:帮我)?(?:对)?\s*([^\s，,。；!！]+)\s*(?:打卡|签到)/i;

    let match = text.match(createRegex);
    if (match) {
      const name = match[1];
      const demandMatch = text.match(demandRegex);
      let energyDemand: "high" | "medium" | "low" = "medium";
      if (demandMatch) {
        const d = demandMatch[1];
        if (d === "高") energyDemand = "high";
        if (d === "低") energyDemand = "low";
      }
      
      let icon = "Target";
      if (name.includes("码") || name.includes("code") || name.includes("编程") || name.includes("程序")) icon = "Code";
      if (name.includes("聊") || name.includes("沟通") || name.includes("英语") || name.includes("说") || name.includes("背")) icon = "MessageSquare";
      if (name.includes("动") || name.includes("跑") || name.includes("健身") || name.includes("铁") || name.includes("练")) icon = "Activity";
      if (name.includes("读") || name.includes("书") || name.includes("学") || name.includes("思考")) icon = "User";

      return {
        action: "create_habit",
        params: { name, icon, frequency: "daily", energyDemand }
      };
    }

    match = text.match(checkRegex) || text.match(checkPrefixRegex);
    if (match) {
      const name = match[1];
      const cleanName = name.replace(/习惯/g, "");
      return {
        action: "check_habit",
        params: { name: cleanName }
      };
    }

    return null;
  };

  // 执行本地 IndexedDB 操作并给出状态反馈
  const executeLocalToolCall = async (action: string, params: any) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      
      if (action === "create_habit") {
        const { name, icon, frequency, energyDemand } = params;
        const exist = await db.habits.where("name").equals(name).first();
        if (exist) {
          return { success: false, message: `习惯【${name}】已在本地库中存在，无需重复创建。` };
        }
        await db.habits.add({
          id: crypto.randomUUID(),
          name,
          icon: icon || "Target",
          frequency: frequency || "daily",
          energyDemand: energyDemand || "medium",
          createdAt: new Date(),
        });
        return { success: true, message: `已成功为您创建新原子习惯：【${name}】（阻力配置：${energyDemand === "high" ? "高" : energyDemand === "low" ? "低" : "中"}）。` };
      }
      
      if (action === "check_habit") {
        const { name } = params;
        const habit = await db.habits.filter((h) => h.name.includes(name)).first();
        if (!habit) {
          return { success: false, message: `未能在本地找到名字包含“${name}”的习惯，请核对。` };
        }
        const logged = await db.habitLogs.where({ habitId: habit.id, date: today }).first();
        if (logged) {
          return { success: false, message: `今日习惯【${habit.name}】已在今日打过卡，请勿重复操作。` };
        }
        await db.habitLogs.add({
          id: crypto.randomUUID(),
          habitId: habit.id,
          date: today,
          createdAt: new Date(),
        });
        return { success: true, message: `已成功为您执行今日习惯打卡签到：【${habit.name}】！` };
      }
      
      if (action === "create_woop") {
        const { wish, outcome, obstacle, plan } = params;
        const exist = await db.dailyRecords.get(today);
        await db.dailyRecords.put({
          date: today,
          woopWish: wish,
          woopOutcome: outcome,
          woopObstacle: obstacle,
          woopPlan: plan,
          energyLevel: exist?.energyLevel || 5,
          createdAt: exist?.createdAt || new Date(),
        });
        return { success: true, message: `已设定今日意图 (WOOP)！Wish: ${wish} / If-Then Plan: ${plan}` };
      }
      
      return { success: false, message: "未知的工具操作类型" };
    } catch (e: any) {
      return { success: false, message: `执行本地工具失败: ${e.message}` };
    }
  };

  // 1. 开启社交演练训练
  const handleStartTraining = () => {
    setIsTrainingActive(true);
    setTurnCount(1);
    setMessages([
      {
        id: crypto.randomUUID(),
        sender: "coach",
        text: `社交模拟开始！当前设定对方人设为：[${roleplayTarget}]。对话将在后台接受情商指标监控。`,
        timestamp: new Date(),
      },
      {
        id: crypto.randomUUID(),
        sender: "bot",
        text: "嗨，今天看了几本非常特别的插画集，感觉很有启发。你平时也经常画画或者关注这块吗？🎨",
        timestamp: new Date(),
      },
    ]);
  };

  // 2. 重置训练
  const handleResetTraining = () => {
    setIsTrainingActive(false);
    setTurnCount(0);
    setMessages([
      {
        id: crypto.randomUUID(),
        sender: "coach",
        text: "已重置。你可以重新设定陪练目标，继续进行情商和表达演练。",
        timestamp: new Date(),
      },
    ]);
  };

  // 3. 发送消息逻辑
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      sender: "user",
      text: inputVal,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    const sentText = inputVal; // 备份输入文字
    setInputVal("");

    if (isTrainingActive) {
      setTurnCount((prev) => prev + 1);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages,
            roleplayTarget,
          }),
        });

        if (!response.ok) throw new Error("API call failed");

        const data = await response.json();

        if (data.error === "NO_API_KEY") {
          runLocalCoachSimulation("⚠️ 未检测到 API 密钥，已自动为您降级为本地模拟分析。请在 .env.local 中配置密钥以使用真实大模型。\n\n", sentText);
        } else if (data.error) {
          throw new Error(data.message || "请求失败");
        } else {
          const botMsg: Message = {
            id: crypto.randomUUID(),
            sender: "bot",
            text: data.botReply,
            timestamp: new Date(),
          };

          const coachMsg: Message = {
            id: crypto.randomUUID(),
            sender: "coach",
            text: "🔍 AI 教练已跳出人设，对你上一轮发言进行高情商复盘：",
            timestamp: new Date(),
            coachFeedback: data.coachFeedback,
          };

          let extraMsg: Message | null = null;
          if (data.toolCall) {
            const execRes = await executeLocalToolCall(data.toolCall.action, data.toolCall.params);
            extraMsg = {
              id: crypto.randomUUID(),
              sender: "coach",
              text: execRes.message,
              timestamp: new Date(),
              toolCallInfo: {
                action: data.toolCall.action,
                success: execRes.success,
                message: execRes.message,
              },
            };
          }

          setMessages((prev) => extraMsg ? [...prev, botMsg, coachMsg, extraMsg] : [...prev, botMsg, coachMsg]);
        }
      } catch (error) {
        console.error("AI Coach Chat Error:", error);
        runLocalCoachSimulation("⚠️ 真实 AI 诊断接口连接失败，已自动降级为本地模拟分析。请检查您的网络和 API 配置。\n\n", sentText);
      }
    } else {
      // 在未启动演练时，也支持口头习惯/打卡工具调用
      const localTool = matchLocalRegexToolCall(sentText);
      if (localTool) {
        setTimeout(async () => {
          const execRes = await executeLocalToolCall(localTool.action, localTool.params);
          const toolMsg: Message = {
            id: crypto.randomUUID(),
            sender: "coach",
            text: execRes.message,
            timestamp: new Date(),
            toolCallInfo: {
              action: localTool.action,
              success: execRes.success,
              message: execRes.message,
            },
          };
          setMessages((prev) => [...prev, toolMsg]);
        }, 600);
      } else {
        setTimeout(() => {
          const coachMsg: Message = {
            id: crypto.randomUUID(),
            sender: "coach",
            text: "你好！我已收到你的消息。在未启动「社交演练」时，我也可以回答一些关于个人成长或习惯养成的问题。若想进行高情商沟通测试，欢迎在上方设置对方角色并点击「启动演练」！\n\n💡 提示：你可以直接对我说“帮我创建一个叫 健身 的习惯”或“跑步打卡”，我将自动在本地为您执行工具调用并修改数据库。",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, coachMsg]);
        }, 800);
      }
    }
  };

  const runLocalCoachSimulation = (warningPrefix: string, text: string) => {
    // 首先判定是否匹配上本地 Tool Calling
    const localTool = matchLocalRegexToolCall(text);

    setTimeout(async () => {
      const botResponses = [
        "哈哈，是的，我大部分工作时间都是在画板前度过的，经常会有些自我怀疑。你喜欢什么风格的画呀？",
        "感觉你的回答很有礼貌，不过平时你也会做一些类似的手工或者画画吗？",
        "确实画画是一件很需要耐心的事，听你这么说还挺有趣的。",
      ];
      
      const coachFeedbacks = [
        {
          emotionalValue: 7,
          needinessControl: 9,
          witScore: 6,
          advice: warningPrefix + "回复整体得体无需求感。但对于‘插画集’这个话题没有提供足够的情绪反馈，建议追问她最近最得意的插画是哪一幅，以此增加谈话热度。",
        },
        {
          emotionalValue: 8,
          needinessControl: 8,
          witScore: 8,
          advice: warningPrefix + "表现不错！成功捕获了对方的好奇心。接下来的回复可以尝试更幽默的自嘲，让对话更加放松自然。",
        },
        {
          emotionalValue: 5,
          needinessControl: 4,
          witScore: 5,
          advice: warningPrefix + "对方表示‘自我怀疑’时，你的回答缺乏同理心关怀，且问句有轻微说教感。建议用倾听加赞赏（提供情绪价值）来破冰。",
        },
      ];

      const rIdx = Math.floor(Math.random() * botResponses.length);
      const fbIdx = Math.floor(Math.random() * coachFeedbacks.length);
      const botReply = botResponses[rIdx];
      const coachFeedback = coachFeedbacks[fbIdx];

      const botMsg: Message = {
        id: crypto.randomUUID(),
        sender: "bot",
        text: botReply,
        timestamp: new Date(),
      };

      const coachMsg: Message = {
        id: crypto.randomUUID(),
        sender: "coach",
        text: "🔍 AI 教练已跳出人设，对你上一轮发言进行高情商复盘：",
        timestamp: new Date(),
        coachFeedback,
      };

      let extraMsg: Message | null = null;
      if (localTool) {
        const execRes = await executeLocalToolCall(localTool.action, localTool.params);
        extraMsg = {
          id: crypto.randomUUID(),
          sender: "coach",
          text: execRes.message,
          timestamp: new Date(),
          toolCallInfo: {
            action: localTool.action,
            success: execRes.success,
            message: execRes.message,
          },
        };
      }

      setMessages((prev) => extraMsg ? [...prev, botMsg, coachMsg, extraMsg] : [...prev, botMsg, coachMsg]);
    }, 1000);
  };

  // 4. 将精彩话术一键保存到第二大脑闪卡库
  const handleSaveToBrain = async (frontQuestion: string, backAnswer: string) => {
    try {
      await db.cards.add({
        id: crypto.randomUUID(),
        front: `社交场景 · 应对【${roleplayTarget}】：${frontQuestion}`,
        back: backAnswer,
        tags: ["社交话术", "情商演练"],
        reps: 0,
        interval: 0,
        ease: 2.5,
        nextReview: new Date(),
        createdAt: new Date(),
      });
      alert("成功将该优质回复与教练建议提炼成卡片存入「第二大脑」！");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background-void overflow-hidden relative">
      <Squares className="opacity-15 pointer-events-none" />
      {/* 顶部训练控制器 */}
      <div className="min-h-16 py-3 md:py-0 border-b border-border-subtle bg-surface-1/40 px-4 md:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-ai-blue/20 flex items-center justify-center text-ai-blue">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold">高情商社交训练舱</h2>
            <p className="text-[10px] text-text-secondary">
              模拟对方人设并进行逐句情商评分与建议
            </p>
          </div>
        </div>

        {isTrainingActive ? (
          <button
            onClick={handleResetTraining}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-error/50 hover:bg-error/10 text-xs font-semibold text-error transition-all duration-200 active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>终止演练</span>
          </button>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={roleplayTarget}
              onChange={(e) => setRoleplayTarget(e.target.value)}
              placeholder="设定对方角色 (如：暴躁的技术总监)"
              className="px-3 h-8 bg-surface-1 border border-border-subtle rounded-xl text-xs outline-none focus:border-primary text-text-primary placeholder:text-neutral-gray flex-1 sm:w-[180px] md:w-[220px]"
            />
            <button
              onClick={handleStartTraining}
              className="bg-primary hover:bg-primary-hover text-primary-text text-xs font-bold px-4 h-8 rounded-xl flex items-center justify-center gap-1 transition-all duration-200 active:scale-95"
            >
              <span>启动演练</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 对话消息区 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 relative z-10">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          const isCoach = msg.sender === "coach";
          const isBot = msg.sender === "bot";

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${
                isUser ? "items-end" : "items-start"
              } space-y-1.5 max-w-[92%] sm:max-w-[85%] ${isUser ? "ml-auto" : "mr-auto"}`}
            >
              {/* 头像与身份提示 */}
              <div className="flex items-center gap-1.5 text-[10px] text-text-secondary font-mono">
                {!isUser && (
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      isCoach ? "bg-ai-blue/20 text-ai-blue" : "bg-primary/20 text-primary"
                    }`}
                  >
                    {isCoach ? <Sparkles className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                  </div>
                )}
                <span>
                  {isUser ? "我" : isCoach ? "AI COACH" : roleplayTarget}
                </span>
                {isUser && (
                  <div className="w-4 h-4 rounded-full bg-surface-3 flex items-center justify-center text-text-secondary">
                    <User className="w-2.5 h-2.5" />
                  </div>
                )}
              </div>

              {/* 气泡内容 */}
              <div
                className={`px-4 py-3 rounded-xl text-xs leading-relaxed ${
                  isUser
                    ? "bg-primary text-black font-semibold rounded-tr-none"
                    : isCoach
                    ? "bg-surface-2 border border-border-subtle rounded-tl-none text-text-primary"
                    : "bg-surface-1 border border-border-subtle rounded-tl-none text-text-primary"
                }`}
              >
                {isCoach && msg.text.includes("复盘") ? (
                  <DecryptedText text={msg.text} speed={30} className="font-bold text-ai-blue" />
                ) : (
                  msg.text
                )}

                {/* AI 自动执行工具卡片 */}
                {msg.toolCallInfo && (
                  <SpotlightCard
                    spotlightColor={msg.toolCallInfo.success ? "rgba(29, 185, 84, 0.2)" : "rgba(239, 68, 68, 0.2)"}
                    className={`mt-3 border rounded-xl p-3 space-y-2 select-none relative overflow-hidden ${
                      msg.toolCallInfo.success
                        ? "border-primary/45 shadow-[0_0_12px_rgba(29,185,84,0.15)] text-primary"
                        : "border-error/45 shadow-[0_0_12px_rgba(239,68,68,0.15)] text-error"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold font-mono text-[10px] tracking-wide uppercase">
                      <PlusCircle className={`w-3.5 h-3.5 ${msg.toolCallInfo.success ? "text-primary animate-pulse" : "text-error"}`} />
                      <span>AI Tool Action: {msg.toolCallInfo.action}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-text-primary">
                      {msg.toolCallInfo.message}
                    </p>
                    <span className="text-[9px] text-text-secondary uppercase tracking-widest font-mono block text-right mt-1">
                      {msg.toolCallInfo.success ? "Executed Local Success" : "Execution Failed"}
                    </span>
                  </SpotlightCard>
                )}

                {/* 情商反馈卡片 (特有嵌套) */}
                {msg.coachFeedback && (
                  <SpotlightCard spotlightColor="rgba(59, 130, 246, 0.15)" className="mt-4 border border-border-subtle rounded-lg p-3 space-y-3">
                    {/* 三维能力滑块条 */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-surface-2 p-2 rounded flex flex-col gap-1 border border-border-subtle">
                        <span className="text-[9px] text-text-secondary font-bold flex items-center gap-1">
                          <Heart className="w-3 h-3 text-error" /> 情绪价值
                        </span>
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-sm font-bold font-mono text-primary">
                            {msg.coachFeedback.emotionalValue}
                          </span>
                          <span className="text-[9px] text-text-secondary font-mono">/10</span>
                        </div>
                      </div>

                      <div className="bg-surface-2 p-2 rounded flex flex-col gap-1 border border-border-subtle">
                        <span className="text-[9px] text-text-secondary font-bold flex items-center gap-1">
                          <Eye className="w-3 h-3 text-ai-blue" /> 需求感控制
                        </span>
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-sm font-bold font-mono text-primary">
                            {msg.coachFeedback.needinessControl}
                          </span>
                          <span className="text-[9px] text-text-secondary font-mono">/10</span>
                        </div>
                      </div>

                      <div className="bg-surface-2 p-2 rounded flex flex-col gap-1 border border-border-subtle">
                        <span className="text-[9px] text-text-secondary font-bold flex items-center gap-1">
                          <Smile className="w-3 h-3 text-amber-500" /> 幽默风趣
                        </span>
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-sm font-bold font-mono text-primary">
                            {msg.coachFeedback.witScore}
                          </span>
                          <span className="text-[9px] text-text-secondary font-mono">/10</span>
                        </div>
                      </div>
                    </div>

                    {/* 话术改进建议 */}
                    <div className="text-[11px] text-text-secondary leading-relaxed bg-surface-2 p-2.5 rounded border border-border-subtle">
                      <span className="font-bold text-text-primary text-[10px] block mb-1">
                        🌱 教练反馈：
                      </span>
                      {msg.coachFeedback.advice}
                    </div>

                    {/* 保存为卡片动作 */}
                    <button
                      onClick={() =>
                        handleSaveToBrain(
                          `怎么幽默地应对 ${roleplayTarget} 的“关于你对手工作品或画画的提问”？`,
                          `【优秀回复示例】:\n对方提问后，可以这样说：“平时我的双手主要用来和键盘‘打架’，不过看到你这些这么有灵气的画，觉得我的键盘也需要去充充氧气了。”\n\n【高情商技巧】：\n${msg.coachFeedback?.advice || ""}`
                        )
                      }
                      className="w-full py-1.5 bg-surface-3 hover:bg-primary hover:text-primary-text transition-all duration-200 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1 active:scale-95"
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>提炼为记忆卡片存入第二大脑</span>
                    </button>
                  </SpotlightCard>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入框 */}
      <div className="p-4 border-t border-border-subtle bg-surface-1 relative z-10">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={
              isTrainingActive
                ? `以模拟身份向对方回复...`
                : "向 AI 成长教练提问或开始社交陪练..."
            }
            className="flex-1 px-4 py-2.5 bg-surface-1 border border-border-subtle rounded-xl text-xs outline-none focus:border-primary text-text-primary placeholder:text-neutral-gray"
          />
          <button
            type="submit"
            disabled={!inputVal.trim()}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              inputVal.trim()
                ? "bg-primary text-black hover:scale-[1.04]"
                : "bg-surface-3 text-text-secondary cursor-not-allowed"
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
