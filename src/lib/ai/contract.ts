/**
 * AI 输出契约层（纯函数，零网络、零运行时依赖，可单测）
 *
 * 为什么需要这一层：大模型返回的东西永远**结构上不可信**。
 * 同一个 prompt 今天给你 `{"card": {...}}`，明天给你
 * `{"cards": [...]}`，后天给 `{"card": {...}, "probes": "问题1；问题2"}`。
 * 如果 UI 直接信任它，那么一次返回格式漂移就等于白屏。
 *
 * 所以这里的原则是：**宁可少要，不可崩**。
 * 缺字段就给默认值，类型不对就丢掉那一条，全都不可用就返回 null，
 * 由调用方走本地降级——降级路径也是纯函数，能测。
 *
 * 注意：本文件只 import 类型，不 import 运行时常量，
 * 这样 Node 原生 `--test` 可以直接跑（Next 的 `@/` 别名它解析不了）。
 */

import type { CardType, Rating } from "../learning/types.ts";

const VALID_TYPES: CardType[] = ["concept", "interview", "mistake"];

/** 追问的最大长度。超过这个长度基本不是问题，是一段解释。 */
const MAX_PROBE_CHARS = 120;
const MIN_PROBE_CHARS = 4;
/** 一次最多给 3 个追问。给更多，用户一个都不会回答。 */
export const MAX_PROBES = 3;

export interface ExtractionCard {
  front: string;
  back: string;
  tags: string[];
  type: CardType;
}

export interface Extraction {
  /** 唯一那张「已经替你做好的」卡 */
  card: ExtractionCard;
  /** 需要你自己回答的追问（没有答案，这是重点） */
  probes: string[];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickType(value: unknown): CardType {
  return VALID_TYPES.includes(value as CardType) ? (value as CardType) : "concept";
}

function pickTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((t) => asString(t))
    .filter((t) => t.length > 0 && t.length <= 20)
    .slice(0, 4);
}

/**
 * 追问的清洗。
 *
 * 三个动作，每个都有具体原因：
 * - 去掉「答：」「答案：」开头：模型经常忍不住把答案一起给出来，
 *   而**带答案的追问等于一张自动生成的卡**，那就又变回「AI 替你做提取」了。
 * - 去重：模型很喜欢把同一句换个说法给两遍。
 * - 丢掉和卡片正面重复的那条：那已经不是追问了。
 */
export function normalizeProbes(raw: unknown, exclude: string[] = []): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/\n|；|;/)
      : [];

  const seen = new Set(exclude.map((s) => s.trim()));
  const out: string[] = [];

  for (const item of list) {
    let q = asString(item);
    if (!q) continue;
    // 去掉可能被模型塞进来的答案
    q = q.replace(/^(答|答案|参考答案)\s*[:：]\s*/i, "").trim();
    // 去掉列表符号
    q = q.replace(/^[-*•\d.、)]+\s*/, "").trim();

    if (q.length < MIN_PROBE_CHARS || q.length > MAX_PROBE_CHARS) continue;
    if (seen.has(q)) continue;

    seen.add(q);
    out.push(q);
    if (out.length >= MAX_PROBES) break;
  }

  return out;
}

/**
 * 把模型返回的「1 张卡 + 3 个追问」规范化。
 * 卡片本身不可用（缺正面或背面）时返回 null —— 这时调用方应当降级，
 * 而不是拿一张半张卡去糊弄用户。
 */
export function normalizeExtraction(raw: unknown): Extraction | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // 兼容两种写法：{ card: {...} } 与 { cards: [{...}] }
  const candidate =
    obj.card && typeof obj.card === "object"
      ? (obj.card as Record<string, unknown>)
      : Array.isArray(obj.cards) && obj.cards[0] && typeof obj.cards[0] === "object"
        ? (obj.cards[0] as Record<string, unknown>)
        : null;

  if (!candidate) return null;

  const front = asString(candidate.front);
  const back = asString(candidate.back);
  if (!front || !back) return null;

  const tags = pickTags(candidate.tags);
  const card: ExtractionCard = {
    front,
    back,
    tags: tags.length ? tags : ["AI提取"],
    type: pickType(candidate.type),
  };

  return {
    card,
    probes: normalizeProbes(obj.probes ?? obj.followups ?? obj.questions, [front]),
  };
}

export interface GapPoint {
  /** 讲漏了什么 */
  point: string;
  /** 为什么这一点重要（不要写成评分理由） */
  why?: string;
}

export interface FollowUp {
  gaps: GapPoint[];
  terms: string[];
  /** 分数保留但降为次要；模型没给就是 null，不要编一个 85 */
  score: number | null;
}

/**
 * 费曼追问的规范化。
 *
 * 与老实现的区别：老实现必须拿到 `score`，拿不到就整条失败。
 * 现在 score 是可选的——因为**「哪两点没讲到」才是用户要的信息**，
 * 分数只是让人有个参照。把它当必需品，等于把裁判权又交回给模型。
 */
export function normalizeFollowUp(raw: unknown): FollowUp | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const rawGaps = Array.isArray(obj.gaps)
    ? obj.gaps
    : Array.isArray(obj.missing)
      ? obj.missing
      : [];

  const gaps: GapPoint[] = [];
  for (const item of rawGaps) {
    if (typeof item === "string") {
      const point = item.trim();
      if (point) gaps.push({ point });
      continue;
    }
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const point = asString(rec.point) || asString(rec.text);
      if (!point) continue;
      const why = asString(rec.why) || asString(rec.reason);
      gaps.push(why ? { point, why } : { point });
    }
    if (gaps.length >= 3) break;
  }

  const terms = Array.isArray(obj.terms)
    ? obj.terms
        .map((t) => asString(t))
        .filter((t) => t.length > 0 && t.length <= 24)
        .slice(0, 6)
    : [];

  const rawScore = obj.score;
  const score =
    typeof rawScore === "number" && Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 100
      ? Math.round(rawScore)
      : null;

  if (!gaps.length && !terms.length) return null;
  return { gaps, terms, score };
}

export interface ExamReply {
  question: string | null;
  done: boolean;
}

/**
 * 考官追问的规范化。
 *
 * 空问题等价于「我没什么可问的了」——这时必须**放用户去看答案**，
 * 而不是再问一遍「你确定吗」。AI 卡住的时候，卡住的不能是人。
 */
export function normalizeExamReply(raw: unknown): ExamReply {
  if (!raw || typeof raw !== "object") return { question: null, done: true };
  const obj = raw as Record<string, unknown>;

  let question = asString(obj.question) || asString(obj.follow_up);
  question = question.replace(/^(考官|追问)\s*[:：]\s*/, "").trim();

  const declaredDone = obj.done === true || obj.finished === true;
  if (declaredDone || question.length < 2) {
    return { question: null, done: true };
  }

  return { question, done: false };
}

/** 本地降级用的三个兜底追问，顺序即难度递进 */
const GENERIC_PROBES = [
  "如果不看答案，你会从哪一步开始讲？",
  "这里最容易搞错的地方是什么？",
  // 这一条原本是「举一个你自己遇到过的例子。」——句号结尾。
  // prompt 对追问的硬要求是「以问号结尾」，而降级文案自己违反了它：
  // 候选池里出现一条陈述句，用户会以为那是提示而不是要他回答的题。
  "举一个你自己遇到过的例子，你会怎么讲？",
];

function toProbe(sentence: string): string {
  const clause = sentence.replace(/[。！？!?；;]+$/g, "").trim();
  const short = clause.length > 28 ? `${clause.slice(0, 28)}…` : clause;
  return `别人问起「${short}」，你会怎么讲？`;
}

/**
 * 无 Key / 请求失败时的本地降级。
 *
 * 关键：**降级也要守住「1 张卡 + 3 个追问」的形状**。
 * 老实现降级时一次生成 3 张完整卡片，等于「没有 AI 的时候，
 * 反而让它替用户做更多的提取」——方向反了。
 */
export function buildFallbackExtraction(rawText: string): Extraction {
  const clean = (rawText || "").replace(/<\/?[^>]+(>|$)/g, " ").replace(/\s+/g, " ").trim();

  if (!clean) {
    return {
      card: {
        front: "这一段到底在讲什么？",
        back: "（原文为空，先把要学的内容贴进来）",
        tags: ["本地降级"],
        type: "concept",
      },
      probes: [...GENERIC_PROBES],
    };
  }

  const sentences = clean
    .split(/[。；！？\n;!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);

  if (!sentences.length) {
    return {
      card: {
        front: `如何理解「${clean.slice(0, 24)}」？`,
        back: clean,
        tags: ["本地降级"],
        type: "concept",
      },
      probes: [...GENERIC_PROBES],
    };
  }

  const head = sentences[0];
  const probes = sentences
    .slice(1, 1 + MAX_PROBES)
    .map(toProbe);

  // 原文句子不够时补通用追问，保证永远是 3 条
  for (const g of GENERIC_PROBES) {
    if (probes.length >= MAX_PROBES) break;
    if (!probes.includes(g)) probes.push(g);
  }

  return {
    card: {
      front: `用自己的话说明：${head.slice(0, 30)}${head.length > 30 ? "…" : ""} 到底在说什么？`,
      back: head,
      tags: ["本地降级"],
      type: "concept",
    },
    probes,
  };
}

/** 评分档位是否合法（AI 有时会返回 1、2 这种 SM-2 之外的档位） */
export function isValidRating(value: unknown): value is Rating {
  return value === 0 || value === 3 || value === 4 || value === 5;
}

/** 一条 AI 排程任务（/api/generate-tasks 的产物形状） */
export interface AITaskDraft {
  id: string;
  name: string;
  reason: string;
  /** 任务消耗的能量等级，决定今日页给不给它高亮 */
  energyDemand: "high" | "medium" | "low";
}

/**
 * 归一化模型返回的任务清单。
 *
 * 三条规则，都是为了「宁可少给，也不给假数据」：
 *
 * 1. **没有 name 的直接丢**。原来缺字段时会补一句「AI 规划任务」，
 *    于是界面上出现一个没有内容的任务，用户点完成，完成的是空气。
 * 2. **energyDemand 不在三档里就落 medium**。这个值会被拼进 className
 *    （`bg-${demand}` 那一类写法），透传一个没见过的字符串等于渲染出空样式。
 * 3. **id 缺失就补一个**。下游拿它当 React key 和完成状态的主键，
 *    重复或空的 key 会让勾选一个、亮两个。
 */
export function normalizeTaskDrafts(raw: unknown, limit = 3): AITaskDraft[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { tasks?: unknown }).tasks;
  if (!Array.isArray(list)) return [];

  const out: AITaskDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;

    const reason = typeof row.reason === "string" ? row.reason.trim() : "";
    const demand = row.energyDemand;
    const energyDemand: AITaskDraft["energyDemand"] =
      demand === "high" || demand === "low" ? demand : "medium";

    const rawId = typeof row.id === "string" ? row.id.trim() : "";
    const id =
      rawId ||
      `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    out.push({
      id,
      // 25 字是 prompt 里的要求，模型经常超；截到 40 兜底，别让卡片撑破布局
      name: name.slice(0, 40),
      reason,
      energyDemand,
    });

    if (out.length >= limit) break;
  }

  return out;
}
