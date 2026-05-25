import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { topic, content } = await req.json();

    if (!topic || !content) {
      return NextResponse.json(
        { error: "缺少必要的主题 (topic) 或内容 (content) 参数。" },
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

    // 3. 构造 System Prompt 和 User Prompt
    const systemPrompt = `你是一个严格的费曼学习法（Feynman Technique）判官。
你的任务是评估用户为向“完全不懂该概念的小白（零基础人员）”解释某个概念所撰写的讲述文本。
你需要根据费曼技巧的核心要素评估用户的讲述：是否口语化、是否使用了生动的类比/比喻、是否避免了晦涩的专业术语。

请必须输出标准的 JSON 格式，不要包含任何 markdown 标记（如 \`\`\`json 格式），直接返回 JSON 字符串。JSON 的格式规范如下：
{
  "score": number, // 小白易懂度评分，范围 0-100。
  "grade": "极易理解" | "基本易懂" | "较多术语", // 评分评级：>=85 为"极易理解"，70-84 为"基本易懂"，<70 为"较多术语"。
  "tips": string[] // 包含 2 到 3 条具体的改进建议。请指出哪些词汇或段落对于小白过于晦涩，并提供可替换的具体生活比喻（例如：用“餐馆点菜”来类比“Tool Calling”）。
}`;

    const userPrompt = `解释的目标概念：${topic}

用户的讲述文本：
${content}`;

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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }, // 强制 JSON 模式（如果大模型支持）
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
    console.error("费曼判官 API 报错:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: error.message || "服务器内部错误" },
      { status: 500 }
    );
  }
}
