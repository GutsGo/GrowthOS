/**
 * 候选池（纯函数）
 *
 * 背景：Phase 0–3 的 `/api/extract-cards` 会一次生成 3 张**完整**卡片，
 * 用户点一下就得到 3 张不用动脑子的卡。这恰好删掉了学习里最有效的动作——提取。
 *
 * Phase 4 改成「1 张卡 + 3 个追问」：
 * - 那 1 张卡是 AI 替你做好的，直接落库（省事的部分归它）
 * - 那 3 个追问**没有答案**，进候选池等你回来自己答（费脑的部分归你）
 *
 * 所以候选池不是「待办清单」，它是「还没提取完的输入」。
 * 这一条决定了两件事：候选池里的东西**不会**被排进复习队列，
 * 也不会被算进每日新卡上限——它们还不是卡。
 */

export interface CardCandidate {
  id: string;
  /** 追问本身（只有问题，没有答案——这是它存在的意义） */
  question: string;
  /** 原文片段，供用户回想上下文；可能为空 */
  source: string;
  createdAt: number;
  /** 是否已被用户接走（接走后从池子里消失，但保留记录用于统计） */
  adopted: boolean;
}

/** 池子的展示上限。攒到 30 条还不处理，说明这条路走不通，不如清掉。 */
export const MAX_POOL_SIZE = 30;

/** 同一句追问在前后的两次提取里重复出现是常事，用规范化文本判重 */
function dedupeKey(question: string): string {
  return question.replace(/[\s\p{P}]+/gu, "").toLowerCase();
}

/**
 * 新追问 → 候选记录。
 *
 * `now` 与 `idFn` 都从外面传：纯函数里不许出现 `Date.now()` 与 `crypto.randomUUID()`，
 * 否则这个模块就没法被单测钉住（同一个输入两次调用结果不同）。
 */
export function buildCandidates(
  probes: string[],
  source: string,
  now: number,
  idFn: () => string,
): CardCandidate[] {
  const out: CardCandidate[] = [];
  const seen = new Set<string>();

  for (const raw of probes) {
    const question = (raw ?? "").trim();
    if (question.length < 4) continue;
    const key = dedupeKey(question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: idFn(),
      question,
      source: (source ?? "").trim().slice(0, 200),
      createdAt: now,
      adopted: false,
    });
  }

  return out;
}

/**
 * 把新一批并进已有池子，并裁到上限。
 *
 * 裁剪策略是「**留下最新的**」而不是「留下最旧的」：
 * 池子里躺了三个月的追问，用户早就忘了当初在读什么，
 * 留着只会变成一种负债感。这也和手册「不做欠账」的取向一致。
 */
export function mergeCandidates(
  existing: CardCandidate[],
  incoming: CardCandidate[],
  limit: number = MAX_POOL_SIZE,
): CardCandidate[] {
  const seen = new Set<string>();
  const merged: CardCandidate[] = [];

  for (const item of [...incoming, ...existing]) {
    const key = dedupeKey(item.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return merged;
}

/** 还没被接走的那些，按时间倒序（新的在前） */
export function pendingCandidates(list: CardCandidate[]): CardCandidate[] {
  return list
    .filter((c) => !c.adopted)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 候选池 → 卡片正面的预填文本。
 *
 * 只预填问题，不预填答案：按手册的说法，回答问题才是那一次学习。
 * 如果连答案也预填，这张卡就白做了，而且用户会以为自己懂了。
 */
export function candidateToFront(candidate: CardCandidate): string {
  return candidate.question.trim();
}
