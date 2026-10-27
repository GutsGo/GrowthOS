import { NextResponse } from "next/server";
import { chatJSON } from "@/lib/ai/provider";
import { normalizeExamReply } from "@/lib/ai/contract";
import {
  EXAM_MAX_ROUNDS,
  buildFallbackQuestion,
  type ExamTurn,
} from "@/lib/learning/exam";
import { stripHtml } from "@/lib/learning/recall";

/**
 * 考官模式（Phase 4 · 新接口）
 *
 * 这是新工具里那句小字的正式实现：「复制问题去问 AI，让它扮演考官追问你」。
 *
 * 三个约束写死在 prompt 里，也写死在这里：
 * 1. 只问，不给答案、不评价、不鼓励——一给答案就变成「AI 讲给你听」。
 * 2. 最多两轮。轮次在**客户端**也有一份同样的常量（exam.ts），
 *    两边不一致时以客户端为准（用户看得见的那一份才是规则）。
 * 3. 没 Key 也能用：走本地追问，两轮各有明确目的。
 */

const SYSTEM_PROMPT = `你是一位考官。你面前有一张闪卡：正面是问题，背面是标准答案。
学生**还没有看答案**，他正在回答你的追问。

规则：
1. 只输出**一个**问题，用来暴露他上一轮回答里最薄弱的地方。
2. **绝对不要给出答案、不要评价、不要鼓励。** 你说出的话只能是一个问句。
3. 问题在 40 字以内，针对具体机制或边界条件。禁止「你还有什么补充」「再想想」这类空转问句。
4. 如果他上一轮的回答已经覆盖要点，就不要再问，输出空问题。

只输出 JSON，不要任何解释文字：
{"question":"","done":false}`;

function normalizeTurns(raw: unknown): ExamTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, EXAM_MAX_ROUNDS)
    .map((item) => {
      const rec = (item ?? {}) as Record<string, unknown>;
      return {
        question: typeof rec.question === "string" ? rec.question.trim() : "",
        answer: typeof rec.answer === "string" ? rec.answer.trim() : "",
      };
    })
    .filter((t) => t.answer.length > 0);
}

export async function POST(req: Request) {
  let front = "";
  let back = "";
  let turns: ExamTurn[] = [];

  try {
    const body = (await req.json()) as {
      front?: string;
      back?: string;
      turns?: unknown;
    };
    front = (body.front ?? "").trim();
    back = (body.back ?? "").trim();
    turns = normalizeTurns(body.turns);
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  if (!front || !back) {
    return NextResponse.json(
      { error: "缺少卡片正面 (front) 或背面 (back)。" },
      { status: 400 },
    );
  }

  // 已经问满两轮：不再打扰，直接放人去看答案
  if (turns.length >= EXAM_MAX_ROUNDS) {
    return NextResponse.json({ question: null, done: true });
  }

  const plainBack = stripHtml(back);
  const history = turns
    .map(
      (t, i) =>
        `第 ${i + 1} 轮\n考官问：${t.question}\n学生答：${t.answer}`,
    )
    .join("\n\n");

  const user = [
    `卡片正面（学生在回答这个问题）：${front}`,
    `卡片背面（标准答案，学生还没看到）：${plainBack}`,
    history ? `此前的追问记录：\n${history}` : "这是第一轮追问。",
    "",
    "请给出你的下一个问题。",
  ].join("\n");

  const result = await chatJSON({
    system: SYSTEM_PROMPT,
    user,
    temperature: 0.4,
    maxTokens: 200,
  });

  if (!result.ok) {
    return NextResponse.json({
      question: buildFallbackQuestion(front, plainBack, turns),
      done: false,
      fallback: true,
      reason: result.failure,
    });
  }

  const reply = normalizeExamReply(result.data);
  if (reply.done) {
    // 模型说「没什么可问的了」时，也要保证第一轮不至于直接跳到答案：
    // 一轮都没问就放行，等于这个模式白开。
    if (turns.length === 0) {
      return NextResponse.json({
        question: buildFallbackQuestion(front, plainBack, turns),
        done: false,
        fallback: true,
        reason: "empty_reply",
      });
    }
    return NextResponse.json({ question: null, done: true });
  }

  return NextResponse.json({ ...reply, fallback: false });
}
