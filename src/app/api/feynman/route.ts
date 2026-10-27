import { NextResponse } from "next/server";
import { chatJSON } from "@/lib/ai/provider";
import { normalizeFollowUp } from "@/lib/ai/contract";
import { measurePlainSummary } from "@/lib/learning/feynman";

/**
 * 费曼追问（Phase 4）
 *
 * 老实现是「费曼判官」：给一段讲述，返回 0–100 分 + 3 条建议。
 * 分数是**终点**，而学习需要的是**下一步**——你讲漏了哪两点。
 *
 * 所以现在的产物是：
 * - gaps：2 条「你没讲到」的点，用陈述句指出，不替你补
 * - terms：你用了但没解释的术语
 * - score：**可选**，仅作参照。模型不给就是 null，前端不许编一个 85 出来
 *
 * 注意 prompt 里明确要求「不要安慰、不要夸奖」：
 * 夸奖会让用户停在原地，而这一屏唯一的用处是让他回去补那两点。
 */

const SYSTEM_PROMPT = `你是一位费曼学习法的追问者。你的任务**不是评分**，也不是给建议清单，
而是指出他这段讲述里**漏掉了什么**。

规则：
1. gaps：挑 2 条（最多 3）他没有讲到的关键点。每条包含：
   - point：一句话陈述「你漏了什么」。必须是陈述句，针对具体机制或边界条件。
   - why：为什么这一点不可省，一句话。
   禁止写「讲得不错」「还可以更深入」这类空话。
2. terms：从他原文里挑出**用了但没有解释**的术语（0 到 5 个）。
   必要的专有名词（如具体产品名）不要挑，只挑那些「拿它来省略解释」的词。
3. score：可选，0 到 100 的「外人易懂度」，仅作参照。
   **如果你不确定，就省略这个字段**，不要为了让用户高兴给高分。

只输出 JSON，不要任何解释文字：
{"gaps":[{"point":"","why":""}],"terms":[""]}`;

export async function POST(req: Request) {
  let topic = "";
  let content = "";
  let plainSummary = "";

  try {
    const body = (await req.json()) as {
      topic?: string;
      content?: string;
      plainSummary?: string;
    };
    topic = (body.topic ?? "").trim();
    content = (body.content ?? "").trim();
    plainSummary = (body.plainSummary ?? "").trim();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  if (!topic || !content) {
    return NextResponse.json(
      { error: "缺少必要的主题 (topic) 或内容 (content) 参数。" },
      { status: 400 },
    );
  }

  const user = [
    `解释的目标概念：${topic}`,
    "",
    "他的讲述：",
    content,
    plainSummary ? `\n他写的 100 字大白话：\n${plainSummary}` : "",
  ].join("\n");

  const result = await chatJSON({
    system: SYSTEM_PROMPT,
    user,
    temperature: 0.3,
    maxTokens: 700,
  });

  if (!result.ok) {
    // 本地降级：AI 不可用时，术语检测仍然有效——它是纯规则，不需要模型。
    // gaps 刻意留空，而不是编两条假建议：假的「你漏了什么」比没有更糟，
    // 它会让人去补一个根本不存在的洞。
    return NextResponse.json({
      gaps: [],
      terms: measurePlainSummary(content).terms,
      score: null,
      fallback: true,
      reason: result.failure,
    });
  }

  const followUp = normalizeFollowUp(result.data);
  if (!followUp) {
    return NextResponse.json({
      gaps: [],
      terms: measurePlainSummary(content).terms,
      score: null,
      fallback: true,
      reason: "parse",
    });
  }

  return NextResponse.json({ ...followUp, fallback: false });
}
