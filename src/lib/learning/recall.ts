/**
 * 主动回忆的文本比对（纯函数，零依赖，可单测）
 *
 * 这是 GrowthOS 比市面上多数闪卡工具强的地方：不要求你把答案打对，
 * 只要求你**先把话说出来**，然后给一个「你的话覆盖了原答案多少」的分数。
 * 分数不是判分，是让人看见「我以为我会了」和「我真的讲得出来」之间的差距。
 *
 * 从 FlowView 里搬出来时修掉了一个真实的安全问题：
 * 原实现把用户输入（语音转写/打字）原样拼进 `dangerouslySetInnerHTML`，
 * 用户说一句 `<img onerror=...>` 就能执行脚本。现在先转义再上色。
 *
 * 同时把 `stripHtml` 从「依赖 document」改成纯正则：
 * 单测里没有 DOM，靠 DOM 的实现等于永远测不到。
 */

/** HTML 实体解码表。只处理 Flashcard 里真正会出现的几个，不做通用解码。 */
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** 把带标签的背面内容压成纯文本，用于比对与展示 */
export function stripHtml(html: string): string {
  if (!html) return "";
  const withoutTags = html.replace(/<[^>]*>/g, " ");
  const decoded = withoutTags.replace(
    /&(?:nbsp|amp|lt|gt|quot|#39|apos);/g,
    (entity) => ENTITIES[entity] ?? entity,
  );
  return decoded.replace(/\s+/g, " ").trim();
}

/**
 * 比对前的归一化：去掉空白、标点与符号、转小写。
 *
 * 为什么要去标点：你说「ReAct 是推理加行动」，卡片写「ReAct：推理 + 行动」，
 * 标点不同但内容一致，不该因为冒号被扣分。
 * 符号（`\p{S}`）也要去掉——`+` 属于数学符号而不是标点，
 * 只写 `\p{P}` 会让「推理 + 行动」和「推理行动」判成不同。
 */
export function normalizeForCompare(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}

/**
 * 最长公共子序列相似度，返回 0–100 的整数。
 *
 * 用 LCS 而不是「关键词命中率」，是因为 LCS 奖励**顺序正确**：
 * 你把四个步骤倒着说，字数全对，分数也该掉下来——顺序错了就是没理解结构。
 *
 * 复杂度 O(m·n)。卡片背面通常几百字，实测无感；
 * 但不要拿它去比两份长文，那时该换更好的算法。
 */
export function calculateLCS(userText: string, correctText: string): number {
  const s1 = normalizeForCompare(userText);
  const s2 = normalizeForCompare(correctText);
  if (!s1 || !s2) return 0;

  const m = s1.length;
  const n = s2.length;

  // 滚动数组：只保留上一行，把 O(m·n) 的空间压到 O(n)
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i += 1) {
    const c1 = s1[i - 1];
    for (let j = 1; j <= n; j += 1) {
      if (c1 === s2[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = curr[j - 1] >= prev[j] ? curr[j - 1] : prev[j];
      }
    }
    const swap = prev;
    prev = curr;
    curr = swap;
    curr.fill(0);
  }

  const lcsLen = prev[n];
  const similarity = (lcsLen / Math.max(m, n)) * 100;
  return Math.round(similarity);
}

/** 把文本转成可以安全放进 innerHTML 的形式 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 给「你说的话」上色：答案里出现过的字标绿，没出现的保持原样。
 *
 * 诚实地说明它的局限：这是**字级命中**，不是对齐。
 * 它只能回答「这些字你有没有说到」，回答不了「你有没有说对顺序」。
 * 所以 UI 上必须同时显示 LCS 百分比——那个才反映结构。
 */
export function highlightMatchedText(
  userText: string,
  correctText: string,
  highlightClass = "text-primary font-bold",
): string {
  if (!userText) return "";

  const pool = new Set(Array.from(normalizeForCompare(correctText)));
  if (pool.size === 0) return escapeHtml(userText);

  return Array.from(userText)
    .map((char) => {
      const normalized = normalizeForCompare(char);
      // 空白和标点不参与上色，原样输出（否则整段都是灰点点）
      if (!normalized) return escapeHtml(char);
      return pool.has(normalized)
        ? `<span class="${highlightClass}">${escapeHtml(char)}</span>`
        : escapeHtml(char);
    })
    .join("");
}

/** 相似度 → 一句不打击人也不哄人的评语 */
export function describeMatch(score: number): string {
  if (score >= 85) return "基本说全了，可以往下走";
  if (score >= 60) return "主干有了，细节还漏";
  if (score >= 30) return "抓到一部分，但结构没串起来";
  return "基本没说上来";
}
