import { NextResponse } from "next/server";

interface ChatMessage {
  id: string;
  sender: "user" | "bot" | "coach";
  text: string;
}

export async function POST(req: Request) {
  try {
    const { messages, roleplayTarget } = await req.json() as {
      messages: ChatMessage[];
      roleplayTarget: string;
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

你需要同时完成以下两件事，并以标准的 JSON 格式输出（不要带 \`\`\`json 标记）：

1. 扮演该人设角色（【${roleplayTarget}】），写出下一句你对用户上一句话的回复（botReply）。回复需要完全符合该角色的人设背景、性格倾向和说话口吻。
2. 跳出角色扮演，扮演一位资深高情商“AI 社交教练 (AI Coach)”，对用户发送的**最后一条 user 消息**进行专业的诊断和情商复盘（coachFeedback），包含：
   - 情绪价值（emotionalValue，1-10分）：用户是否捕捉了对方的话语情绪并提供了良好的情感反馈。
   - 需求感控制（needinessControl，1-10分）：用户是否暴露了过强的目的性、需求感或卑微舔狗心态。分值越高代表控制得越好（即越得体、没有暴露过多低价值目的）。
   - 幽默风趣（witScore，1-10分）：说话是否有风趣、好玩。
   - 改进建议（advice）：具体分析用户最后一句话的得失，并给出一句更佳的高情商参考话术。

必须返回以下 JSON 格式：
{
  "botReply": string, // 你扮演的角色对用户的下一句聊天回复
  "coachFeedback": {
    "emotionalValue": number, // 情绪价值，1-10 整数
    "needinessControl": number, // 需求感控制，1-10 整数
    "witScore": number, // 幽默风趣，1-10 整数
    "advice": string // 社交教练给出的高情商复盘改进建议与具体提升话术
  }
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
