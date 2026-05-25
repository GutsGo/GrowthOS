import { NextResponse } from "next/server";

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

    // 1. 获取 API 密钥配置
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const deepseekBase = process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com/v1";
    const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";

    const openaiKey = process.env.OPENAI_API_KEY;
    const openaiBase = process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1";
    const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

    let apiKey = "";
    let apiBase = "";
    let model = "";

    if (deepseekKey) {
      apiKey = deepseekKey;
      apiBase = deepseekBase;
      model = deepseekModel;
    } else if (openaiKey) {
      apiKey = openaiKey;
      apiBase = openaiBase;
      model = openaiModel;
    }

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

    if (!apiKey) {
      return NextResponse.json({
        tasks: fallbackGenerate(),
        isFallback: true,
      });
    }

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
    const url = `${apiBase.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.75,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn("AI 行动排程接口调用失败，启动本地降级...");
      return NextResponse.json({ tasks: fallbackGenerate(), isFallback: true });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ tasks: fallbackGenerate(), isFallback: true });
    }

    try {
      const result = JSON.parse(content.trim()) as { tasks: any[] };
      // 校验并补充 id 属性
      const formattedTasks = (result.tasks || []).map((t: any) => ({
        id: t.id || `task-${Math.random().toString(36).substring(7)}`,
        name: t.name || "AI 规划任务",
        reason: t.reason || "AI 教练的排程推荐",
        energyDemand: ["high", "medium", "low"].includes(t.energyDemand) ? t.energyDemand : "medium",
      }));
      return NextResponse.json({ tasks: formattedTasks, isFallback: false });
    } catch (err) {
      console.warn("AI 每日行动排程解析 JSON 失败，启用本地降级。内容为:", content);
      return NextResponse.json({ tasks: fallbackGenerate(), isFallback: true });
    }
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
