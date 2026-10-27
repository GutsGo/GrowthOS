/**
 * 费曼输出（纯函数，零运行时依赖，可单测）
 *
 * 老项目这里做错了方向：AI 直接把用户讲的话打成一个 0–100 的分数。
 * 分数是「裁判」干的事，而一个人真正需要的只有一件东西——**哪里讲不下去**。
 *
 * 所以这里的三个判断全都不依赖 AI：
 * 1. 你讲的这段话里，哪些句子是「卡壳候选」（供你自己点选，不是 AI 猜）
 * 2. 你写的 100 字大白话，有没有开始堆术语（堆术语＝还没懂）
 * 3. 从卡壳点生成**一条**待补卡建议（只建议，不自动建卡——提取动作必须由人完成）
 */

import type { FeynmanRecord } from "@/lib/db";

/** 100 字大白话的硬约束。上限留一点余量，但不允许写成一段论文。 */
export const PLAIN_MIN_CHARS = 40;
export const PLAIN_MAX_CHARS = 130;

/**
 * 术语黑名单。
 *
 * 判断标准不是「难词」，而是「能用来藏东西的词」：
 * 你写出「底层逻辑」「范式」「赋能」的时候，读者拿不到任何具体信息，
 * 但你自己会产生「我懂了」的错觉。这正是不及格的大白话。
 */
const JARGON_WORDS = [
  "赋能",
  "抓手",
  "闭环",
  "底层逻辑",
  "范式",
  "维度",
  "颗粒度",
  "对齐",
  "方法论",
  "心智模型",
  "认知升级",
  "顶层设计",
  "组合拳",
  "护城河",
  "降维打击",
  "抽象层",
  "解耦",
  "复用性",
];

/** 拉丁字母缩写：API / SM-2 / LCS / RAG 这类，通常意味着「没翻译成中文」。 */
const ABBREVIATION = /[A-Za-z][A-Za-z0-9-]{1,}/g;

/** 三步流程的步骤定义。文案全部是「做什么」，不是「你得…」 */
export const FEYNMAN_STEPS = [
  {
    id: "speak" as const,
    title: "讲一遍",
    hint: "不看卡片，用自己的话说。",
  },
  {
    id: "stuck" as const,
    title: "标卡壳",
    hint: "点出含糊过去的地方。",
  },
  {
    id: "plain" as const,
    title: "写 100 字",
    hint: "写给一个完全不懂的人。一个术语都不许用。",
  },
];

export type FeynmanStepId = (typeof FEYNMAN_STEPS)[number]["id"];

export interface PlainSummaryCheck {
  /** 去掉空白后的字符数 */
  length: number;
  /** 命中的术语（去重，保持出现顺序） */
  terms: string[];
  /** 是否达标 */
  ok: boolean;
  /** 给用户看的一句话。达标时说明「为什么达标」，不写「很棒」 */
  message: string;
}

/**
 * 检查 100 字大白话。
 *
 * 顺序很关键：**先看长度，再看术语**。一上来就说「你用了术语」，
 * 而用户其实才写了 20 个字，会让人觉得被挑刺而不是被帮到。
 */
export function measurePlainSummary(text: string): PlainSummaryCheck {
  const trimmed = (text ?? "").trim();
  const length = trimmed.replace(/\s/g, "").length;

  const found: string[] = [];
  for (const word of JARGON_WORDS) {
    if (trimmed.includes(word) && !found.includes(word)) found.push(word);
  }
  // 缩写只在「一段话里出现多个」时才算问题：偶尔提一次 API 是必要的，
  // 通篇 API/SDK/ORM 就是在用名词代替解释。
  const abbrevs = Array.from(new Set(trimmed.match(ABBREVIATION) ?? []));
  if (abbrevs.length >= 3) {
    for (const a of abbrevs) {
      if (!found.includes(a)) found.push(a);
    }
  }

  if (length === 0) {
    return { length, terms: [], ok: false, message: "还没写。" };
  }
  if (length < PLAIN_MIN_CHARS) {
    return {
      length,
      terms: found,
      ok: false,
      message: `还差 ${PLAIN_MIN_CHARS - length} 字。`,
    };
  }
  if (found.length > 0) {
    return {
      length,
      terms: found,
      ok: false,
      message: `「${found.slice(0, 3).join("、")}」这类词在替你省略解释。换成具体画面。`,
    };
  }
  if (length > PLAIN_MAX_CHARS) {
    return {
      length,
      terms: found,
      ok: false,
      message: `超了 ${length - PLAIN_MAX_CHARS} 字。`,
    };
  }
  return {
    length,
    terms: [],
    ok: true,
    message: `${length} 字，没有术语。`,
  };
}

/**
 * 把讲述正文切成句子，作为「卡壳点」的候选。
 *
 * 为什么不让用户自由输入：让他在空白框里回想「我刚才哪里卡了」，
 * 大多数人会写「都还行」。把句子摆出来让他点，他才会真的想起来
 * 第三句当时是跳过去的。
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/\s/g, "").length >= 6)
    .slice(0, 40);
}

export interface FeynmanDraft {
  cardId?: string;
  concept: string;
  text: string;
  stuckPoints: string[];
  plainSummary: string;
}

export interface DraftCheck {
  /** 是否可以交付。只由「讲」和「100 字」两步决定。 */
  ok: boolean;
  /** 真正挡住交付的原因；键是步骤 id */
  blockers: Partial<Record<FeynmanStepId, string>>;
  /** 不挡交付、但值得说一句的提示 */
  hints: Partial<Record<FeynmanStepId, string>>;
}

/**
 * 三步是否都过。
 *
 * 刻意**不要求**至少标一个卡壳点：真的全都讲顺了是可能发生的，
 * 那时强行要求「必须挑出毛病」只会让人随便点一句应付。
 * 所以 stuck 只产生提示，不产生阻塞——`ok` 只由 speak 和 plain 决定。
 */
export function checkDraft(draft: FeynmanDraft): DraftCheck {
  const blockers: Partial<Record<FeynmanStepId, string>> = {};
  const hints: Partial<Record<FeynmanStepId, string>> = {};

  if (!draft.concept.trim()) {
    blockers.speak = "先写清楚你要讲哪个概念。";
  } else if (draft.text.trim().replace(/\s/g, "").length < 30) {
    blockers.speak =
      "至少写满 30 字。";
  }

  if (!draft.stuckPoints.length) {
    hints.stuck = "可以继续。";
  }

  const plain = measurePlainSummary(draft.plainSummary);
  if (!plain.ok) blockers.plain = plain.message;

  return { ok: Object.keys(blockers).length === 0, blockers, hints };
}

export interface CardSuggestion {
  /** 建议的卡片正面（一个问题） */
  front: string;
  /** 建议的卡片背面（从你自己的话里取，不是 AI 生成的） */
  back: string;
  /** 为什么建议补这一张 */
  reason: string;
}

/**
 * 从卡壳点生成一条待补卡建议。
 *
 * 只给**一条**：一次给三条，用户的反应是「哦好」然后一条都不建。
 * 一条的话，他要么建，要么明确不建。
 *
 * 「让用户自己建」不是偷懒：手册里「提取」本身就是学习动作，
 * 系统代劳就等于把最有效的那一步删掉了。
 */
export function buildCardSuggestion(
  draft: FeynmanDraft,
): CardSuggestion | null {
  const stuck = draft.stuckPoints.map((s) => s.trim()).filter(Boolean);
  if (!stuck.length) return null;

  const first = stuck[0];
  const concept = draft.concept.trim() || "这个概念";

  return {
    front: `${concept}：${trimForQuestion(first)}——具体是怎么运作的？`,
    back: draft.plainSummary.trim() || "（写下你的答案）",
    reason:
      stuck.length > 1
        ? `标了 ${stuck.length} 处卡壳，先补第一处。`
        : "这是你自己标的卡壳点。",
  };
}

/** 把卡壳句子塞进问句时压一下长度，否则正面会长到看不下去 */
function trimForQuestion(sentence: string): string {
  const clean = sentence.replace(/[。！？!?；;]+$/g, "").trim();
  return clean.length > 26 ? `${clean.slice(0, 26)}…` : clean;
}

/**
 * 输出记录 → 待补卡建议的「已处理」判定。
 *
 * 用途：输出历史里，标了卡壳点但一直没有对应卡片的记录，值得回头提醒一次。
 * 判定只看「有没有关联卡片」，不看用户点没点过按钮——按钮是过程，卡片才是结果。
 */
export function needsFollowUp(output: FeynmanRecord): boolean {
  return Boolean(output.stuckPoints?.length) && !output.cardId;
}
