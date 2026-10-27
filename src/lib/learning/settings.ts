"use client";

/**
 * 学习设置读写层
 *
 * 三个必须处理的现实情况：
 * 1. **行可能不存在**。v4 迁移只对「执行过迁移」的用户写了默认行；
 *    没跑过迁移、或者用户清过库，读出来就是 undefined。所有读取都必须兜底。
 * 2. **写入要合并**。设置是单行表，只改一个字段不能把别的字段抹掉。
 * 3. **UI 要响应式**。改完设置，今日门禁的配额要立刻变，不能等刷新。
 *
 * 所以这里只暴露三个口子：readLearningSettings / updateLearningSettings / useLearningSettings。
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  DEFAULT_LEARNING_SETTINGS,
  SETTINGS_ROW_ID,
  type LearningSettings,
} from "./types";
import { clampNewCardLimit } from "./queue";

/** 读取设置；缺行 / 脏值时逐字段回落到默认值。永不抛错。 */
export async function readLearningSettings(): Promise<LearningSettings> {
  try {
    const row = await db.settings.get(SETTINGS_ROW_ID);
    return normalizeSettings(row);
  } catch {
    return { ...DEFAULT_LEARNING_SETTINGS };
  }
}

/** 把库里可能残缺的行补齐成完整设置 */
export function normalizeSettings(
  row: Partial<LearningSettings> | undefined,
): LearningSettings {
  if (!row) return { ...DEFAULT_LEARNING_SETTINGS };
  return {
    id: SETTINGS_ROW_ID,
    dailyNewCardLimit: clampNewCardLimit(
      row.dailyNewCardLimit ?? DEFAULT_LEARNING_SETTINGS.dailyNewCardLimit,
    ),
    ritualDismissed: Boolean(
      row.ritualDismissed ?? DEFAULT_LEARNING_SETTINGS.ritualDismissed,
    ),
    woopPromptedOnce: Boolean(
      row.woopPromptedOnce ?? DEFAULT_LEARNING_SETTINGS.woopPromptedOnce,
    ),
    interleavingEnabled:
      typeof row.interleavingEnabled === "boolean"
        ? row.interleavingEnabled
        : DEFAULT_LEARNING_SETTINGS.interleavingEnabled,
    ifThenCue:
      typeof row.ifThenCue === "string" ? row.ifThenCue : undefined,
    restReminderMinutes:
      typeof row.restReminderMinutes === "number" &&
      Number.isFinite(row.restReminderMinutes)
        ? Math.max(0, Math.floor(row.restReminderMinutes))
        : 0,
    updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : undefined,
  };
}

/** 局部更新设置，其余字段保持不变 */
export async function updateLearningSettings(
  patch: Partial<Omit<LearningSettings, "id">>,
): Promise<LearningSettings> {
  const current = await readLearningSettings();
  const next = normalizeSettings({ ...current, ...patch });
  const row: LearningSettings = {
    ...next,
    id: SETTINGS_ROW_ID,
    updatedAt: Date.now(),
  };
  await db.settings.put(row);
  return row;
}

/** 响应式读取。返回 null 表示「还在读」，调用方要能处理这个瞬间。 */
export function useLearningSettings(): LearningSettings | null {
  const settings = useLiveQuery(() => readLearningSettings(), []);
  return settings ?? null;
}
