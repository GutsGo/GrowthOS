import { NextResponse } from "next/server";
import { chatJSON } from "@/lib/ai/provider";
import type { AITaskDraft } from "@/lib/ai/contract";
import { normalizeTaskDrafts } from "@/lib/ai/contract";

interface GenerateTasksPayload {
  energy: number;
  woopWish?: string;
  woopPlan?: string;
  historyStats: {
    habitId: string;
    name: string;
    completedCount: number;
    totalCount: number;
    rate: number;
  }[];
}

export async function POST(req: Request) {
  try {
    const payload = await req.json() as GenerateTasksPayload;
    const { energy, woopWish, woopPlan, historyStats } = payload;

    // 1. 密钥解析与调用统一走 @/lib/ai/provider。
    //    这里原来自己读 env、自己 fetch：没有超时、没有 json 模式失败重试。
    //    表现是「新接口能通、这个永远降级」，而日志里只写一句「调用失败」。
    // 2. 本地智能降级生成器 (高度自适应)
    const fallbackGenerate = () => {
      const tasks = [];
      const lowestRateHabit = historyStats.length > 0 
        ? [...historyStats].sort((a, b) => a.rate - b.rate)[0] 
        : null;

      if (energy >= 7) {
        // 高能量：安排有挑战性的任务
        tasks.push({
          id: `task-fit-${Math.random().toString(36).substring(7)}`,
          name: "高能突破：挑战一次进阶训练/难关突破",
          reason: `当前你处于高电量状态（${energy}/10），且今日意图为“${woopWish || "全面自驱"}”，适合啃硬骨头。特此排程一次高耗能深度攻坚动作。`,
          energyDemand: "high" as const,
        });

        if (lowestRateHabit && lowestRateHabit.rate < 0.5) {
          tasks.push({
            id: `task-remedy-${Math.random().toString(36).substring(7)}`,
            name: `习惯拯救：攻坚“${lowestRateHabit.name}”`,
            reason: `分析历史记录发现你最近在“${lowestRateHabit.name}”习惯上的打卡率仅有 ${Math.round(lowestRateHabit.rate * 100)}%，今天趁着能量充足，必须安排半小时专项突击。`,
            energyDemand: "high" as const,
          });
        } else {
          tasks.push({
            id: `task-feynman-${Math.random().toString(36).substring(7)}`,
            name: "深度沉淀：完成一次卡片重构或费曼关系复盘",
            reason: "当前脑力充沛，适合整理第二大脑卡片之间的双向链接拓扑，并对昨日盲区进行深入的概念阐述。",
            energyDemand: "medium" as const,
          });
        }
      } else if (energy <= 4) {
        // 低能量：保底与减负，守护连击
        tasks.push({
          id: `task-protect-${Math.random().toString(36).substring(7)}`,
          name: "原子保底：今日习惯目标全部降级减半",
          reason: `考虑到你今日能量值为 ${energy}/10 的低电量，AI 教练已自动触发“防崩保护机制”。无需强求大负荷，只要执行原目标的 50% 即可完成今日连击。`,
          energyDemand: "low" as const,
        });

        tasks.push({
          id: `task-energy-${Math.random().toString(36).substring(7)}`,
          name: "能量蓄水：做 5-10 分钟深度呼吸/自重拉伸",
          reason: "低能量状态下过度内耗有害无益，通过简单的拉伸动作让血液循环，为明天的大脑积蓄底层多巴胺。",
          energyDemand: "low" as const,
        });
      } else {
        // 中能量：循序渐进
        tasks.push({
          id: `task-medium-${Math.random().toString(36).substring(7)}`,
          name: "稳健平衡：按既定 If-Then 应对潜在障碍",
          reason: `你今日能量为 ${energy}/10。你的 WOOP 应对方案是：“${woopPlan || "遇阻随机调整"}”。请在遇到惰性干扰时，严格执行该预案。`,
          energyDemand: "medium" as const,
        });

        if (lowestRateHabit && lowestRateHabit.rate < 0.7) {
          tasks.push({
            id: `task-boost-${Math.random().toString(36).substring(7)}`,
            name: `微习惯修复：对“${lowestRateHabit.name}”做10分钟低门槛重启`,
            reason: `该习惯近期打卡率偏低（${Math.round(lowestRateHabit.rate * 100)}%）。不需要做完整版，通过10分钟极简热身，重建神经元联结。`,
            energyDemand: "low" as const,
          });
        } else {
          tasks.push({
            id: `task-standard-${Math.random().toString(36).substring(7)}`,
            name: "专注心流：完成 1 次 10 分钟心流空间深度编码",
            reason: "中等能量下，不要做多任务切换，在心流舱中屏蔽干扰，进行1次极速专注即可完美打卡。",
            energyDemand: "medium" as const,
          });
        }
      }
      return tasks;
    };

    // 没配 Key 时不必先判断再请求：chatJSON 会直接返回 failure: "no_key"，
    // 走下面同一个降级分支。少一条路径就少一处「两边判断不一致」的可能。

    // 3. 构建大模型 Prompt
    const uncompletedStats = historyStats.filter((h) => h.rate < 0.6);
    const uncompletedReport = uncompletedStats
      .map((h) => `- ${h.name} 最近 7 天打卡率: ${Math.round(h.rate * 100)}%`)
      .join("\n");

    const systemPrompt = `你是一个说话犀利、擅长行为心理学的 AI 个人成长教练与行动排程器。
现在根据用户的今日能量与习惯执行历史，为其编排今日的个性化行动任务清单（包含 2-3 个任务）。
用户数据如下：
- 今日能量值：${energy}/10
- 今日 WOOP 愿望 (Wish): ${woopWish || "无"}
- 今日 If-Then 应对计划 (Plan): ${woopPlan || "无"}
- 过去 7 天习惯表现：
${historyStats.length > 0 ? historyStats.map((h) => `- ${h.name} 打卡率: ${Math.round(h.rate * 100)}%`).join("\n") : "- 暂无历史习惯打卡记录"}
${uncompletedReport ? `- 需要重点攻坚（打卡率低于 60%）：\n${uncompletedReport}` : ""}

排程排班指导规则：
1. **能量匹配**：今日能量极低 (<=4) 时，必须触发“习惯降级保护”，只保留 1-2 项低能量的保底任务（如拉伸、写一行代码），不要强推高负荷。今日能量极高 (>=7) 时，若发现有最近完成率低的重要习惯，必须严厉指正并为其排程一次“破局攻坚”任务。
2. **结合 WOOP**：将今日排程与他的 If-Then 应对计划进行结合，让任务具体有行为科学支点。
3. **输出格式**：你必须返回合法的 JSON 对象，不要含有任何 markdown 格式块或多余字符。格式为：
{
  "tasks": [
    {
      "id": "任务唯一随机ID",
      "name": "任务精简名称 (不超过25字)",
      "reason": "AI 教练给出此项排程的底层心理学/历史数据依据",
      "energyDemand": "high" | "medium" | "low"
    }
  ]
}`;

    // 4. 发送 API 请求
    const result = await chatJSON({
      system: systemPrompt,
      user: "按上面的 JSON 格式输出今天的任务清单。",
      temperature: 0.3,
    });

    if (!result.ok) {
      return NextResponse.json({ tasks: fallbackGenerate(), isFallback: true });
    }

    const tasks: AITaskDraft[] = normalizeTaskDrafts(result.data);
    if (tasks.length === 0) {
      // 模型返回了合法 JSON 但一个任务都没给，等同于失败
      return NextResponse.json({ tasks: fallbackGenerate(), isFallback: true });
    }

    return NextResponse.json({ tasks, isFallback: false });
  } catch (error) {
    console.error("AI 每日行动排程 API 异常:", error);
    return NextResponse.json({
      tasks: [
        {
          id: `task-err-1`,
          name: "破壁连击：进行 10 分钟深度专注输出",
          reason: "检测到 API 请求繁忙，AI 本地教练为您排程心流专注，以极简热身阻断今日的拖延可能。",
          energyDemand: "medium",
        },
        {
          id: `task-err-2`,
          name: "脑力卸载：提炼 1-2 张核心记忆卡片",
          reason: "低认知阻力练习。通过整理今天学过的一个技术概念并填入背面，让大脑获得掌控感。",
          energyDemand: "low",
        }
      ],
      isFallback: true,
    });
  }
}
