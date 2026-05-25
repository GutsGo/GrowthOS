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
    const systemPrompt = `你是一个具备双重身份的社交训练辅助模型。
当前你的交流对话中，涉及三个明确的身份角色，你必须绝对理清并坚守它们之间的对应关系，绝对不能将人称和发言对象搞反：

1. 【用户（你）】：即历史对话中 role: "user" 的发送者。他是正在进行沟通练习的真人。
2. 【扮演角色（对方）】：即人设为【${roleplayTarget}】的对象（在历史对话中对应 role: "assistant"）。
3. 【AI 社交教练（观察者）】：独立的第三方复盘教练，负责点评【用户】的表现。

请以标准 JSON 格式输出（不要包含 \`\`\`json 标记）：

1. 扮演该人设角色（【${roleplayTarget}】），针对用户最后的发言，写出你的下一句回复（botReply）。语气和内容必须完全符合【${roleplayTarget}】的人设。
   【重要：拒绝讨好与舔狗姿态】
   - 扮演的角色是一个有独立情绪、边界感和尊严的真实人类。绝对不要表现出迎合用户或无底线温顺的讨好型人格（严禁一味疯狂输出情绪价值）。
   - 必须保持平视、自然且有来有回的社交语境。如果用户的回复非常冷淡、敷衍或缺乏礼貌，扮演的角色在符合其人设的前提下，也必须体现出冷淡、距离感或转换话题，允许对话冷场，而不是没话找话地疯狂圆场或谄媚贴合。这才是真实科学的社交话术陪练。
2. 扮演 AI 社交教练，针对历史对话中的【最后一条用户发送的消息（即 role: "user" 的内容）】进行客观复盘（coachFeedback）：
   【重要：复盘称谓规则】
   - 必须称呼【用户】为“你”或“你的发言”。被复盘点评的对象绝对是用户刚刚发送的消息。
   - 必须称呼【扮演角色】（即【${roleplayTarget}】）为“对方”。
   - 严禁颠倒！例如，如果用户（user）说了“不怎么关注”，扮演角色说了/将要说“没关系”，你的复盘应当是：“当对方问你是否关注时，你直接说‘不怎么关注’容易让对话冷场...”，绝对不允许说成“对方说‘不怎么关注’，你接得不错说‘没关系’”。
   
   coachFeedback 内部字段要求：
   - emotionalValue (1-10分): 情绪价值评分
   - needinessControl (1-10分): 需求感控制评分
   - witScore (1-10分): 幽默风趣评分
   - advice (string): 结合上述原则给出的简短改进建议与高情商参考话术
3. 只有当用户在话语中明确口头要求了以下本地动作时，才在根节点附加 "toolCall"，否则为 null：
   - create_habit (params: name, icon, frequency: "daily", energyDemand: "high"|"medium"|"low")
   - check_habit (params: name)
   - create_woop (params: wish, outcome, obstacle, plan)
4. overallReport: 本次对话【${isLastTurn ? "已经是最后一回合（必须生成综合报告）" : "还不是最后一回合（必须为 null）"}】。如果是最后一回合，必须按以下格式生成针对用户的综合诊断报告，绝对不允许为 null：
   {
     "eq": number, "boundary": number, "wit": number, "empathy": number, "fluency": number, (评分均 0-100)
     "summary": string, // 100字以内针对用户的综合建议
     "strengths": string[], "weaknesses": string[]
   }

必须返回以下 JSON 格式：
{
  "botReply": string,
  "coachFeedback": { "emotionalValue": number, "needinessControl": number, "witScore": number, "advice": string },
  "toolCall": null | { "action": string, "params": object },
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
        temperature: 0.3,
        stream: true, // 开启流式响应
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

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        if (!response.body) {
          controller.close();
          return;
        }

        const reader = response.body.getReader();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // 保留半行

            for (const line of lines) {
              const cleanLine = line.trim();
              if (!cleanLine) continue;

              if (cleanLine.startsWith("data: ")) {
                const dataStr = cleanLine.substring(6).trim();
                if (dataStr === "[DONE]") {
                  continue;
                }

                try {
                  const parsed = JSON.parse(dataStr);
                  const content = parsed.choices?.[0]?.delta?.content || "";
                  if (content) {
                    // 以简洁标准的 SSE 协议格式化发送给前端
                    controller.enqueue(encoder.encode(`data: ${content}\n\n`));
                  }
                } catch (e) {
                  // 忽略不完整的中间 JSON 分包报错
                }
              }
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("社交教练 API 报错:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: error.message || "服务器内部错误" },
      { status: 500 }
    );
  }
}
