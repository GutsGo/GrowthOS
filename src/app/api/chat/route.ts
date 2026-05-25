import { NextResponse } from "next/server";

interface ChatMessage {
  id: string;
  sender: "user" | "bot" | "coach";
  text: string;
}

export async function POST(req: Request) {
  try {
    const { messages, roleplayTarget, isLastTurn } = await req.json() as {
      messages: ChatMessage[];
      roleplayTarget: string;
      isLastTurn?: boolean;
    };

    if (!messages || !roleplayTarget) {
      return NextResponse.json(
        { error: "缺少必要的 messages 历史记录或 roleplayTarget 对话对象人设。" },
        { status: 400 }
      );
    }

    // 1. 获取 AI 环境变量配置
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

    // 2. 如果未配置 API Key，返回友好提示让前端回退
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "NO_API_KEY",
          message: "未检测到 API 密钥，请在根目录下的 .env.local 文件中配置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY。",
        },
        { status: 200 }
      );
    }

    // 3. 过滤并转换对话历史
    // 只保留 user 和 bot (即人设角色) 之间的直接对话，忽略 coach 的技术插话
    const filteredHistory = messages
      .filter((msg) => msg.sender === "user" || msg.sender === "bot")
      .map((msg) => ({
        role: msg.sender === "user" ? ("user" as const) : ("assistant" as const),
        content: msg.text,
      }));

    // 4. 构造 System Prompt
    const systemPrompt = `你是一个具备双重身份的社交辅助大模型。
当前用户的对话沟通对象人设为：【${roleplayTarget}】。

你需要同时完成以下工作，并以标准的 JSON 格式输出（不要带 \`\`\`json 标记）：

1. 扮演该人设角色（【${roleplayTarget}】），写出下一句你对用户上一句话的回复（botReply）。回复需要完全符合该角色的人设背景、性格倾向和说话口吻。
2. 跳出角色扮演，扮演一位资深高情商“AI 社交教练 (AI Coach)”，对用户发送的**最后一条 user 消息**进行专业的诊断和情商复盘（coachFeedback），包含：
   - 情绪价值（emotionalValue，1-10分）：用户是否捕捉了对方的话语情绪并提供了良好的情感反馈。
   - 需求感控制（needinessControl，1-10分）：用户是否暴露了过强的目的性、需求感或卑微舔狗心态。分值越高代表控制得越好（即越得体、没有暴露过多低价值目的）。
   - 幽默风趣（witScore，1-10分）：说话是否有风趣、好玩。
   - 改进建议（advice）：具体分析用户最后一句话的得失，并给出一句更佳的高情商参考话术。
3. 【关键新增：本地工具调用指令】如果用户在话语中明确口头要求了任何以下本地动作，请在 JSON 根节点中附加可选的 "toolCall" 字段：
   - 创建原子习惯（例如说：“帮我建个背单词的习惯，阻力设为高”或“创建一个读书的习惯”）
   - 执行某习惯打卡（例如说：“帮我打卡跑步”或“我今天看书了，签个到”）
   - 设定今日意图（例如说：“帮我设定今日愿望是敲代码，结果是做出新功能，阻碍是打瞌睡，如果打瞌睡就喝咖啡”）

"toolCall" 的 JSON 规范定义为：
{
  "action": "create_habit" | "check_habit" | "create_woop",
  "params": {
    // 只有当 action 是 "create_habit" 时：
    "name": string, // 习惯名，如 "背单词"
    "icon": "Code" | "MessageSquare" | "Activity" | "User" | "Target", // 根据习惯特性自动分配合适图标，默认 "Target"
    "frequency": "daily",
    "energyDemand": "high" | "medium" | "low", // 阻力，默认 "medium"
    
    // 只有当 action 是 "check_habit" 时：
    "name": string, // 用于模糊匹配本地已存在的习惯名称，如 "背单词"

    // 只有当 action 是 "create_woop" 时：
    "wish": string, // 今日愿望
    "outcome": string, // 最佳结果
    "obstacle": string, // 潜在障碍
    "plan": string // If-Then plan
  }
}
如果用户没有明确表达上述三类习惯、打卡、WOOP 意图的增删改需求，根节点千万不要包含 "toolCall" 属性或将其设为 null。

4. 【最终演练综合报告 (overallReport)】：
   - 如果当前是最后一回合 (${isLastTurn ? "是最后一回合" : "不是最后一回合"})，你必须生成一份多维度的“社交演练综合诊断报告”（评分 0-100 分），此字段绝不能为 null。
   - 如果当前不是最后一回合，则 "overallReport" 必须为 null。
   "overallReport" 结构规范如下：
   {
     "eq": number, // 情绪同理心与情商得分 (0-100)
     "boundary": number, // 个人边界感与姿态控制得分 (0-100)
     "wit": number, // 幽默风趣与机智度得分 (0-100)
     "empathy": number, // 倾听捕捉对方感受的得分 (0-100)
     "fluency": number, // 话题衔接与语言流畅度得分 (0-100)
     "summary": string, // 一句深度、犀利的综合评价和后续沟通成长建议 (150字以内)
     "strengths": string[], // 在这 3 回合对话中表现出的至少 1 个亮点
     "weaknesses": string[] // 在这 3 回合对话中表现出的至少 1 个沟通短板
   }

必须返回以下 JSON 格式：
{
  "botReply": string,
  "coachFeedback": {
    "emotionalValue": number,
    "needinessControl": number,
    "witScore": number,
    "advice": string
  },
  "toolCall": null | {
    "action": string,
    "params": object
  },
  "overallReport": null | object
}`;

    // 5. 发送 API 请求
    const url = `${apiBase.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          ...filteredHistory,
        ],
        temperature: 0.8,
        response_format: { type: "json_object" }, // 强制 JSON 模式
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI 接口请求失败:", errorText);
      return NextResponse.json(
        { error: "AI_REQUEST_FAILED", message: `AI 接口响应错误: ${response.status}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      throw new Error("API 未返回有效内容。");
    }

    // 解析 JSON 响应
    try {
      const result = JSON.parse(assistantMessage.trim());
      return NextResponse.json(result);
    } catch (parseError) {
      console.error("解析大模型 JSON 输出失败:", assistantMessage);
      // 提取 JSON 的后备尝试
      const match = assistantMessage.match(/\{[\s\S]*\}/);
      if (match) {
        const result = JSON.parse(match[0]);
        return NextResponse.json(result);
      }
      throw parseError;
    }
  } catch (error: any) {
    console.error("社交教练 API 报错:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: error.message || "服务器内部错误" },
      { status: 500 }
    );
  }
}
