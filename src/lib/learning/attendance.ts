/**
 * 出勤统计（纯函数）
 *
 * 为什么要有这个文件：老项目的 StatsView 统计的是「连续天数」，而且断一天归零。
 * 手册第七章第 2 条说得很清楚——打卡是**看见频率**，不是道德评分；
 * Lally 2010 的数据是「漏掉一天对长期轨迹没有显著影响」。
 *
 * 所以这里只回答两个问题：
 * 1. 最近 N 天里，我有几天真的来过？（格子）
 * 2. 这个比例是多少？（出勤率）
 *
 * 刻意**不提供** currentStreak：一旦界面上有「连续 N 天」，就会有人为了不断链而
 * 做假打卡，这正是手册第 3 号弃坑机制里说的「欠账感」。
 */

/** 一条活跃记录的最小来源形状 */
export interface AttendanceSources {
  /** 习惯打卡的日期（YYYY-MM-DD）。特化表单打卡也走这张表。 */
  habitDates?: Iterable<string>;
  /** 日记记录，只有「至少完成过一个 AI 排程任务」的那天才算出勤 */
  dailyRecords?: Iterable<{
    date: string;
    aiTasks?: readonly { isCompleted?: boolean }[];
  }>;
  /** 复习事件的时间戳（epoch ms），一次评分就算来过 */
  reviewEventAts?: Iterable<number>;
  /** 额外补充的日期（比如将来的费曼输出、项目提交），便于扩展 */
  extraDates?: Iterable<string>;
}

/** 本地时区的 YYYY-MM-DD。与 queue.ts 的 dayKey 保持同一口径。 */
export function toDayKey(input: number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 把各种数据源合并成一个「有活动的日期集合」。
 *
 * 三条口径说明：
 * - 习惯打卡：一条记录 = 那天来过（哪怕只打了一个习惯）
 * - AI 任务：必须至少完成 1 个才算，否则「生成了任务但一个没做」也会被算成出勤
 * - 复习事件：任意一次评分都算（这是 Phase 2 之后的主要数据源）
 */
export function collectActiveDays(sources: AttendanceSources): Set<string> {
  const days = new Set<string>();

  if (sources.habitDates) {
    for (const date of sources.habitDates) {
      if (date) days.add(date);
    }
  }

  if (sources.dailyRecords) {
    for (const record of sources.dailyRecords) {
      const tasks = record.aiTasks;
      if (!tasks || tasks.length === 0) continue;
      if (tasks.some((t) => t?.isCompleted)) {
        days.add(record.date);
      }
    }
  }

  if (sources.reviewEventAts) {
    for (const at of sources.reviewEventAts) {
      if (Number.isFinite(at)) days.add(toDayKey(at));
    }
  }

  if (sources.extraDates) {
    for (const date of sources.extraDates) {
      if (date) days.add(date);
    }
  }

  return days;
}

export interface AttendanceCell {
  /** YYYY-MM-DD */
  date: string;
  active: boolean;
  /** 是否就是今天（界面上要给个环，方便定位） */
  isToday: boolean;
  /** 是否在今天之后（不该被算进出勤率分母） */
  isFuture: boolean;
  /** 1=周一 … 7=周日 */
  weekday: number;
}

export interface AttendanceWindow {
  cells: AttendanceCell[];
  /** 窗口内已过去的天数（含今天），作为出勤率分母 */
  elapsedDays: number;
  activeDays: number;
  /** 0–1。窗口刚开始时（elapsedDays 很小）不要急着显示百分比 */
  rate: number;
}

export interface AttendanceOptions {
  /** 统计窗口天数，默认 30 */
  days?: number;
  /** 判定「今天」的时刻，默认当前时间 */
  now?: number | Date;
}

/**
 * 生成最近 N 天的出勤窗口，按时间升序（最早 → 今天）。
 *
 * 注意窗口**包含今天**，且未来的格子会被标记而不是删掉——
 * 界面上留空位比「格子数忽多忽少」更容易读。
 */
export function buildAttendanceWindow(
  activeDays: ReadonlySet<string>,
  options: AttendanceOptions = {},
): AttendanceWindow {
  const days = Math.max(1, Math.floor(options.days ?? 30));
  const nowDate = options.now === undefined ? new Date() : new Date(options.now);
  const todayKey = toDayKey(nowDate);
  const todayStart = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
  ).getTime();

  const cells: AttendanceCell[] = [];
  let elapsedDays = 0;
  let activeCount = 0;

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - offset);
    const key = toDayKey(d);
    const isFuture = d.getTime() > todayStart;
    const isToday = key === todayKey;
    const active = !isFuture && activeDays.has(key);

    if (!isFuture) elapsedDays += 1;
    if (active) activeCount += 1;

    cells.push({
      date: key,
      active,
      isToday,
      isFuture,
      weekday: d.getDay() === 0 ? 7 : d.getDay(),
    });
  }

  return {
    cells,
    elapsedDays,
    activeDays: activeCount,
    rate: elapsedDays > 0 ? activeCount / elapsedDays : 0,
  };
}

/** 出勤率的展示口径：整数百分比，四舍五入，且不超过 100 */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  return `${Math.min(100, Math.round(rate * 100))}%`;
}

/**
 * 里程碑（原来的 6 枚徽章墙 → 现在只留 2 枚）
 *
 * 判定口径刻意用「窗口内出勤天数」，不用「连续天数」：
 * 用过一次就断的人，和坚持 21 天里漏了 2 天的人，后者更该被看见。
 */
export interface AttendanceMilestone {
  id: "sprout" | "steady";
  name: string;
  /** 需要的出勤天数 */
  target: number;
  unlocked: boolean;
  /** 进度 0–1，用于画一条细进度条 */
  progress: number;
  desc: string;
}

export function buildMilestones(
  window: AttendanceWindow,
  definitions: readonly {
    id: AttendanceMilestone["id"];
    name: string;
    target: number;
    desc: string;
  }[] = DEFAULT_MILESTONES,
): AttendanceMilestone[] {
  return definitions.map((def) => {
    const progress =
      def.target > 0 ? Math.min(1, window.activeDays / def.target) : 1;
    return {
      ...def,
      unlocked: window.activeDays >= def.target,
      progress,
    };
  });
}

export const DEFAULT_MILESTONES = [
  {
    id: "sprout",
    name: "起步",
    target: 7,
    desc: "近 30 天来过 7 天。",
  },
  {
    id: "steady",
    name: "稳定",
    target: 21,
    desc: "近 30 天来过 21 天。",
  },
] as const;
