/**
 * 一次复习会话的范围（纯函数）
 *
 * 起因是一个文案与行为对不上的 bug：首屏按钮写着「先做一张」（还容易被读成「去做卡」），
 * 点进去却是复习页的整队（顶部立刻显示 `0 / 2`）。按钮在承诺最小动作，
 * 落地页在说「你还有一堆」。这种不一致比文案丑得多——用户会觉得自己被
 * 哄着开头，然后被丢进一整套。
 *
 * 修法不是放弃「只做一张」这个主张（两分钟启动是产品的地基），
 * 而是让复习页知道自己是被哪种意图打开的：
 *
 *   · `one` —— 只放出**一张**。做完就收尾，剩下的留到明天，不催。
 *   · `all` —— 侧边栏 / 命令面板进来的整队，进度分母照常。
 *
 * 这里只算「该显示哪张、分母是多少、什么时候算收尾」，不碰 IO，
 * 所以上面那三种情况可以全部单测（见 __tests__/session.test.ts）。
 */

import type { QueueCard } from "./queue.ts";

export type ReviewScope = "one" | "all";

export interface SessionPlan {
  /** 本次会话当前该显示的卡（最多一张，或整个待评列表） */
  pending: QueueCard[];
  /** 进度分母。`one` 模式下恒为已评 + 至多 1 张 */
  total: number;
  /** 本次会话已评张数 */
  rated: number;
  /** 「一张」模式：这一张复习完了，但今天还有别的卡 */
  oneDone: boolean;
  /** `oneDone` 时剩下的张数，用来写「还有 N 张」 */
  restCount: number;
}

/**
 * @param sequence 今天的完整复习顺序（已交错）
 * @param ratedIds 本次会话已评过的卡 id
 * @param scope 进入复习页的意图
 */
export function planSession(
  sequence: QueueCard[],
  ratedIds: ReadonlySet<string>,
  scope: ReviewScope,
): SessionPlan {
  const unrated = sequence.filter((item) => !ratedIds.has(item.id));
  const rated = ratedIds.size;

  if (scope === "all") {
    return {
      pending: unrated,
      total: rated + unrated.length,
      rated,
      oneDone: false,
      restCount: unrated.length,
    };
  }

  // 「一张」模式：配额是 1，已评过 1 张就不再放下一张出来。
  // 用配额而不是 `slice(0, 1)`——后者在评完第一张后会立刻把第二张顶上来，
  // 等于一点没限住。
  const quota = Math.max(0, 1 - rated);
  const pending = unrated.slice(0, quota);

  return {
    pending,
    total: rated + pending.length,
    rated,
    // 收尾只在「今天还有卡、但这一张已经复习完」时成立；
    // 如果今天本来就没别的卡了，那是真的清空，该走 SessionDone。
    oneDone: pending.length === 0 && rated > 0 && unrated.length > 0,
    restCount: unrated.length,
  };
}
