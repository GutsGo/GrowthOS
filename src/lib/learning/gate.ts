/**
 * 「今日」门禁（纯函数）
 *
 * 这是整个改造里最重要的一块文案逻辑：首屏只允许出现
 * 「今天要做什么 + 一个按钮 + 一句免责」三样东西。
 *
 * 为什么把文案放进纯函数：
 * 首屏的每一句话都会被反复改。放在组件里改，改一次就得开一次浏览器；
 * 放在这里，改完跑 `npm test` 就能确认「空状态 / 有到期 / 只有新卡」三种分支
 * 没有互相串味。组件只负责把它画出来。
 */

import type { DailyQueue } from "./queue";

export type GateAction = "review" | "create";

export interface TodayGate {
  /** 主按钮该干什么：去复习，还是去制卡 */
  action: GateAction;
  /** 到期卡数量 */
  dueCount: number;
  /** 本次放行的新卡数量（已扣除配额） */
  freshCount: number;
  /** 到期 + 新卡 */
  total: number;
  /** 被配额顺延到明天的新卡 */
  deferredNew: number;
  /** 大标题，一句话说清今天有多少 */
  headline: string;
  /** 副标题，说明构成 */
  detail: string;
  /** 主按钮文案 */
  primaryLabel: string;
  /** 主按钮下方的小字 */
  primaryHint: string;
  /** 是否显示「新卡上限」提示 */
  showQuotaNote: boolean;
  /** 新卡顺延说明 */
  quotaNote: string;
}

export interface GateContext {
  /** 库里到底有没有卡片，用来区分「全清空了」和「一张卡都还没建」 */
  hasAnyCards?: boolean;
  /** 每日新卡上限，仅用于文案 */
  newLimit?: number;
}

export function buildTodayGate(
  queue: DailyQueue,
  context: GateContext = {},
): TodayGate {
  const hasAnyCards = context.hasAnyCards ?? queue.total > 0;
  const newLimit = context.newLimit ?? 0;

  const base = {
    dueCount: queue.due.length,
    freshCount: queue.fresh.length,
    total: queue.total,
    deferredNew: queue.deferredNew,
    showQuotaNote: queue.deferredNew > 0,
    quotaNote:
      queue.deferredNew > 0
        ? `还有 ${queue.deferredNew} 张新卡排在明天${
            newLimit > 0 ? `（每天最多 ${newLimit} 张）` : ""
          }`
        : "",
  };

  // 1. 有卡要做 → 去复习
  if (queue.total > 0) {
    const parts: string[] = [];
    if (queue.due.length > 0) parts.push(`到期 ${queue.due.length} 张`);
    if (queue.fresh.length > 0) parts.push(`新卡 ${queue.fresh.length} 张`);
    return {
      ...base,
      action: "review",
      headline: `今天 ${queue.total} 张卡待复习`,
      detail: parts.join(" · "),
      primaryLabel: "先复习一张",
      // 「复习」两个字不能省：页签里叫「制卡」的是**做卡**，
      // 光写「先做一张」，读起来就是「先去做一张卡」。
      // 小字也必须描述**按钮承诺的那一张**，不能顺手报整批的耗时：
      // 按钮说「一张」、底下写「约 2 分钟」（那是 2 张的时间），
      // 同一张卡上两句话互相拆台。总量已经在标题里说过了。
      primaryHint: "复习完这一张就能走",
    };
  }

  // 2. 今天清空了，但卡库还有卡 → 引导提前制卡，但不给压力
  if (hasAnyCards) {
    return {
      ...base,
      action: "create",
      headline: "今天清完了",
      detail: "没有到期卡，可以再制一张。",
      primaryLabel: "再制一张",
      primaryHint: "一张只考一个细节",
    };
  }

  // 3. 全新用户 → 第一张卡
  return {
    ...base,
    action: "create",
    headline: "还没有卡片",
    detail: "先写第一张。一个细节就够。",
    primaryLabel: "做第一张卡",
    primaryHint: "2 分钟就够",
  };
}
