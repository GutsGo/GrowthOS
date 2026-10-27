/**
 * 考官模式（纯函数）
 *
 * 这是新工具里那句小字的正式实现：
 * 「复制问题去问 AI，让它扮演考官追问你」。
 *
 * 为什么这一步值得做：复习时最大的自欺是「看一眼答案，觉得眼熟，就点良好」。
 * 眼熟 ≠ 能答。考官的作用是在翻面**之前**多要两轮回答，把「眼熟」暴露成
 * 「其实说不清」。
 *
 * 三条设计约束，写在代码里免得以后被改掉：
 *
 * 1. **最多两轮**。一轮太短，用户会用「就这样」糊过去；三轮以上变成审讯，
 *    而且在手机上打三屏字比直接看答案更劝退。
 * 2. **考官只问，不给答案、不打分**。给了答案就变成「AI 讲给你听」，
 *    那和看卡片背面没有区别，还多绕一圈。
 * 3. **随时可以直接看答案**。没有逃生门的强制步骤，用户会用关页面来逃，
 *    那时连一条数据都留不下。
 */

import type { ExamTurn } from "./types";

export type { ExamTurn };

/** 两轮。见文件头约束 1。 */
export const EXAM_MAX_ROUNDS = 2;

/** 低于 4 个字基本等于没答（「不知道」「忘了」都算有效回答，不会被拦） */
export const MIN_ANSWER_CHARS = 4;

export function examFinished(turns: ExamTurn[]): boolean {
  return turns.length >= EXAM_MAX_ROUNDS;
}

export function examProgress(turns: ExamTurn[]): {
  answered: number;
  left: number;
} {
  const answered = Math.min(turns.length, EXAM_MAX_ROUNDS);
  return { answered, left: Math.max(0, EXAM_MAX_ROUNDS - answered) };
}

/**
 * 回答太薄时给一句话，够厚就返回 null。
 *
 * 刻意**不阻断**提交：真的想不出来时，写「忘了」也是一种诚实回答，
 * 而且它本身就是一个很强的信号（这张卡该回炉）。
 * 所以这里只提示，把判断权留给用户自己。
 */
export function thinAnswerHint(answer: string): string | null {
  const length = (answer ?? "").replace(/\s/g, "").length;
  if (length === 0) return "先答一句。";
  if (length < MIN_ANSWER_CHARS) return "再写长一点。";
  return null;
}

/** 从卡片背面里挑一个「可以被替换掉的锚点词」，用于第二轮追问 */
export function pickAnchor(back: string): string | null {
  const quoted = (back ?? "").match(/[「《]([^」》]{2,12})[」》]/);
  if (quoted) return quoted[1];

  const latin = (back ?? "").match(/[A-Za-z][A-Za-z0-9-]{2,}/g);
  if (latin && latin.length) {
    return [...latin].sort((a, b) => b.length - a.length)[0];
  }
  return null;
}

function shorten(text: string, max: number): string {
  const clean = (text ?? "").replace(/[。！？!?；;]+$/g, "").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * 无 Key / 请求失败时的本地追问。
 *
 * 两轮各有明确目的：
 * - 第一轮逼你说出步骤（不许说结论）
 * - 第二轮拿走术语这个拐棍（不能用某个词，你还讲得清吗）
 *
 * 这两问的共同点是**不需要知道答案对不对**，所以它们在没有 AI 的时候也成立。
 */
export function buildFallbackQuestion(
  front: string,
  back: string,
  turns: ExamTurn[],
): string {
  if (turns.length === 0) {
    return `「${shorten(front, 24)}」——不看答案，最关键的一步是什么？`;
  }

  const anchor = pickAnchor(back);
  if (anchor) {
    return `如果不能用「${anchor}」这个词，你会怎么把它讲清楚？`;
  }
  return "换一个更小的例子，你会举什么？";
}

/**
 * 一次考官对话的摘要，写进复习事件旁边的记录里用。
 *
 * `thin` 的计数不是用来评价人的，是用来识别「这张卡其实没学会」：
 * 两轮都答得很薄，就不该在评分时点「良好」。
 */
export function summarizeExam(turns: ExamTurn[]): {
  rounds: number;
  thin: number;
  answers: string[];
} {
  return {
    rounds: turns.length,
    thin: turns.filter((t) => (t.answer ?? "").replace(/\s/g, "").length < MIN_ANSWER_CHARS)
      .length,
    answers: turns.map((t) => (t.answer ?? "").trim()),
  };
}
