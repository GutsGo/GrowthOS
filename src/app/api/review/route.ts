import { NextResponse } from "next/server";
import { chatJSON } from "@/lib/ai/provider";

/**
 * 特化打卡的表单数据。
 *
 * 两种形状（健身 / 社交）共用同一个字段，所以全部可选举。
 * 改成具体形状而不是 `any`：这个值会被拼进 prompt，
 * 字段名写错（比如 `moods`）原本会静默取到 undefined，
 * 于是 AI 收到一句「状态：undefined」还照样输出问题。
 */
interface HabitCustomData {
  /** 健身：训练组 */
  sets?: { setNum?: number; weight?: number; reps?: number }[];
  /** 健身：精神状态 */
  mood?: string;
  /** 健身：训练简记 */
  notes?: string;
  /** 社交：交往对象 */
  contact?: string;
  /** 社交：探讨主题 */
  topic?: string;
  /** 社交：沟通反思 */
  reflect?: string;
  /** 社交：后续跟进 */
  followUp?: string;
}

interface HabitItem {
  name: string;
  logged: boolean;
  customData?: HabitCustomData;
  customFormType?: "none" | "fitness" | "social";
}

/** 「已打卡且带特化数据」的习惯。用类型谓词把收窄交给 filter，省掉一堆 if (!x) return。 */
type LoggedHabit = HabitItem & { customData: HabitCustomData };

function hasCustomData(h: HabitItem): h is LoggedHabit {
  return h.logged && Boolean(h.customData);
}

interface AITaskItem {
  id: string;
  name: string;
  reason: string;
  energyDemand: "high" | "medium" | "low";
  isCompleted: boolean;
  completedAt?: string;
}

interface ReviewPayload {
  date: string;
  woop?: {
    wish: string;
    outcome: string;
    obstacle: string;
    plan: string;
  };
  energy: number;
  habits: HabitItem[];
  cardsCount: number;
  aiTasks?: AITaskItem[];
}

export async function POST(req: Request) {
  try {
    const payload = await req.json() as ReviewPayload;
    const { date, woop, energy, habits, cardsCount, aiTasks = [] } = payload;

    // 1. 密钥解析交给统一入口。
    //    这里原来自己读 env 拼 provider，与 /api/exam 那三个新路由是两套逻辑：
    //    没有 25s 超时、没有 json 模式失败重试、日志格式也不一样。
    //    结果是「新功能配好了，老功能永远降级」，而日志里看不出来。
    // 2. 本地降级生成器 (融入健身、社交与 AI 任务，自适应高精准拷问)
    const fallbackGenerate = () => {
      const total = habits.length;
      const completed = habits.filter((h) => h.logged).length;
      const rate = total > 0 ? completed / total : 1;
      const wishStr = woop?.wish || "设定今日目标";
      const obstacleStr = woop?.obstacle || "预设阻碍";

      // 提取特化数据
      const fitness = habits.find(
        (h): h is LoggedHabit => h.customFormType === "fitness" && hasCustomData(h),
      );
      const social = habits.find((h) => h.customFormType === "social" && h.logged && h.customData);
      
      // 提取 AI 任务数据
      const totalTasks = aiTasks.length;
      const completedTasks = aiTasks.filter((t) => t.isCompleted).length;
      const uncompletedTasks = aiTasks.filter((t) => !t.isCompleted);

      const questions: string[] = [];

      // 问答一：基于打卡率和能量值的拷问
      if (rate === 1) {
        questions.push(
          `今日达成 100% 习惯打卡，能量值为 ${energy}/10。在一切顺风的时刻，你是否意识到这种生理充沛非常短暂？在未来某天能量跌到 3 分时，你将采取什么微习惯防御预案来保住这股势头？`
        );
      } else {
        const uncompletedNames = habits.filter((h) => !h.logged).map((h) => h.name).join("、");
        questions.push(
          `今天习惯打卡率仅有 ${completed}/${total}，漏掉了【${uncompletedNames}】。今日能量滑块分值是 ${energy}/10，你是在内心深处对这些习惯产生了畏难，还是真的因为物理时间分配出了差错？`
        );
      }

      // 问答二：针对健身或社交特化行为的反思
      const fitnessSets = fitness?.customData.sets ?? [];
      if (fitness && fitnessSets.length > 0) {
        const data = fitness.customData;
        const totalWeight = fitnessSets.reduce(
          (acc: number, s) => acc + (s.weight || 0) * (s.reps || 0),
          0,
        );
        const moodText = data.mood === "great" ? "精力充沛" : data.mood === "tired" ? "略显疲惫" : "状态平稳";
        questions.push(
          `你在【${fitness.name}】打卡中挑战了 ${fitnessSets.length} 组训练，总能耗折合 ${totalWeight}kg 搬运量（状态：${moodText}）。请诚实自省：在追求训练重量的同时，你的动作规范度是否在缩水？今日笔记【${data.notes || "无"}】有没有避重就轻？`
        );
      } else if (social && social.customData) {
        const data = social.customData;
        questions.push(
          `今天你和【${data.contact || "某人"}】进行了以【${data.topic || "无"}】为核心的深入交往，并在记录中反思【${data.reflect || "无"}】。你觉得你的这处自我诊断是否真正戳中了博弈要害？你订下的跟进待办【${data.followUp || "无"}】究竟是缓解焦虑的空头支票还是真实在执行的动作？`
        );
      } else {
        questions.push(
          `今天你立下的愿望是“${wishStr}”，预判障碍为“${obstacleStr}”。现在复盘来看，是那个预想的障碍真的不可战胜，还是你的 If-Then 计划在惰性面前完全成了一纸空文？`
        );
      }

      // 问答三：针对 AI 排程任务完成度的博弈发问
      if (totalTasks > 0) {
        if (completedTasks === totalTasks) {
          questions.push(
            `今天 AI 针对你的历史表现与能量排程的 ${totalTasks} 个任务已被你全部剿灭！虽然表现无可挑剔，但明天你敢把挑战的主动权掌握在自己手里，把任务推荐的能耗门槛再次推高 15% 吗？`
          );
        } else {
          const uncompletedTaskNames = uncompletedTasks.map((t) => t.name).join("、");
          questions.push(
            `AI 针对你今日能量精算出的 ${totalTasks} 个排程任务，你漏掉了【${uncompletedTaskNames}】。这几项任务是被你的拖延所扼杀，还是你今天对精力的自我滑块评分为虚报数据？`
          );
        }
      } else {
        questions.push(
          `面对未尽的自我成长，你今晚准备对自己的睡眠、手机等娱乐设施实施怎样的物理断开限制，以阻断习惯连击的破裂颓势？`
        );
      }

      return questions;
    };

    // 没配 Key 时不必先判断再请求：chatJSON 会直接返回 failure: "no_key"，
    // 走下面同一个降级分支。少一条路径就少一处「两边判断不一致」的可能。

    // 3. 构造 System Prompt
    const totalHabits = habits.length;
    const completedHabits = habits.filter((h) => h.logged).length;
    const uncompletedHabits = habits.filter((h) => !h.logged).map((h) => h.name);
    
    // 提炼特化习惯数据及 AI 任务数据用于 LLM 诊断
    const fitnessLogs = habits
      .filter((h): h is LoggedHabit => h.customFormType === "fitness" && hasCustomData(h))
      .map((h) => {
        const fd = h.customData;
        const setsText =
        fd.sets
          ?.map((s) => `第${s.setNum}组:${s.weight}kg x ${s.reps}次`)
          .join("; ") || "无组数";
        return `习惯名:${h.name}, 训练组:${setsText}, 精神状态:${fd.mood}, 训练简记:${fd.notes || "无"}`;
      });

    const socialLogs = habits
      .filter((h): h is LoggedHabit => h.customFormType === "social" && hasCustomData(h))
      .map((h) => {
        const sd = h.customData;
        return `习惯名:${h.name}, 交往对象:${sd.contact ?? "无"}, 探讨核心:${sd.topic ?? "无"}, 沟通博弈反思:${sd.reflect ?? "无"}, 后续待办跟进:${sd.followUp ?? "无"}`;
      })
      .filter((line) => line.length > 0);

    const totalTasks = aiTasks.length;
    const completedTasks = aiTasks.filter((t) => t.isCompleted).length;
    const uncompletedTaskNames = aiTasks.filter((t) => !t.isCompleted).map((t) => t.name);

    const systemPrompt = `你是一个说话犀利、直击灵魂、绝不妥协的 AI 个人成长复盘教练。
今天用户的具体执行数据如下：
- 日期：${date}
- 今日能量值：${energy}/10
- 习惯总数：${totalHabits} 个
- 已完成习惯数：${completedHabits}/${totalHabits}
${uncompletedHabits.length > 0 ? `- 今日未完成的习惯：${uncompletedHabits.join("、")}` : "- 今日完美达成所有习惯"}
- 今日卡片复习数量：${cardsCount} 张
- 今日 WOOP 意图：
  * 愿望 (Wish): ${woop?.wish || "无"}
  * 预期最佳结果 (Outcome): ${woop?.outcome || "无"}
  * 预见的主要障碍 (Obstacle): ${woop?.obstacle || "无"}
  * If-Then 应对计划 (Plan): ${woop?.plan || "无"}

【特化打卡记录详情】：
- 力量训练记录：
  ${fitnessLogs.length > 0 ? fitnessLogs.join("\n  ") : "无力量打卡详情"}
- 社交复盘记录：
  ${socialLogs.length > 0 ? socialLogs.join("\n  ") : "无社交交往打卡详情"}

【今日 AI 排程任务完成度】：
- 总排程任务：${totalTasks} 个
- 已完成任务数：${completedTasks}/${totalTasks}
${uncompletedTaskNames.length > 0 ? `- 未完成排程任务：${uncompletedTaskNames.join("、")}` : "- 完美完成今日所有排程任务"}

请根据以上数据，生成 3 个犀利、深刻、直指问题核心的反思问题。
你的提问规则：
1. 深入挖掘具体的特化记录（例如提到具体的杠铃组数重量，或者社交交往的对象名和反思主题，以及漏掉的排程任务名字）。不允许给出宽泛、万能的模板式提问。
2. 问题不要流于表面，也不要流于赞美。即便是 100% 完成，也要引导他思考习惯的虚无应付打卡、长期维持或者挑战强度的停滞；如果打卡率很低，要重点质疑他的 If-Then 计划为什么没生效，是否找了借口。
3. 结合今日能量，直面他的意志力和阻力。在能量高（例如>=7）时却没做核心排程任务，必须给予警醒。
4. 必须输出标准的 JSON，格式为: { "questions": [string, string, string] }。不要有任何其他字符。`;

    // 4. 发送 API 请求
    const result = await chatJSON({
      system: systemPrompt,
      user: "按上面的格式输出今天的 3 个复盘问题。",
      temperature: 0.3,
    });

    if (!result.ok) {
      return NextResponse.json({ questions: fallbackGenerate(), isFallback: true });
    }

    return NextResponse.json({
      questions: pickQuestions(result.data, fallbackGenerate),
      isFallback: false,
    });
  } catch (error: unknown) {
    console.error("AI 晚间复盘 API 报错:", error);
    return NextResponse.json({
      questions: [
        "你今天在哪个关键时间点纵容了自己的拖延？",
        "回看今天的执行结果，你觉得自己是做到了极致，还是止步于“差不多就行”？",
        "为了保证明天的自律，你今晚准备对自己的睡眠和手机使用做怎样的物理限制？",
      ],
      isFallback: true,
    });
  }
}

/**
 * 从模型返回里挑出 3 个问题。
 *
 * 不够 3 个就整体退回本地问题，不做「有几个用几个」——
 * 用户看到 2 个问题会以为「今天只值得问两个」，而这恰恰是复盘最需要 3 个的时候。
 */
function pickQuestions(data: unknown, fallback: () => string[]): string[] {
  if (!data || typeof data !== "object") return fallback();
  const raw = (data as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) return fallback();

  const questions = raw
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  return questions.length >= 3 ? questions.slice(0, 3) : fallback();
}
