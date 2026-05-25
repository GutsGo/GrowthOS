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
  Code,
  AlertCircle,
  Activity,
  CheckCircle2,
  Terminal,
  Zap,
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
  // 大模型工具执行指令属性
  toolCallInfo?: {
    action: string;
    success: boolean;
    message: string;
  };
}

// ----------------------------------------------------
// 1. 手写 SVG 蛛网雷达图 (纯组件，防 React 19 冲突)
// ----------------------------------------------------
interface RadarChartProps {
  eq: number;
  boundary: number;
  wit: number;
  empathy: number;
  fluency: number;
}

function RadarChart({ eq, boundary, wit, empathy, fluency }: RadarChartProps) {
  const cx = 95;
  const cy = 95;
  const R = 60;

  // 五个维度的极角角度
  const angles = [
    -Math.PI / 2,                      // 顶部: EQ
    -Math.PI / 2 + (2 * Math.PI) / 5,  // 右上: 边界感
    -Math.PI / 2 + (4 * Math.PI) / 5,  // 右下: 幽默感
    -Math.PI / 2 + (6 * Math.PI) / 5,  // 左下: 同理心
    -Math.PI / 2 + (8 * Math.PI) / 5,  // 左上: 流畅度
  ];

  const scores = [eq, boundary, wit, empathy, fluency];
  const labels = ["情商", "边界感", "幽默感", "同理心", "流畅度"];

  // 计算多边形顶点的 helper
  const getPoints = (radiusFactors: number[]) => {
    return angles
      .map((angle, i) => {
        const r = R * radiusFactors[i];
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  };

  // 背景环 (25%, 50%, 75%, 100%)
  const gridRings = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className="flex flex-col items-center justify-center p-3 bg-surface-3/50 rounded-xl border border-border-subtle select-none">
      <svg width="220" height="210" className="overflow-visible">
        {/* 背景五边形网格 */}
        {gridRings.map((factor, idx) => (
          <polygon
            key={idx}
            points={getPoints(Array(5).fill(factor))}
            fill="none"
            stroke="#282828"
            strokeWidth="0.8"
            strokeDasharray={idx === 3 ? "none" : "2,2"}
          />
        ))}

        {/* 轴线 */}
        {angles.map((angle, i) => {
          const x2 = cx + R * Math.cos(angle);
          const y2 = cy + R * Math.sin(angle);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x2}
              y2={y2}
              stroke="#282828"
              strokeWidth="0.8"
            />
          );
        })}

        {/* 覆盖数据区域 */}
        <polygon
          points={getPoints(scores.map((s) => s / 100))}
          fill="rgba(59, 130, 246, 0.2)"
          stroke="#3b82f6"
          strokeWidth="2"
        />

        {/* 数据点 */}
        {angles.map((angle, i) => {
          const r = R * (scores[i] / 100);
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          return (
            <circle
              key={i}
              cx={px}
              cy={py}
              r="3.5"
              fill="#1DB954"
              stroke="#3b82f6"
              strokeWidth="1"
            />
          );
        })}

        {/* 标签文字 */}
        {angles.map((angle, i) => {
          const labelDist = R + 15;
          const tx = cx + labelDist * Math.cos(angle);
          const ty = cy + labelDist * Math.sin(angle);
          
          let textAnchor: "inherit" | "end" | "start" | "middle" = "middle";
          if (Math.cos(angle) > 0.1) textAnchor = "start";
          else if (Math.cos(angle) < -0.1) textAnchor = "end";

          return (
            <text
              key={i}
              x={tx}
              y={ty + 3}
              fill="#A7A7A7"
              fontSize="10"
              fontWeight="bold"
              textAnchor={textAnchor}
              className="font-sans"
            >
              {labels[i]}
              <tspan fill="#1DB954" className="font-mono ml-1 font-bold">
                {scores[i]}
              </tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ----------------------------------------------------
// 2. 自定义 Git-Diff 代码高亮对比渲染组件
// ----------------------------------------------------
function DiffRenderer({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <pre className="bg-surface-3/80 p-4 rounded-xl border border-border-subtle overflow-x-auto text-[11px] font-mono leading-relaxed select-text relative max-h-[300px]">
      {lines.map((line, idx) => {
        const isDelete = line.startsWith("-");
        const isInsert = line.startsWith("+");
        const cleanLine = (isDelete || isInsert) ? line.slice(1) : line;
        
        let bgClass = "hover:bg-surface-1/40";
        let textClass = "text-text-primary";
        let sign = " ";
        
        if (isDelete) {
          bgClass = "bg-error/15 text-error border-l-2 border-error/70";
          textClass = "text-red-400";
          sign = "-";
        } else if (isInsert) {
          bgClass = "bg-primary/10 text-primary border-l-2 border-primary/70";
          textClass = "text-emerald-400";
          sign = "+";
        }

        return (
          <div key={idx} className={`flex items-start px-2 py-0.5 rounded ${bgClass}`}>
            <span className="w-6 text-[9px] text-text-secondary select-none text-right pr-2 opacity-40 font-mono mt-0.5">
              {idx + 1}
            </span>
            <span className="w-4 text-[10px] text-text-secondary select-none font-bold opacity-60">
              {sign}
            </span>
            <span className={`flex-1 whitespace-pre-wrap break-all ${textClass}`}>
              {cleanLine}
            </span>
          </div>
        );
      })}
    </pre>
  );
}

// ----------------------------------------------------
// 3. 核心 CoachView 组件
// ----------------------------------------------------
export default function CoachView() {
  const { setActiveTab } = useAppStore();
  const [activeSubTab, setActiveSubTab] = useState<"social" | "vibe">("social");

  // ==================================================
  // 3.1 社交话术演练状态与逻辑
  // ==================================================
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init-1",
      sender: "coach",
      text: "你好！我是你的 AI 成长教练。你可以随时在上方设定沟通角色，向我发起 3 回合「社交话术演练」，或者在右侧切换为「编程诊断助手」查找 Bug！",
      timestamp: new Date(),
    },
  ]);

  const [inputVal, setInputVal] = useState("");
  const [roleplayTarget, setRoleplayTarget] = useState("刚认识的插画师女生");
  const [isTrainingActive, setIsTrainingActive] = useState(false);
  const [isTrainingFinished, setIsTrainingFinished] = useState(false);
  const [overallReport, setOverallReport] = useState<any>(null);
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
    setIsTrainingFinished(false);
    setOverallReport(null);
    setTurnCount(1);
    setMessages([
      {
        id: crypto.randomUUID(),
        sender: "coach",
        text: `社交模拟开始！设定对方角色为：[${roleplayTarget}]。您共有 3 回合实战演练机会，每次回复后将获得教练复盘。`,
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
    setIsTrainingFinished(false);
    setOverallReport(null);
    setTurnCount(0);
    setMessages([
      {
        id: crypto.randomUUID(),
        sender: "coach",
        text: "已重置。你可以重新设定陪练目标，开启新一轮的社交演练。",
        timestamp: new Date(),
      },
    ]);
  };

  // 3. 发送消息逻辑
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isTrainingFinished) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      sender: "user",
      text: inputVal,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    const sentText = inputVal; 
    setInputVal("");

    if (isTrainingActive) {
      const isLast = turnCount === 3;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages,
            roleplayTarget,
            isLastTurn: isLast,
          }),
        });

        if (!response.ok) throw new Error("API call failed");

        const data = await response.json();

        if (data.error === "NO_API_KEY") {
          runLocalCoachSimulation("⚠️ 未检测到 API 密钥，已自动为您降级为本地模拟分析。\n\n", sentText, isLast);
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
            text: isLast 
              ? "🏆 演练结束！以下是您的最终社交情商评估诊断报告：" 
              : "🔍 AI 教练已跳出人设，对你上一轮发言进行高情商复盘：",
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

          if (isLast && data.overallReport) {
            setOverallReport(data.overallReport);
            setIsTrainingFinished(true);
          } else if (!isLast) {
            setTurnCount((prev) => prev + 1);
          }
        }
      } catch (error) {
        console.error("AI Coach Chat Error:", error);
        runLocalCoachSimulation("⚠️ 真实 AI 诊断接口连接失败，已自动降级为本地模拟分析。\n\n", sentText, isLast);
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
            text: "你好！我已收到你的消息。在未启动「社交演练」时，我可以回答一些关于个人成长或习惯养成的问题。若想进行高情商沟通测试，欢迎在上方设置对方角色并点击「启动演练」！\n\n💡 提示：你可以直接对我说“帮我创建一个叫 健身 的习惯”或“跑步打卡”，我将自动在本地为您执行工具调用并修改数据库。",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, coachMsg]);
        }, 800);
      }
    }
  };

  const runLocalCoachSimulation = (warningPrefix: string, text: string, isLast: boolean) => {
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
        text: isLast 
          ? "🏆 演练结束！以下是您的最终社交情商评估诊断报告：" 
          : "🔍 AI 教练已跳出人设，对你上一轮发言进行高情商复盘：",
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

      if (isLast) {
        // 本地降级生成 Mock 的 overallReport
        const mockReport = {
          eq: Math.floor(Math.random() * 20) + 70, 
          boundary: Math.floor(Math.random() * 20) + 75,
          wit: Math.floor(Math.random() * 25) + 65,
          empathy: Math.floor(Math.random() * 20) + 70,
          fluency: Math.floor(Math.random() * 15) + 80,
          summary: "（⚠️ 本地降级诊断）您在本次对话演练中整体表现得体，没有暴露明显的多余需求感，对人设的话题做出了积极的回应。未来建议多加入幽默和深层情感共振，避免流于表面客套。",
          strengths: ["话题衔接较为自然，能针对插画主题追问细节", "社交姿态健康，没有暴露过多讨好或卑微心理"],
          weaknesses: ["倾听和情绪捕捉偏向事务性，共鸣深度还可以加强", "话术稍显一板一眼，可以多融入自嘲或者风趣调侃"]
        };
        setOverallReport(mockReport);
        setIsTrainingFinished(true);
      } else {
        setTurnCount((prev) => prev + 1);
      }
    }, 1000);
  };

  // 将精彩话术保存至记忆闪卡库
  const handleSaveToBrain = async (frontQuestion: string, backAnswer: string) => {
    try {
      await db.cards.add({
        id: crypto.randomUUID(),
        front: `社交场景 · 应对【${roleplayTarget}】：${frontQuestion}`,
        back: backAnswer,
        tags: ["社交话术", "情商演练", "错题本"],
        reps: 0,
        interval: 0,
        ease: 2.5,
        nextReview: new Date(),
        createdAt: new Date(),
      });
      alert("已成功将该优质回复与教练建议提炼成卡片存入「第二大脑」！");
    } catch (err) {
      console.error(err);
    }
  };


  // ==================================================
  // 3.2 Vibe Coding 编程诊断助手状态与逻辑
  // ==================================================
  const [vibeBug, setVibeBug] = useState("");
  const [vibeCode, setVibeCode] = useState("");
  const [vibeLoading, setVibeLoading] = useState(false);
  const [vibeResult, setVibeResult] = useState<{
    analysis: string;
    diffCode: string;
    matchedNoteTitle: string;
    advice: string;
  } | null>(null);

  // 执行 Vibe Coding 诊断
  const handleVibeDiagnose = async () => {
    if (!vibeBug.trim()) return;
    setVibeLoading(true);
    setVibeResult(null);

    try {
      // 1. 获取本地 IndexedDB 中带有 bug 或 tech 相关标签的闪卡作为 localNotes
      const cards = await db.cards.toArray();
      const localNotes = cards
        .filter((c) =>
          c.tags.some((t) => {
            const tagLower = t.toLowerCase();
            return tagLower.includes("bug") || tagLower.includes("tech") || tagLower.includes("vibe") || tagLower.includes("代码") || tagLower.includes("开发");
          })
        )
        .map((c) => ({
          id: c.id,
          front: c.front,
          back: c.back,
          tags: c.tags,
        }));

      // 2. 发起 API 请求
      const response = await fetch("/api/vibe-coding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bugDescription: vibeBug,
          codeContext: vibeCode,
          localNotes: localNotes,
        }),
      });

      if (!response.ok) throw new Error("编程诊断接口请求失败");

      const data = await response.json();
      setVibeResult(data);
    } catch (e: any) {
      console.error(e);
      setVibeResult({
        analysis: "（诊断异常）获取 AI 调试失败，请检查网络或配置。",
        diffCode: `// 报错捕获\n- Error: ${e.message || "Unknown error"}`,
        matchedNoteTitle: "",
        advice: "请检查您的网络连接或大模型 API Key 环境变量。"
      });
    } finally {
      setVibeLoading(false);
    }
  };

  // 将诊断方案提炼存入本地第二大脑
  const handleSaveVibeToBrain = async () => {
    if (!vibeResult) return;
    try {
      const title = vibeResult.matchedNoteTitle || `Bug诊断 · ${vibeBug.slice(0, 25)}...`;
      const htmlBack = `
        <p><strong>错误成因：</strong>${vibeResult.analysis}</p>
        <p><strong>修复方案 (Diff对比)：</strong></p>
        <pre><code>${vibeResult.diffCode}</code></pre>
        <p><strong>架构调试忠告：</strong>${vibeResult.advice}</p>
      `;

      await db.cards.add({
        id: crypto.randomUUID(),
        front: title,
        back: htmlBack,
        tags: ["bug-note", "vibe-coding", "错题本"],
        reps: 0,
        interval: 0,
        ease: 2.5,
        nextReview: new Date(),
        createdAt: new Date(),
      });
      alert("成功提炼本次 Bug 修复经验，已保存为记忆卡片存入「第二大脑」！");
    } catch (err) {
      console.error(err);
      alert("保存卡片失败，详情见控制台日志。");
    }
  };


  return (
    <div className="flex-1 flex flex-col h-full bg-background-void overflow-hidden relative">
      <Squares className="opacity-15 pointer-events-none" />
      
      {/* 顶部状态栏与 Sub-Tab 控制器 */}
      <div className="min-h-16 py-3 border-b border-border-subtle bg-surface-1/40 px-4 md:px-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-ai-blue/20 flex items-center justify-center text-ai-blue shadow-[0_0_8px_rgba(59,130,246,0.2)]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold">GrowthOS AI 综合训练舱</h2>
            <p className="text-[10px] text-text-secondary">
              集成高情商话术刻意练习与 RAG 编程 Bug 诊断诊断
            </p>
          </div>
        </div>

        {/* 核心 Sub-Tab 切换 */}
        <div className="flex bg-surface-2 p-1 rounded-xl border border-border-subtle self-start md:self-auto select-none">
          <button
            onClick={() => setActiveSubTab("social")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
              activeSubTab === "social"
                ? "bg-primary text-black shadow-md font-semibold"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-3"
            }`}
          >
            <Smile className="w-3.5 h-3.5" />
            <span>社交演练</span>
          </button>
          <button
            onClick={() => setActiveSubTab("vibe")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
              activeSubTab === "vibe"
                ? "bg-ai-blue text-white shadow-md font-semibold"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-3"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>编程诊断</span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* 视图一：社交话术演练视图 */}
      {/* -------------------------------------------------- */}
      {activeSubTab === "social" && (
        <div className="flex-1 flex flex-col overflow-hidden relative z-10">
          
          {/* 角色设定与演练控制栏 */}
          <div className="bg-surface-1/70 border-b border-border-subtle px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase font-bold tracking-widest text-text-secondary font-mono bg-surface-3 px-1.5 py-0.5 rounded border border-border-subtle">
                回合: {isTrainingActive ? `${turnCount} / 3` : "待开启"}
              </span>
              {isTrainingActive && (
                <div className="flex items-center gap-1 text-[9px] font-bold text-primary animate-pulse">
                  <Zap className="w-3 h-3" />
                  <span>演练进行中</span>
                </div>
              )}
            </div>

            {isTrainingActive ? (
              <button
                onClick={handleResetTraining}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-error/50 hover:bg-error/10 text-[10px] font-bold text-error transition-all duration-200 active:scale-95"
              >
                <RefreshCw className="w-3 h-3" />
                <span>终止本轮</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={roleplayTarget}
                  onChange={(e) => setRoleplayTarget(e.target.value)}
                  placeholder="设定对方角色 (如：暴躁的技术总监)"
                  className="px-3 h-7 bg-surface-1 border border-border-subtle rounded-lg text-xs outline-none focus:border-primary text-text-primary placeholder:text-neutral-gray flex-1 sm:w-[200px]"
                />
                <button
                  onClick={handleStartTraining}
                  className="bg-primary hover:bg-primary-hover text-primary-text text-[10px] font-bold px-3 h-7 rounded-lg flex items-center justify-center gap-1 transition-all duration-200 active:scale-95"
                >
                  <span>启动演练</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 对话消息展示区 */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
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
                  {/* 身份头 */}
                  <div className="flex items-center gap-1.5 text-[9px] text-text-secondary font-mono">
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

                  {/* 消息气泡 */}
                  <div
                    className={`px-4 py-3 rounded-xl text-xs leading-relaxed ${
                      isUser
                        ? "bg-primary text-black font-semibold rounded-tr-none shadow-[0_0_10px_rgba(29,185,84,0.1)]"
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

                    {/* 工具调用反馈 */}
                    {msg.toolCallInfo && (
                      <SpotlightCard
                        spotlightColor={msg.toolCallInfo.success ? "rgba(29, 185, 84, 0.2)" : "rgba(239, 68, 68, 0.2)"}
                        className={`mt-3 border rounded-xl p-3 space-y-2 select-none relative overflow-hidden ${
                          msg.toolCallInfo.success
                            ? "border-primary/45 shadow-[0_0_12px_rgba(29,185,84,0.15)] text-primary"
                            : "border-error/45 shadow-[0_0_12px_rgba(239,68,68,0.15)] text-error"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold font-mono text-[9px] tracking-wide uppercase">
                          <PlusCircle className={`w-3.5 h-3.5 ${msg.toolCallInfo.success ? "text-primary animate-pulse" : "text-error"}`} />
                          <span>AI Tool Action: {msg.toolCallInfo.action}</span>
                        </div>
                        <p className="text-[10px] leading-relaxed text-text-primary">
                          {msg.toolCallInfo.message}
                        </p>
                      </SpotlightCard>
                    )}

                    {/* 情商反馈卡片 */}
                    {msg.coachFeedback && (
                      <SpotlightCard spotlightColor="rgba(59, 130, 246, 0.15)" className="mt-3 border border-border-subtle rounded-lg p-3 space-y-2.5">
                        <div className="grid grid-cols-3 gap-2 select-none">
                          <div className="bg-surface-3 p-1.5 rounded flex flex-col gap-0.5 border border-border-subtle">
                            <span className="text-[8px] text-text-secondary font-bold flex items-center gap-0.5">
                              <Heart className="w-2.5 h-2.5 text-error" /> 情绪价值
                            </span>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-xs font-bold font-mono text-primary">
                                {msg.coachFeedback.emotionalValue}
                              </span>
                              <span className="text-[8px] text-text-secondary font-mono">/10</span>
                            </div>
                          </div>

                          <div className="bg-surface-3 p-1.5 rounded flex flex-col gap-0.5 border border-border-subtle">
                            <span className="text-[8px] text-text-secondary font-bold flex items-center gap-0.5">
                              <Eye className="w-2.5 h-2.5 text-ai-blue" /> 需求控制
                            </span>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-xs font-bold font-mono text-primary">
                                {msg.coachFeedback.needinessControl}
                              </span>
                              <span className="text-[8px] text-text-secondary font-mono">/10</span>
                            </div>
                          </div>

                          <div className="bg-surface-3 p-1.5 rounded flex flex-col gap-0.5 border border-border-subtle">
                            <span className="text-[8px] text-text-secondary font-bold flex items-center gap-0.5">
                              <Smile className="w-2.5 h-2.5 text-amber-500" /> 幽默风趣
                            </span>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-xs font-bold font-mono text-primary">
                                {msg.coachFeedback.witScore}
                              </span>
                              <span className="text-[8px] text-text-secondary font-mono">/10</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-[10px] text-text-secondary leading-relaxed bg-surface-3 p-2 rounded border border-border-subtle">
                          <span className="font-bold text-text-primary text-[9px] block mb-0.5">
                            🌱 回复分析：
                          </span>
                          {msg.coachFeedback.advice}
                        </div>

                        <button
                          onClick={() =>
                            handleSaveToBrain(
                              `怎么幽默地应对 ${roleplayTarget} 的“关于你对手工作品或画画的提问”？`,
                              `【优秀回复参考】:\n对方提问后，可以这样说：“平时我的双手主要用来和键盘‘打架’，不过看到你这些这么有灵气的画，觉得我的键盘也需要去充充氧气了。”\n\n【高情商技巧】：\n${msg.coachFeedback?.advice || ""}`
                            )
                          }
                          className="w-full py-1.5 bg-surface-2 hover:bg-primary hover:text-black transition-all duration-200 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 active:scale-95"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>存入闪卡</span>
                        </button>
                      </SpotlightCard>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 3 回合实战终结 报告卡片面板 */}
            {isTrainingFinished && overallReport && (
              <div className="w-full max-w-[94%] mx-auto mt-4 mb-6">
                <SpotlightCard
                  spotlightColor="rgba(59, 130, 246, 0.2)"
                  className="border border-ai-blue/40 bg-surface-2/95 rounded-2xl p-5 md:p-6 shadow-2xl relative overflow-hidden space-y-4"
                >
                  <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-ai-blue/10 blur-2xl pointer-events-none" />
                  
                  {/* 标题 */}
                  <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
                    <div className="w-8 h-8 rounded-lg bg-ai-blue/20 flex items-center justify-center text-ai-blue shadow-inner">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs md:text-sm font-bold text-text-primary">高情商社交演练终结诊断报告</h3>
                      <p className="text-[9px] text-text-secondary font-mono uppercase tracking-wider">
                        GrowthOS AI Social Assessment Report
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                    {/* SVG 雷达图 */}
                    <RadarChart
                      eq={overallReport.eq}
                      boundary={overallReport.boundary}
                      wit={overallReport.wit}
                      empathy={overallReport.empathy}
                      fluency={overallReport.fluency}
                    />
                    
                    {/* 诊断文字 */}
                    <div className="space-y-3 text-xs">
                      <div className="bg-surface-3 p-3 rounded-lg border border-border-subtle">
                        <span className="font-bold text-ai-blue block mb-1 text-[9px] tracking-wide uppercase font-mono">
                          🎯 综合诊断 (Assessment Summary)
                        </span>
                        <p className="leading-relaxed text-[11px] text-text-primary">
                          {overallReport.summary}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="bg-surface-3 p-2.5 rounded-lg border border-primary/20">
                          <span className="font-bold text-primary block mb-1 text-[9px] tracking-wide uppercase font-mono">
                            👍 表现亮点 (Strengths)
                          </span>
                          <ul className="list-disc list-inside space-y-1 text-[10px] text-text-secondary">
                            {overallReport.strengths?.map((s: string, idx: number) => (
                              <li key={idx} className="truncate">{s}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div className="bg-surface-3 p-2.5 rounded-lg border border-error/20">
                          <span className="font-bold text-error block mb-1 text-[9px] tracking-wide uppercase font-mono">
                            ⚠️ 提升空间 (Weaknesses)
                          </span>
                          <ul className="list-disc list-inside space-y-1 text-[10px] text-text-secondary">
                            {overallReport.weaknesses?.map((w: string, idx: number) => (
                              <li key={idx} className="truncate">{w}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleResetTraining}
                    className="w-full py-2 bg-primary hover:bg-primary-hover text-black font-bold rounded-xl text-xs tracking-widest uppercase transition-all duration-200 active:scale-95"
                  >
                    开启新一轮社交演练
                  </button>
                </SpotlightCard>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* 底部输入框 */}
          <div className="p-4 border-t border-border-subtle bg-surface-1">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                disabled={isTrainingFinished}
                placeholder={
                  isTrainingFinished
                    ? "本轮社交演练已完成，请在上方查看报告或开启新一轮演练"
                    : isTrainingActive
                    ? `【回合 ${turnCount} / 3】以模拟身份向对方回复...`
                    : "向 AI 成长教练提问或设置人设开启社交陪练..."
                }
                className="flex-1 px-4 py-2.5 bg-surface-1 border border-border-subtle rounded-lg text-xs outline-none focus:border-primary text-text-primary placeholder:text-neutral-gray disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputVal.trim() || isTrainingFinished}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95 ${
                  inputVal.trim() && !isTrainingFinished
                    ? "bg-primary text-black hover:scale-[1.02]"
                    : "bg-surface-3 text-text-secondary cursor-not-allowed"
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* 视图二：Vibe Coding 编程诊断助手视图 */}
      {/* -------------------------------------------------- */}
      {activeSubTab === "vibe" && (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 space-y-6 relative z-10">
          
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            
            {/* 左侧输入分栏 (占2/5) */}
            <div className="lg:col-span-2 space-y-4">
              <SpotlightCard spotlightColor="rgba(59, 130, 246, 0.12)" className="p-4 border border-border-subtle rounded-2xl space-y-4">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold tracking-wider uppercase text-text-secondary">
                  <Terminal className="w-4 h-4 text-ai-blue" />
                  <span>错误故障输入台</span>
                </div>

                {/* 报错信息 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                    报错信息 / 问题描述
                  </label>
                  <textarea
                    rows={4}
                    value={vibeBug}
                    onChange={(e) => setVibeBug(e.target.value)}
                    placeholder="在此贴入控制台红色报错日志，或详细描述您遇到的 Bug..."
                    className="w-full px-3 py-2 bg-surface-3 rounded-xl border border-border-subtle focus:border-ai-blue text-xs text-text-primary outline-none resize-none font-mono placeholder:text-neutral-gray"
                  />
                </div>

                {/* 代码上下文 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                    涉及的源码上下文 (Optional)
                  </label>
                  <textarea
                    rows={8}
                    value={vibeCode}
                    onChange={(e) => setVibeCode(e.target.value)}
                    placeholder="// 贴入可能存在问题的代码块..."
                    className="w-full px-3 py-2 bg-surface-3 rounded-xl border border-border-subtle focus:border-ai-blue text-xs text-text-primary outline-none resize-none font-mono placeholder:text-neutral-gray"
                  />
                </div>

                <button
                  onClick={handleVibeDiagnose}
                  disabled={!vibeBug.trim() || vibeLoading}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-98 ${
                    vibeBug.trim() && !vibeLoading
                      ? "bg-ai-blue hover:bg-blue-600 text-white shadow-[0_0_12px_rgba(59,130,246,0.25)]"
                      : "bg-surface-3 text-text-secondary cursor-not-allowed border border-border-subtle"
                  }`}
                >
                  {vibeLoading ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <DecryptedText text="正在调用 RAG 索引排查..." speed={40} className="font-mono text-white text-[10px]" />
                    </div>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      <span>诊断 Bug 并提供 Diff 方案</span>
                    </>
                  )}
                </button>
              </SpotlightCard>
            </div>

            {/* 右侧诊断方案展示分栏 (占3/5) */}
            <div className="lg:col-span-3">
              {vibeLoading ? (
                <div className="border border-border-subtle rounded-2xl bg-surface-1/40 p-6 h-[400px] flex flex-col items-center justify-center gap-3 animate-pulse">
                  <Terminal className="w-8 h-8 text-ai-blue animate-bounce" />
                  <p className="text-xs text-text-secondary font-mono tracking-widest">
                    正在检索本地第二大脑和 Supabase 向量库...
                  </p>
                </div>
              ) : vibeResult ? (
                <div className="space-y-4">
                  <SpotlightCard spotlightColor="rgba(29, 185, 84, 0.15)" className="p-5 border border-primary/30 rounded-2xl bg-surface-2/60 shadow-xl space-y-4">
                    {/* 头部信息 */}
                    <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center text-primary">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">
                            Diagnostic Success
                          </h3>
                          {vibeResult.matchedNoteTitle && (
                            <span className="text-[9px] text-primary font-mono block">
                              📚 参考知识：{vibeResult.matchedNoteTitle}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={handleSaveVibeToBrain}
                        className="px-3 py-1 bg-surface-3 hover:bg-primary hover:text-black rounded-lg border border-border-subtle text-[10px] font-bold transition-all uppercase tracking-wider flex items-center gap-1 active:scale-95"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>存为记忆卡片</span>
                      </button>
                    </div>

                    {/* 错误分析 */}
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold text-ai-blue uppercase tracking-widest font-mono">
                        🔍 诊断报告 (Root Cause)
                      </h4>
                      <p className="text-xs text-text-primary leading-relaxed bg-surface-3/50 p-3 rounded-xl border border-border-subtle/50">
                        {vibeResult.analysis}
                      </p>
                    </div>

                    {/* Diff 代码块 */}
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest font-mono">
                        🛠️ 修复代码比对 (Git Diff)
                      </h4>
                      <DiffRenderer code={vibeResult.diffCode} />
                    </div>

                    {/* 规避忠告 */}
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest font-mono">
                        💡 调试忠告 (Architecture Advice)
                      </h4>
                      <p className="text-xs text-text-secondary leading-relaxed bg-surface-3/35 p-3 rounded-xl border border-border-subtle/30">
                        {vibeResult.advice}
                      </p>
                    </div>
                  </SpotlightCard>
                </div>
              ) : (
                <div className="border border-border-subtle rounded-2xl bg-surface-1/40 p-6 h-[400px] flex flex-col items-center justify-center gap-2.5 text-center select-none">
                  <Terminal className="w-10 h-10 text-neutral-gray opacity-40" />
                  <h3 className="text-xs font-bold text-text-primary font-mono tracking-widest uppercase">
                    Developer Console Idle
                  </h3>
                  <p className="text-[10px] text-text-secondary max-w-[280px]">
                    输入报错日志或贴入问题源码，AI 编程助手将检索你的“第二大脑”并提供高清晰度 Diff 代码修复方案。
                  </p>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
