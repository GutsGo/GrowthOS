/**
 * 项目实战（纯函数，可单测）
 *
 * 手册 4.2 的硬约束：**一周一个能展示的小项目**。
 * 「一周」不是建议，是数据结构——所以 `createProject` 把 `targetEndAt`
 * 固定在 startAt + 7 天，并且**不提供改成 30 天的参数**。
 * 想做长项目，做法是拆成四个一周项目，而不是把周期拉长。
 *
 * `pitfalls`（难题—解法）是这张表真正的价值：面试时讲不出故事，
 * 通常不是因为没做过事，是因为当时没记。这里强制「问题 + 解法」成对记录。
 */

import type {
  Project,
  ProjectMilestone,
  ProjectPitfall,
  ProjectStatus,
} from "./types";

const DAY_MS = 86_400_000;

/** 一个项目的硬周期：7 天 */
export const PROJECT_DEFAULT_DAYS = 7;

/** 空状态时的引导：手册第七章原话「第一个项目就是你手上这个学习工具本身」 */
export const FIRST_PROJECT_HINT = "GrowthOS 这次改造本身就是一个可展示的项目";

export interface ProjectInput {
  id: string;
  title: string;
  summary?: string;
  startAt?: number;
  /** 初始里程碑（可选）。只写标题，done 一律 false。 */
  milestones?: string[];
}

/**
 * 建一个项目。
 *
 * `targetEndAt` 由 startAt 决定，不接受外部传入——想改周期只能改 startAt。
 * 这是刻意的：允许传 targetEndAt，界面上迟早会出现「先定 30 天吧」，
 * 然后这个项目就永远不会完成。
 */
export function createProject(
  input: ProjectInput,
  now: number = Date.now(),
): Project {
  const startAt = input.startAt ?? now;
  return {
    id: input.id,
    title: input.title.trim(),
    status: "active",
    startAt,
    targetEndAt: startAt + PROJECT_DEFAULT_DAYS * DAY_MS,
    summary: input.summary?.trim() || undefined,
    milestones: (input.milestones ?? []).map((title, index) => ({
      id: `${input.id}-m${index + 1}`,
      title: title.trim(),
      done: false,
    })),
    pitfalls: [],
    createdAt: now,
  };
}

/** 里程碑的完成模板：新项目默认给三个，逼着人先想清楚「做完是什么样」 */
export const DEFAULT_MILESTONES = ["做出最小可用的版本", "自己用一遍并记录卡点", "写一段 300 字的说明"];

export interface ProjectProgress {
  done: number;
  total: number;
  /** 0–1；没有里程碑时为 0（不返回 NaN） */
  ratio: number;
}

export function projectProgress(project: Project): ProjectProgress {
  const total = project.milestones.length;
  const done = project.milestones.filter((m) => m.done).length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/** 剩余天数。向上取整：还剩 6 小时也算「1 天」，不能说「0 天」然后明天超期。 */
export function daysLeft(project: Project, now: number = Date.now()): number {
  return Math.ceil((project.targetEndAt - now) / DAY_MS);
}

export type ProjectTone = "done" | "paused" | "comfortable" | "tight" | "overdue";

export interface ProjectHealth {
  tone: ProjectTone;
  label: string;
}

/**
 * 项目健康度。
 *
 * 措辞刻意不用「危险」「警告」：一个自己给自己定的周项目，
 * 被系统用红灯警告，下次就不敢建了。这里只陈述事实。
 */
export function projectHealth(
  project: Project,
  now: number = Date.now(),
): ProjectHealth {
  if (project.status === "shipped") return { tone: "done", label: "已完成" };
  if (project.status === "archived") return { tone: "done", label: "已归档" };
  if (project.status === "paused") return { tone: "paused", label: "暂停中" };

  const left = daysLeft(project, now);
  if (left < 0) return { tone: "overdue", label: `超期 ${Math.abs(left)} 天` };
  if (left <= 1) return { tone: "tight", label: left === 0 ? "今天到期" : "还剩 1 天" };
  return { tone: "comfortable", label: `还剩 ${left} 天` };
}

export function createPitfall(
  problem: string,
  solution: string,
  id: string,
  now: number = Date.now(),
): ProjectPitfall {
  return {
    id,
    problem: problem.trim(),
    solution: solution.trim(),
    at: now,
  };
}

/**
 * 「难题—解法」→ 输出页的讲解题目。
 *
 * 这是把项目看板和费曼输出连起来的那根线：面试故事不是写出来的，
 * 是**讲**出来的。所以这里产出的是一个「要讲什么」的题目 + 一句话提示，
 * 剩下的话得用户自己讲。
 */
export function pitfallToStory(
  pitfall: ProjectPitfall,
  projectTitle: string,
): { concept: string; seed: string } {
  const problem = pitfall.problem.trim() || "一个没解决的问题";
  return {
    concept: `${projectTitle}：${problem.length > 24 ? `${problem.slice(0, 24)}…` : problem}`,
    seed: pitfall.solution.trim(),
  };
}

/** 进行中在前、超期在前；已完成沉底。看板上「今天该管哪个」一眼可见。 */
export function sortProjects(list: Project[]): Project[] {
  const statusWeight: Record<ProjectStatus, number> = {
    active: 0,
    paused: 1,
    shipped: 2,
    archived: 3,
  };
  return [...list].sort((a, b) => {
    const byStatus = statusWeight[a.status] - statusWeight[b.status];
    if (byStatus !== 0) return byStatus;
    // 同为进行中：截止早的在前
    return a.targetEndAt - b.targetEndAt;
  });
}

/** 追加里程碑（保持幂等：同标题不重复加） */
export function addMilestone(
  project: Project,
  title: string,
  id: string,
): ProjectMilestone[] {
  const clean = title.trim();
  if (!clean) return project.milestones;
  if (project.milestones.some((m) => m.title === clean)) return project.milestones;
  return [...project.milestones, { id, title: clean, done: false }];
}

/** 勾选/取消里程碑，返回整份新数组（不原地改，方便直接写库） */
export function toggleMilestone(
  milestones: ProjectMilestone[],
  milestoneId: string,
  now: number = Date.now(),
): ProjectMilestone[] {
  return milestones.map((m) => {
    if (m.id !== milestoneId) return m;
    return m.done
      ? { ...m, done: false, doneAt: undefined }
      : { ...m, done: true, doneAt: now };
  });
}

/**
 * 项目是否可以标记完成。
 *
 * 条件不是「所有里程碑都勾上」——真实项目总有被砍掉的部分。
 * 条件是「至少做过一个里程碑 + 至少记过一条难题」。
 * 后者才是这个项目能拿出去讲的原因。
 */
export function canShip(project: Project): { ok: boolean; reason?: string } {
  const { done } = projectProgress(project);
  if (done === 0) return { ok: false, reason: "还没有完成任何里程碑。" };
  if (project.pitfalls.length === 0) {
    return { ok: false, reason: "还没记任何「难题—解法」，这个项目现在讲不出故事。" };
  }
  return { ok: true };
}
