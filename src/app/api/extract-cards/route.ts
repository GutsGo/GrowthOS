import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text } = await req.json() as { text: string };

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "缺少必要的文本内容。" },
        { status: 400 }
      );
    }

    // 1. 获取环境变量配置
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

    // 2. 本地降级生成器（用于无 Key 或请求失败）
    const fallbackGenerate = (rawText: string) => {
      // 简单剥离 HTML 标签
      const cleanText = rawText.replace(/<\/?[^>]+(>|$)/g, "").trim();
      if (!cleanText) {
        return [
          {
            front: "什么是第二大脑中的核心卡片？",
            back: "第二大脑（Zettelkasten）是用于捕捉、关联和复习高价值知识的卡片盒笔记系统。",
            tags: ["本地降级", "学习科学"],
          },
        ];
      }

      // 按标点切分句子
      const sentences = cleanText
        .split(/[。；！？\n;!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 5);

      const cards = [];
      const limit = Math.min(sentences.length, 3);

      if (limit > 0) {
        for (let i = 0; i < limit; i++) {
          const sentence = sentences[i];
          cards.push({
            front: `根据上下文，如何理解“${sentence.substring(0, 20)}${sentence.length > 20 ? "..." : ""}”的核心含义？`,
            back: sentence,
            tags: ["本地降级", "AI提取"],
          });
        }
      } else {
        cards.push({
          front: `关于“${cleanText.substring(0, 25)}${cleanText.length > 25 ? "..." : ""}”这一概念，它的具体解释是什么？`,
          back: cleanText,
          tags: ["本地降级", "AI提取"],
        });
      }
      return cards;
    };

    // 如果未配置 API Key，直接执行优雅的本地降级生成
    if (!apiKey) {
      const fallbackCards = fallbackGenerate(text);
      return NextResponse.json({ cards: fallbackCards, isFallback: true });
    }

    // 3. 构造 System Prompt
    const systemPrompt = `你是一个专业的学术/技术闪卡（Flashcards）提取专家，精通间隔重复学习科学。
请阅读用户提供的段落文本，从中提取出 1 到 3 张高价值、针对核心概念或事实的问答闪卡。

必须遵循以下要求：
1. 每张闪卡包含三个字段：
   - front (正面): 提出的问题。必须简短、指向性明确、针对特定事实或原理解析。
   - back (背面): 答案。必须清晰、使用 Markdown 排版，保留关键细节和深度。
   - tags (标签): 一个分类标签数组（例如：["AI", "深度工作"]）。
2. 只提取高含金量的、值得未来长期复习的知识点。
3. 必须输出符合以下 JSON Schema 的标准 JSON，严禁夹带其他任何 markdown 代码块或解释字符：
{
  "cards": [
    {
      "front": string,
      "back": string,
      "tags": string[]
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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn("AI 提取闪卡请求失败，启用本地降级...");
      return NextResponse.json({ cards: fallbackGenerate(text), isFallback: true });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ cards: fallbackGenerate(text), isFallback: true });
    }

    try {
      const result = JSON.parse(content.trim()) as { cards: any[] };
      return NextResponse.json({ cards: result.cards || [], isFallback: false });
    } catch (parseError) {
      console.warn("大模型返回非合法 JSON，启用本地降级。内容为:", content);
      return NextResponse.json({ cards: fallbackGenerate(text), isFallback: true });
    }
  } catch (error: any) {
    console.error("AI 提取闪卡 API 报错:", error);
    // 服务器内部错误也采用降级返回，确保用户交互永远不会报错中断
    try {
      const { text } = await req.clone().json() as { text: string };
      // 简单剥离 HTML
      const cleanText = text ? text.replace(/<\/?[^>]+(>|$)/g, "") : "";
      return NextResponse.json({
        cards: [
          {
            front: `如何深入理解以下段落的核心思想？`,
            back: cleanText || "提取失败",
            tags: ["本地降级", "系统异常"],
          },
        ],
        isFallback: true,
      });
    } catch {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: error.message || "服务器内部错误" },
        { status: 500 }
      );
    }
  }
}
