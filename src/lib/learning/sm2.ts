/**
 * 四档 SM-2 调度算法（纯函数，零依赖，可独立单测）
 *
 * 与标准 SM-2 的两处**刻意偏离**，都来自《学习方法手册》4.5 节的明文规定：
 *
 * 1. 「困难」不按标准 SM-2 处理。
 *    标准 SM-2 里 q=3 仍会拉长间隔（只是 EF 掉得更多）；手册要求的是
 *    「缩短间隔，提前再见」。所以本实现让「困难」严格短于「良好」的默认推进值，
 *    但**必须仍然增长**（见下方 hardInterval 的注释：只乘系数会把卡钉死在每天一次）。
 *
 * 2. 「简单」在默认推进之上再乘一个系数。
 *    手册要求「拉长间隔，减少重复次数」，标准 SM-2 的 q=5 只涨 0.1 EF，
 *    拉长幅度不足以表达「脱口而出」。
 *
 * 剩下的部分是标准 SM-2：EF 惩罚公式、reps 里程碑（1 天 → 6 天 → ×EF）、
 * EF 下限 1.3、忘记时 reps 归零。
 *
 * 所有函数都是纯函数：不改入参、不读时钟、不碰存储。
 */

import type { Rating, ReviewState } from "./types";

/** 一天的毫秒数。跨天计算统一用它，避免夏令时/时区把间隔算歪。 */
export const MS_PER_DAY = 86_400_000;

/** EF 下限。低于 1.3 的卡片会退化成「天天见」，不如重建这张卡。 */
export const EF_MIN = 1.3;

/** EF 默认值（新卡） */
export const EF_DEFAULT = 2.5;

/** 首次成功复习后的间隔（天） */
export const FIRST_INTERVAL = 1;

/** 第二次成功复习后的间隔（天） */
export const SECOND_INTERVAL = 6;

/** 「困难」的相对增长率：远低于 EF 默认推进，实现「提前再见」。 */
export const HARD_GROWTH = 1.2;
/** 「简单」在默认推进之上的额外倍数，实现「减少重复次数」。 */
export const EASY_GROWTH = 1.3;

/** 「简单」第一次复习时的间隔（天）。首次就给 3 天，而不是 1 天。 */
export const EASY_FIRST_INTERVAL = 3;

/** 忘记后重新见面的间隔（天）。手册允许「今天稍后或明天」，这里取明天。 */
export const LAPSE_INTERVAL = 1;

/**
 * 间隔上限（天）。
 * Cepeda 2008 的结论是最佳间隔约为目标保持时长的 10%–20%，间隔不是越长越好；
 * 365 天只是一个防溢出护栏，不代表推荐值。
 */
export const MAX_INTERVAL_DAYS = 365;

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampEase(easeFactor: number): number {
  return roundTo2(Math.max(EF_MIN, easeFactor));
}

/** 判断一个数值是否是合法档位。外部输入（表单、API、导入 JSON）都必须先过这一关。 */
export function isRating(value: unknown): value is Rating {
  return value === 0 || value === 3 || value === 4 || value === 5;
}

/**
 * SM-2 的 EF 增量：0.1 - (5-q)·(0.08 + (5-q)·0.02)
 *
 * 代入四档得到：
 * - 忘记 q=0 → -0.80（一次忘记就把 EF 打下来，因为这是「完全没记住」的强信号）
 * - 困难 q=3 → -0.14
 * - 良好 q=4 →  0.00（保持不动，这是「正常」的定义）
 * - 简单 q=5 → +0.10
 */
export function easeDelta(rating: Rating): number {
  const miss = 5 - rating;
  return roundTo2(0.1 - miss * (0.08 + miss * 0.02));
}

/** 新卡的初始状态：立刻到期，但不计入「到期队列」（见 queue.ts 的新卡判定）。 */
export function createInitialState(now: number = Date.now()): ReviewState {
  return {
    easeFactor: EF_DEFAULT,
    repetitions: 0,
    interval: 0,
    due: now,
  };
}

/**
 * 默认推进间隔（「良好」走这条线，标准 SM-2）
 *
 * reps 0 → 1 天，reps 1 → 6 天，之后按 EF 累乘。
 */
function defaultInterval(
  previousRepetitions: number,
  previousInterval: number,
  easeFactor: number,
): number {
  if (previousRepetitions <= 0) return FIRST_INTERVAL;
  if (previousRepetitions === 1) return SECOND_INTERVAL;
  return Math.max(1, Math.round(previousInterval * easeFactor));
}

/**
 * 「困难」的间隔：比默认推进更早，但**必须仍然增长**。
 *
 * 这里有个不写单测就发现不了的坑。最初实现是 `round(previousInterval × 1.2)`：
 * interval=1 时 round(1.2)=1，结果「困难」会把这张卡永久钉在 1 天——
 * 1→1→1，每天见一次，永远出不去。那不是「提前再见」，是「永远再见」。
 * 更糟的是它会惩罚**如实自评**的人：诚实点「困难」的人被卡住，
 * 虚报「良好」的人反而推进得快。任何惩罚诚实的设计，最后都会让人学会不诚实。
 *
 * 所以下限取 `previousInterval + 1`（保证每天都比上次久一点），
 * 上限取 baseline（保证永远不超过「良好」）。
 * 新卡（interval=0）时下限和上限都塌缩到 1 天，与「良好」相同——
 * 这没法避免，也不该避免：一天以下没有更短的间隔可用。
 */
function hardInterval(previousInterval: number, baseline: number): number {
  return Math.min(
    baseline,
    Math.max(
      previousInterval + 1,
      Math.round(Math.max(previousInterval, 1) * HARD_GROWTH),
    ),
  );
}

export interface RatingResult extends ReviewState {
  /** 本次是否判定为「忘记」 */
  lapsed: boolean;
  /** 评分前的间隔，用于写 ReviewEvent 时留痕 */
  intervalBefore: number;
}

/**
 * 应用一次自评，返回新的复习状态。
 *
 * @param state  评分前的状态（不会被修改）
 * @param rating 四档自评：0 忘记 / 3 困难 / 4 良好 / 5 简单
 * @param now    评分时刻，默认取当前时间；测试时显式传入以保证可重复
 * @throws RangeError 档位非法（调用方应先校验，这里只是兜底）
 */
export function applyRating(
  state: ReviewState,
  rating: Rating,
  now: number = Date.now(),
): RatingResult {
  if (!isRating(rating)) {
    throw new RangeError(`不支持的自评档位: ${String(rating)}`);
  }

  const easeBefore = clampEase(
    Number.isFinite(state.easeFactor) ? state.easeFactor : EF_DEFAULT,
  );
  const previousRepetitions = Math.max(
    0,
    Math.floor(Number.isFinite(state.repetitions) ? state.repetitions : 0),
  );
  const previousInterval = Math.max(
    0,
    Math.floor(Number.isFinite(state.interval) ? state.interval : 0),
  );

  let repetitions: number;
  let interval: number;

  if (rating === 0) {
    // 忘记：重置间隔，明天再见。reps 归零后，下一次成功复习会重新走 1 天 → 6 天。
    repetitions = 0;
    interval = LAPSE_INTERVAL;
  } else {
    repetitions = previousRepetitions + 1;
    const baseline = defaultInterval(
      previousRepetitions,
      previousInterval,
      easeBefore,
    );

    if (rating === 3) {
      // 困难：缩短间隔，提前再见（但仍在增长，见 hardInterval）
      interval = hardInterval(previousInterval, baseline);
    } else if (rating === 4) {
      // 良好：按默认间隔推进。
      interval = baseline;
    } else {
      // 简单：拉长间隔，减少重复次数。
      interval =
        previousRepetitions <= 0
          ? EASY_FIRST_INTERVAL
          : Math.max(baseline + 1, Math.round(baseline * EASY_GROWTH));
    }
  }

  const easeFactor = clampEase(easeBefore + easeDelta(rating));
  const nextInterval = Math.min(interval, MAX_INTERVAL_DAYS);

  return {
    easeFactor,
    repetitions,
    interval: nextInterval,
    due: now + nextInterval * MS_PER_DAY,
    lapsed: rating === 0,
    intervalBefore: previousInterval,
  };
}

/** 是否到了该复习的时间。新卡（repetitions=0 且 interval=0）不算到期，见 queue.ts。 */
export function isDue(state: ReviewState, now: number = Date.now()): boolean {
  return state.due <= now;
}
