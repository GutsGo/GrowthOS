import { NextResponse } from "next/server";
import { chatJSON } from "@/lib/ai/provider";
import {
  MAX_PROBES,
  buildFallbackExtraction,
  normalizeExtraction,
} from "@/lib/ai/contract";

/**
 * 提取闪卡：**1 张卡 + 3 个追问**（Phase 4）
 *
 * 改造前这里一次生成 3 张完整卡片，用户点一下按钮就得到 3 张不用动脑的卡。
 * 那恰好把学习里最有效的一步——提取——删掉了：
 * 你只是把「读」换成了「点一下」，脑子里没有发生任何检索。
 *
 * 现在的分工是刻意的：
 * - 1 张卡由 AI 做好，直接可用（省事的部分归它）
 * - 3 个追问**只有问题没有答案**，进候选池等你回来自己答（费脑的部分归你）
 *
 * 所以这个接口的产物不是「知识」，是「作业」。
 */

const SYSTEM_PROMPT = `你是一位「先替学生做一张卡，再把剩下的活留给学生」的闪卡提取助手。

用户会给你一段原文。你要做两件事。

【第一件：做一张卡】
从原文里挑一个最核心、最值得长期记住的知识点，做成 1 张问答卡。
- front：一个问题，必须指向一个具体细节。禁止「请概述」「这段话讲了什么」这类宽泛问题。
- back：答案，可用 Markdown，200 字以内。
- tags：1 到 2 个中文标签。
- type：只能是 "concept"（概念）、"interview"（面试题）、"mistake"（易错点）之一。

【第二件：出 ${MAX_PROBES} 个追问】
这 ${MAX_PROBES} 个追问是留给学生自己回答的，规则很硬：
- 只给问题，**绝对不能给出答案、提示或关键词**。
- 每个追问指向原文里另一处具体细节，不能和第一张卡重复。
- 每个 20 到 60 字，中文，以问号结尾。

只输出 JSON，不要任何解释文字：
{"card":{"front":"","back":"","tags":[],"type":"concept"},"probes":["","",""]}`;

export async function POST(req: Request) {
  let text = "";
  try {
    const body = (await req.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "缺少必要的文本内容。" }, { status: 400 });
  }

  const result = await chatJSON({
    system: SYSTEM_PROMPT,
    user: text,
    temperature: 0.3,
    maxTokens: 800,
  });

  if (!result.ok) {
    // 没有 Key 是常态，不是事故。降级也要守住「1 张 + 3 问」的形状。
    return NextResponse.json({
      ...buildFallbackExtraction(text),
      fallback: true,
      reason: result.failure,
    });
  }

  const parsed = normalizeExtraction(result.data);
  if (!parsed) {
    // 模型返回了结构不可用的东西：宁可退回本地提取，也不要交半张卡
    return NextResponse.json({
      ...buildFallbackExtraction(text),
      fallback: true,
      reason: "parse",
    });
  }

  return NextResponse.json({ ...parsed, fallback: false });
}
