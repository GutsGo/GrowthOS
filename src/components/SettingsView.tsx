"use client";

import React, { useCallback, useState } from "react";
import {
  db,
  trackDeletion,
  type Card,
  type DailyRecord,
  type Habit,
  type HabitLog,
} from "@/lib/db";
import type { HabitCustomData } from "@/lib/habit-data";
import type { CardType } from "@/lib/learning/types";
import { clampNewCardLimit } from "@/lib/learning/queue";
import {
  updateLearningSettings,
  useLearningSettings,
} from "@/lib/learning/settings";
import { supabase } from "@/lib/supabase";
import { isMissingColumnError } from "@/lib/sync-errors";
import confetti from "canvas-confetti";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Database,
  Mail,
  CheckCircle,
  LogOut,
  Sparkles,
} from "lucide-react";
import AddHabitModal, {
  type NewHabitInput,
} from "@/components/settings/AddHabitModal";
import { HabitIcon } from "@/components/settings/habit-icons";
import { ENERGY_LABELS, FORM_TYPE_LABELS } from "@/lib/habit-labels";

// ---- Supabase 行形状 ----
// 只声明本文件真正读写的列，字段名保持 snake_case。
// 有了它，往 `HabitRow[]` 里 push 一个字面量时写错列名（比如 depends_on 写成 depend_on）
// 会当场编译报错，而不是同步「成功」之后才发现那一列永远是空的。
// 时间列写成 `string | Date`：往上推的时候给的是 Date（JSON 序列化后就是 ISO 串），
// 从云端读回来的是字符串，两种都要能接。

interface HabitRow {
  id: string;
  name: string;
  icon: string;
  frequency: Habit["frequency"];
  energy_demand: Habit["energyDemand"];
  order: number | null;
  depends_on: string | null;
  custom_form_type: NonNullable<Habit["customFormType"]> | null;
  updated_at: string | Date;
}

interface HabitLogRow {
  id: string;
  habit_id: string;
  date: string;
  custom_data: HabitCustomData | null;
  image_url: string | null;
  updated_at: string | Date;
}

interface CardRow {
  id: string;
  front: string;
  back: string;
  tags: string[] | null;
  linked_cards: string[] | null;
  reps: number;
  interval: number;
  /** NUMERIC 列，supabase-js 可能给 number 也可能给字符串 */
  ease: number | string;
  next_review: string | Date;
  /** v4 新增：卡片类型与例子。老云端表没有这两列，见 upsert 处的兜底 */
  type?: CardType | null;
  example?: string | null;
  updated_at: string | Date;
}

interface DailyRecordRow {
  date: string;
  woop_wish: string | null;
  woop_outcome: string | null;
  woop_obstacle: string | null;
  woop_plan: string | null;
  energy_level: number | null;
  review_questions: string[] | null;
  review_answers: string[] | null;
  review_completed_at: string | Date | null;
  ai_tasks: DailyRecord["aiTasks"] | null;
  updated_at: string | Date;
}

export default function SettingsView() {
  const habits = useLiveQuery(() => db.habits.toArray()) || [];

  // 学习闭环设置（每日新卡上限）。缺行时由 readLearningSettings 兜底为默认 2。
  const learningSettings = useLearningSettings();
  const newLimit = learningSettings?.dailyNewCardLimit ?? 2;
  const interleaving = learningSettings?.interleavingEnabled ?? true;

  // 表单状态
  // ---- 添加习惯弹窗 ----
  // 表单字段全部搬进 AddHabitModal。这里只留「开没开」和「第几次开」：
  // 每次打开把 seq +1，弹窗换 key 重挂载，state 天然回初始值，不用写重置。
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addSeq, setAddSeq] = useState(0);
  // 稳定引用：弹窗的 ESC / 滚动锁 effect 依赖 onClose，
  // 每次渲染都换个新函数会让它反复解绑重绑
  const closeAddHabit = useCallback(() => setIsAddOpen(false), []);

  // 云端同步与登录控制台状态
  const [email, setEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // 本地 Dexie 数据量实时统计
  const cardsCount = useLiveQuery(() => db.cards.count()) || 0;
  const habitsCount = habits.length;
  const logsCount = useLiveQuery(() => db.habitLogs.count()) || 0;
  const recordsCount = useLiveQuery(() => db.dailyRecords.count()) || 0;

  // 局部 Toast 悬浮通知提示
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: "success" | "error" }>({
    show: false,
    msg: "",
    type: "success",
  });

  /** 统一「弹出来 → N 秒后自动收起」。以前每个调用点各写一遍 setTimeout，漏一个就常驻。 */
  const showToast = (
    msg: string,
    type: "success" | "error" = "success",
    duration = 3000,
  ) => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), duration);
  };

  // 模拟发送魔法链接邮箱登录
  const handleSendMagicLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSendingLink(true);
    setTimeout(() => {
      setIsSendingLink(false);
      setIsLoggedIn(true);
      showToast("已登录", "success", 4000);
    }, 1500);
  };

  // 模拟双向云端 PostgreSQL 数据库同步
  const handleCloudSync = () => {
    if (!isLoggedIn) {
      showToast("未登录，无法同步", "error");
      return;
    }
    handleStartSync();
  };

  // 开始双向同步
  const handleStartSync = async () => {
    if (!isLoggedIn) {
      showToast("未登录，无法同步", "error");
      return;
    }

    if (!supabase) {
      showToast("未配置 Supabase 环境变量", "error", 4000);
      return;
    }

    setIsSyncing(true);
    /** 云端缺列导致题型没同步上去。用来在成功提示里补一句，而不是静默吞掉 */
    let missingCardColumns = false;

    try {
      // 步骤 1：同步原子习惯 (habits)
      setSyncStatusText("同步习惯…");
      const localHabits = await db.habits.toArray();
      const habitsDelLog = await db.deletedRecords.where("tableName").equals("habits").toArray();
      const habitsDelIds = new Set(habitsDelLog.map(d => d.id));
      
      const { data: cloudHabitsRaw, error: errHabits } = await supabase.from("supabase_habits").select("*");
      if (errHabits) throw errHabits;

      // 云端没建表 / 表是空的都会走到这里，`?? []` 让下面少一堆可选链
      const cloudHabits = (cloudHabitsRaw ?? []) as HabitRow[];
      
      const cloudHabitsMap = new Map(cloudHabits.map((c) => [c.id, c]));
      const localHabitsMap = new Map(localHabits.map(h => [h.id, h]));
      
      const habitsToCloud: HabitRow[] = [];
      const habitsToLocal: Habit[] = [];
      const habitsDeleteInCloud: string[] = [];

      localHabits.forEach(local => {
        const cloud = cloudHabitsMap.get(local.id);
        const localTime = new Date(local.updatedAt || local.createdAt).getTime();
        if (!cloud) {
          habitsToCloud.push({
            id: local.id,
            name: local.name,
            icon: local.icon,
            frequency: local.frequency,
            energy_demand: local.energyDemand,
            order: local.order || 0,
            depends_on: local.dependsOn || null,
            custom_form_type: local.customFormType || "none",
            updated_at: local.updatedAt || local.createdAt || new Date()
          });
        } else {
          const cloudTime = new Date(cloud.updated_at).getTime();
          if (localTime > cloudTime) {
            habitsToCloud.push({
              id: local.id,
              name: local.name,
              icon: local.icon,
              frequency: local.frequency,
              energy_demand: local.energyDemand,
              order: local.order || 0,
              depends_on: local.dependsOn || null,
              custom_form_type: local.customFormType || "none",
              updated_at: local.updatedAt || local.createdAt || new Date()
            });
          } else if (cloudTime > localTime) {
            habitsToLocal.push({
              id: cloud.id,
              name: cloud.name,
              icon: cloud.icon,
              frequency: cloud.frequency,
              energyDemand: cloud.energy_demand,
              order: cloud.order ?? undefined,
              dependsOn: cloud.depends_on ?? undefined,
              customFormType: cloud.custom_form_type ?? undefined,
              createdAt: new Date(cloud.updated_at),
              updatedAt: new Date(cloud.updated_at)
            });
          }
        }
      });

      cloudHabits.forEach(cloud => {
        const local = localHabitsMap.get(cloud.id);
        if (!local) {
          if (habitsDelIds.has(cloud.id)) {
            const delRec = habitsDelLog.find(d => d.id === cloud.id);
            const delTime = new Date(delRec?.deletedAt || 0).getTime();
            const cloudTime = new Date(cloud.updated_at).getTime();
            if (delTime > cloudTime) {
              habitsDeleteInCloud.push(cloud.id);
            } else {
              habitsToLocal.push({
                id: cloud.id,
                name: cloud.name,
                icon: cloud.icon,
                frequency: cloud.frequency,
                energyDemand: cloud.energy_demand,
                order: cloud.order ?? undefined,
                dependsOn: cloud.depends_on ?? undefined,
                customFormType: cloud.custom_form_type ?? undefined,
                createdAt: new Date(cloud.updated_at),
                updatedAt: new Date(cloud.updated_at)
              });
            }
          } else {
            habitsToLocal.push({
              id: cloud.id,
              name: cloud.name,
              icon: cloud.icon,
              frequency: cloud.frequency,
              energyDemand: cloud.energy_demand,
              order: cloud.order ?? undefined,
              dependsOn: cloud.depends_on ?? undefined,
              customFormType: cloud.custom_form_type ?? undefined,
              createdAt: new Date(cloud.updated_at),
              updatedAt: new Date(cloud.updated_at)
            });
          }
        }
      });

      if (habitsToCloud.length > 0) {
        const { error } = await supabase.from("supabase_habits").upsert(habitsToCloud);
        if (error) throw error;
      }
      if (habitsToLocal.length > 0) {
        await db.habits.bulkPut(habitsToLocal);
      }
      if (habitsDeleteInCloud.length > 0) {
        const { error } = await supabase.from("supabase_habits").delete().in("id", habitsDeleteInCloud);
        if (error) throw error;
      }

      // 步骤 2：同步打卡日志 (habitLogs)
      setSyncStatusText("同步打卡…");
      const localLogs = await db.habitLogs.toArray();
      const logsDelLog = await db.deletedRecords.where("tableName").equals("habitLogs").toArray();
      const logsDelIds = new Set(logsDelLog.map(d => d.id));
      
      const { data: cloudLogsRaw, error: errLogs } = await supabase.from("supabase_habit_logs").select("*");
      if (errLogs) throw errLogs;

      const cloudLogs = (cloudLogsRaw ?? []) as HabitLogRow[];
      
      const cloudLogsMap = new Map(cloudLogs.map((c) => [c.id, c]));
      const localLogsMap = new Map(localLogs.map(l => [l.id, l]));

      const logsToCloud: HabitLogRow[] = [];
      const logsToLocal: HabitLog[] = [];
      const logsDeleteInCloud: string[] = [];

      localLogs.forEach(local => {
        const cloud = cloudLogsMap.get(local.id);
        const localTime = new Date(local.updatedAt || local.createdAt).getTime();
        if (!cloud) {
          logsToCloud.push({
            id: local.id,
            habit_id: local.habitId,
            date: local.date,
            custom_data: local.customData || null,
            image_url: local.imageUrl || null,
            updated_at: local.updatedAt || local.createdAt || new Date()
          });
        } else {
          const cloudTime = new Date(cloud.updated_at).getTime();
          if (localTime > cloudTime) {
            logsToCloud.push({
              id: local.id,
              habit_id: local.habitId,
              date: local.date,
              custom_data: local.customData || null,
              image_url: local.imageUrl || null,
              updated_at: local.updatedAt || local.createdAt || new Date()
            });
          } else if (cloudTime > localTime) {
            logsToLocal.push({
              id: cloud.id,
              habitId: cloud.habit_id,
              date: cloud.date,
              customData: cloud.custom_data ?? undefined,
              imageUrl: cloud.image_url ?? undefined,
              createdAt: new Date(cloud.updated_at),
              updatedAt: new Date(cloud.updated_at)
            });
          }
        }
      });

      cloudLogs.forEach(cloud => {
        const local = localLogsMap.get(cloud.id);
        if (!local) {
          if (logsDelIds.has(cloud.id)) {
            const delRec = logsDelLog.find(d => d.id === cloud.id);
            const delTime = new Date(delRec?.deletedAt || 0).getTime();
            const cloudTime = new Date(cloud.updated_at).getTime();
            if (delTime > cloudTime) {
              logsDeleteInCloud.push(cloud.id);
            } else {
              logsToLocal.push({
                id: cloud.id,
                habitId: cloud.habit_id,
                date: cloud.date,
                customData: cloud.custom_data ?? undefined,
                imageUrl: cloud.image_url ?? undefined,
                createdAt: new Date(cloud.updated_at),
                updatedAt: new Date(cloud.updated_at)
              });
            }
          } else {
            logsToLocal.push({
              id: cloud.id,
              habitId: cloud.habit_id,
              date: cloud.date,
              customData: cloud.custom_data ?? undefined,
              imageUrl: cloud.image_url ?? undefined,
              createdAt: new Date(cloud.updated_at),
              updatedAt: new Date(cloud.updated_at)
            });
          }
        }
      });

      if (logsToCloud.length > 0) {
        const { error } = await supabase.from("supabase_habit_logs").upsert(logsToCloud);
        if (error) throw error;
      }
      if (logsToLocal.length > 0) {
        await db.habitLogs.bulkPut(logsToLocal);
      }
      if (logsDeleteInCloud.length > 0) {
        const { error } = await supabase.from("supabase_habit_logs").delete().in("id", logsDeleteInCloud);
        if (error) throw error;
      }

      // 步骤 3：同步记忆卡片 (cards)
      setSyncStatusText("同步闪卡…");
      const localCards = await db.cards.toArray();
      const cardsDelLog = await db.deletedRecords.where("tableName").equals("cards").toArray();
      const cardsDelIds = new Set(cardsDelLog.map(d => d.id));
      
      const { data: cloudCardsRaw, error: errCards } = await supabase.from("supabase_cards").select("*");
      if (errCards) throw errCards;

      const cloudCards = (cloudCardsRaw ?? []) as CardRow[];
      
      const cloudCardsMap = new Map(cloudCards.map((c) => [c.id, c]));
      const localCardsMap = new Map(localCards.map(c => [c.id, c]));

      const cardsToCloud: CardRow[] = [];
      const cardsToLocal: Card[] = [];
      const cardsDeleteInCloud: string[] = [];

      localCards.forEach(local => {
        const cloud = cloudCardsMap.get(local.id);
        const localTime = new Date(local.updatedAt || local.createdAt).getTime();
        if (!cloud) {
          cardsToCloud.push({
            id: local.id,
            front: local.front,
            back: local.back,
            tags: local.tags || [],
            linked_cards: local.linkedCards || [],
            reps: local.reps,
            interval: local.interval,
            ease: local.ease,
            next_review: local.nextReview || new Date(),
            // v4 的题型与例子。老云端表没有这两列，写入失败会走下面的降级重试
            type: local.type ?? null,
            example: local.example ?? null,
            updated_at: local.updatedAt || local.createdAt || new Date()
          });
        } else {
          const cloudTime = new Date(cloud.updated_at).getTime();
          if (localTime > cloudTime) {
            cardsToCloud.push({
              id: local.id,
              front: local.front,
              back: local.back,
              tags: local.tags || [],
              linked_cards: local.linkedCards || [],
              reps: local.reps,
              interval: local.interval,
              ease: local.ease,
              next_review: local.nextReview || new Date(),
              type: local.type ?? null,
              example: local.example ?? null,
              updated_at: local.updatedAt || local.createdAt || new Date()
            });
          } else if (cloudTime > localTime) {
            cardsToLocal.push({
              id: cloud.id,
              front: cloud.front,
              back: cloud.back,
              tags: cloud.tags || [],
              linkedCards: cloud.linked_cards || [],
              reps: cloud.reps,
              interval: cloud.interval,
              ease: Number(cloud.ease),
              nextReview: new Date(cloud.next_review),
              // 老云端表没有这两列时 cloud.type 是 undefined，等价于「没题型」
              type: cloud.type ?? undefined,
              example: cloud.example ?? undefined,
              createdAt: new Date(cloud.updated_at),
              updatedAt: new Date(cloud.updated_at)
            });
          }
        }
      });

      cloudCards.forEach(cloud => {
        const local = localCardsMap.get(cloud.id);
        if (!local) {
          if (cardsDelIds.has(cloud.id)) {
            const delRec = cardsDelLog.find(d => d.id === cloud.id);
            const delTime = new Date(delRec?.deletedAt || 0).getTime();
            const cloudTime = new Date(cloud.updated_at).getTime();
            if (delTime > cloudTime) {
              cardsDeleteInCloud.push(cloud.id);
            } else {
              cardsToLocal.push({
                id: cloud.id,
                front: cloud.front,
                back: cloud.back,
                tags: cloud.tags || [],
                linkedCards: cloud.linked_cards || [],
                reps: cloud.reps,
                interval: cloud.interval,
                ease: Number(cloud.ease),
                nextReview: new Date(cloud.next_review),
                createdAt: new Date(cloud.updated_at),
                updatedAt: new Date(cloud.updated_at)
              });
            }
          } else {
            cardsToLocal.push({
              id: cloud.id,
              front: cloud.front,
              back: cloud.back,
              tags: cloud.tags || [],
              linkedCards: cloud.linked_cards || [],
              reps: cloud.reps,
              interval: cloud.interval,
              ease: Number(cloud.ease),
              nextReview: new Date(cloud.next_review),
              // 老云端表没有这两列时 cloud.type 是 undefined，等价于「没题型」
              type: cloud.type ?? undefined,
              example: cloud.example ?? undefined,
              createdAt: new Date(cloud.updated_at),
              updatedAt: new Date(cloud.updated_at)
            });
          }
        }
      });

      if (cardsToCloud.length > 0) {
        const { error } = await supabase.from("supabase_cards").upsert(cardsToCloud);
        if (error && isMissingColumnError(error)) {
          /*
           * 云端表还是 v1 结构（没跑 20261027000000 那个迁移）。
           * 把 type/example 摘掉再推一次：题型丢了可以补，整次同步失败会连
           * 正反面和复习进度都传不上去 —— 那才是真的丢数据。
           */
          const legacyRows = cardsToCloud.map((row) => {
            const { type: _type, example: _example, ...rest } = row;
            return rest;
          });
          const retry = await supabase.from("supabase_cards").upsert(legacyRows);
          if (retry.error) throw retry.error;
          console.warn(
            "[sync] 云端 supabase_cards 缺少 type/example 列，本次已跳过题型同步。" +
              "执行 supabase/migrations/20261027000000_add_card_type_example.sql 后可恢复。",
          );
          missingCardColumns = true;
        } else if (error) {
          throw error;
        }
      }
      if (cardsToLocal.length > 0) {
        await db.cards.bulkPut(cardsToLocal);
      }
      if (cardsDeleteInCloud.length > 0) {
        const { error } = await supabase.from("supabase_cards").delete().in("id", cardsDeleteInCloud);
        if (error) throw error;
      }

      // 步骤 4：同步每日意图 (dailyRecords)
      setSyncStatusText("同步意图…");
      const localRecords = await db.dailyRecords.toArray();
      
      const { data: cloudRecordsRaw, error: errRecords } = await supabase.from("supabase_daily_records").select("*");
      if (errRecords) throw errRecords;

      const cloudRecords = (cloudRecordsRaw ?? []) as DailyRecordRow[];

      const cloudRecordsMap = new Map(cloudRecords.map((c) => [c.date, c]));
      const recordsToCloud: DailyRecordRow[] = [];
      const recordsToLocal: DailyRecord[] = [];

      localRecords.forEach(local => {
        const cloud = cloudRecordsMap.get(local.date);
        const localTime = new Date(local.updatedAt || local.createdAt).getTime();
        if (!cloud) {
          recordsToCloud.push({
            date: local.date,
            woop_wish: local.woopWish || null,
            woop_outcome: local.woopOutcome || null,
            woop_obstacle: local.woopObstacle || null,
            woop_plan: local.woopPlan || null,
            energy_level: local.energyLevel || 5,
            review_questions: local.reviewQuestions || [],
            review_answers: local.reviewAnswers || [],
            review_completed_at: local.reviewCompletedAt || null,
            ai_tasks: local.aiTasks || null,
            updated_at: local.updatedAt || local.createdAt || new Date()
          });
        } else {
          const cloudTime = new Date(cloud.updated_at).getTime();
          if (localTime > cloudTime) {
            recordsToCloud.push({
              date: local.date,
              woop_wish: local.woopWish || null,
              woop_outcome: local.woopOutcome || null,
              woop_obstacle: local.woopObstacle || null,
              woop_plan: local.woopPlan || null,
              energy_level: local.energyLevel || 5,
              review_questions: local.reviewQuestions || [],
              review_answers: local.reviewAnswers || [],
              review_completed_at: local.reviewCompletedAt || null,
              ai_tasks: local.aiTasks || null,
              updated_at: local.updatedAt || local.createdAt || new Date()
            });
          } else if (cloudTime > localTime) {
            recordsToLocal.push({
              date: cloud.date,
              woopWish: cloud.woop_wish || undefined,
              woopOutcome: cloud.woop_outcome || undefined,
              woopObstacle: cloud.woop_obstacle || undefined,
              woopPlan: cloud.woop_plan || undefined,
              energyLevel: cloud.energy_level ?? undefined,
              reviewQuestions: cloud.review_questions || undefined,
              reviewAnswers: cloud.review_answers || undefined,
              reviewCompletedAt: cloud.review_completed_at ? new Date(cloud.review_completed_at) : undefined,
              aiTasks: cloud.ai_tasks || undefined,
              createdAt: new Date(cloud.updated_at),
              updatedAt: new Date(cloud.updated_at)
            });
          }
        }
      });

      cloudRecords.forEach(cloud => {
        const local = localRecords.find(r => r.date === cloud.date);
        if (!local) {
          recordsToLocal.push({
            date: cloud.date,
            woopWish: cloud.woop_wish || undefined,
            woopOutcome: cloud.woop_outcome || undefined,
            woopObstacle: cloud.woop_obstacle || undefined,
            woopPlan: cloud.woop_plan || undefined,
            energyLevel: cloud.energy_level ?? undefined,
            reviewQuestions: cloud.review_questions || undefined,
            reviewAnswers: cloud.review_answers || undefined,
            reviewCompletedAt: cloud.review_completed_at ? new Date(cloud.review_completed_at) : undefined,
            aiTasks: cloud.ai_tasks || undefined,
            createdAt: new Date(cloud.updated_at),
            updatedAt: new Date(cloud.updated_at)
          });
        }
      });

      if (recordsToCloud.length > 0) {
        const { error } = await supabase.from("supabase_daily_records").upsert(recordsToCloud);
        if (error) throw error;
      }
      if (recordsToLocal.length > 0) {
        await db.dailyRecords.bulkPut(recordsToLocal);
      }

      // 同步完成，清空本地已同步的删除日志记录表
      await db.deletedRecords.clear();

      setIsSyncing(false);
      const now = new Date();
      setLastSyncTime(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      );

      // 触发 Confetti 全屏纸屑粒子动效
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });

      const totalItemsSynced = habitsToCloud.length + habitsToLocal.length + 
                               logsToCloud.length + logsToLocal.length + 
                               cardsToCloud.length + cardsToLocal.length + 
                               recordsToCloud.length + recordsToLocal.length;

      showToast(
        missingCardColumns
          ? `已同步 ${totalItemsSynced} 项。云端缺 type/example 列，题型未同步。`
          : `已同步 ${totalItemsSynced} 项`,
        "success",
        4000,
      );

    } catch (e) {
      console.error("Supabase 同步异常:", e);
      setIsSyncing(false);
      showToast(
        `同步失败：${e instanceof Error ? e.message : "连接超时，或建表 SQL 缺失"}`,
        "error",
        5000,
      );
    }
  };

  // 注销登录
  const handleLogout = () => {
    setIsLoggedIn(false);
    setEmail("");
    setLastSyncTime(null);
    showToast("已退出，本地数据保留。");
  };

  // 添加习惯：弹窗只负责收集，落库、关闭、提示在这里
  const handleCreateHabit = async (input: NewHabitInput) => {
    const order = await db.habits.count();

    await db.habits.add({
      id: crypto.randomUUID(),
      name: input.name,
      icon: input.icon,
      frequency: "daily",
      energyDemand: input.energyDemand,
      dependsOn: input.dependsOn,
      customFormType: input.customFormType,
      order,
      createdAt: new Date(),
    });

    setIsAddOpen(false);
    showToast(`已添加「${input.name}」`);
  };

  // 打开添加弹窗：seq +1 → 弹窗换 key 重挂载，上次没提交的输入不会粘过来
  const openAddHabit = () => {
    setAddSeq((n) => n + 1);
    setIsAddOpen(true);
  };

  // 删除习惯
  const handleDeleteHabit = async (id: string) => {
    if (confirm("确定删除这个习惯？打卡记录会保留。")) {
      await db.habits.delete(id);
      await trackDeletion("habits", id);
    }
  };

  return (
    <div className="page-scroll">
      <div className="page-shell space-y-6">
      {/* 顶部 Header：形状与其它五个页面一致（眉标 / 标题 / 一句说明），不放任何操作按钮 ——
          「添加习惯」只作用于习惯分区，绑在页标题上会让人以为是页面级动作。 */}
      <header>
        <p className="eyebrow">System Preferences</p>
        <h1 className="page-title mt-1">设置</h1>
        <p className="page-sub">
          习惯、配额与云端同步。
        </p>
      </header>

      {/* 分区一的组标题：三个分区现在共用同一形状 ——
          外部 section-heading + 一句描述 + 右侧元信息/操作，卡片内容不带组级标题。
          原先这块没有组标题，两张卡片内部各有一个小标题，滚动扫过时不知道它们是一组。 */}
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="section-heading">
            学习设置
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            复习队列的两个旋钮，改完立刻生效。
          </p>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="surface-card p-5 flex flex-col gap-4">
          <div className="space-y-1 flex-1">
            {/* 卡片内的控件名，比组标题低一级，不用 section-heading 免得混淆 */}
            <h3 className="text-sm font-semibold text-text-primary">
              每日新卡上限
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              一天最多放几张新卡进复习队列。超出的顺延到明天。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                updateLearningSettings({
                  dailyNewCardLimit: clampNewCardLimit(newLimit - 1),
                })
              }
              className="btn btn-sm btn-soft !w-8 !px-0 font-bold"
              aria-label="减少"
            >
              −
            </button>
            <span className="w-10 text-center font-mono font-bold text-lg text-primary tnum">
              {newLimit}
            </span>
            <button
              type="button"
              onClick={() =>
                updateLearningSettings({
                  dailyNewCardLimit: clampNewCardLimit(newLimit + 1),
                })
              }
              className="btn btn-sm btn-soft !w-8 !px-0 font-bold"
              aria-label="增加"
            >
              +
            </button>
            <span className="text-[10px] text-neutral-gray font-mono ml-1">
              张 / 天
            </span>
          </div>
        </section>

        {/* 交错练习：不是新功能，是「下一张是哪张」的排序策略 */}
        <section className="surface-card p-5 flex flex-col gap-4">
          <div className="space-y-1 flex-1">
            <h3 className="text-sm font-semibold text-text-primary">
              交错练习
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              把不同题型混着排。关闭后回到「先到期、后新卡」。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                void updateLearningSettings({ interleavingEnabled: !interleaving })
              }
              role="switch"
              aria-checked={interleaving}
              aria-label="交错练习"
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                interleaving ? "bg-primary" : "bg-surface-3"
              }`}
              title={interleaving ? "关闭" : "开启"}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-primary-text shadow-sm transition-all ${
                  interleaving ? "left-[26px]" : "left-0.5"
                }`}
              />
            </button>
            {/* 光一个开关看不出当前是什么状态，补一行字 */}
            <span className="text-[10px] font-mono text-text-secondary">
              {interleaving ? "已开启" : "已关闭"}
            </span>
          </div>
        </section>
      </div>
      </section>

      {/* 原子习惯：全宽两列。
          原来它只占 3/5 宽，480px 一行只放得下一个名字 + 一串标签，
          横向空间白扔；习惯本来就只有几个，两列排完不用滚。
          「添加习惯」按钮从页标题挪到这里 —— 操作跟着它作用的分区走。 */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="section-heading">
              原子习惯
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed">
              能量阻力越低越容易被推荐，前置习惯没打卡则不会解锁这一件。
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 pb-0.5">
            <span className="text-[10px] font-mono text-text-secondary tnum">
              {habits.length} 个
            </span>
            <button
              type="button"
              onClick={openAddHabit}
              className="btn btn-sm btn-primary"
            >
              <Plus className="w-3.5 h-3.5" />
              添加习惯
            </button>
          </div>
        </div>

        {/* 习惯列表展示 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {habits.length === 0 ? (
              <div className="surface-empty md:col-span-2 flex flex-col items-center gap-3 py-9 text-center">
                <p className="text-xs text-text-secondary">
                  还没有习惯。先加一件小到不可能失败的事。
                </p>
                <button
                  type="button"
                  onClick={openAddHabit}
                  className="btn btn-sm btn-secondary"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加第一个习惯
                </button>
              </div>
            ) : (
              [...habits].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((habit) => {
                const parentHabit = habits.find((h) => h.id === habit.dependsOn);
                return (
                  <div
                    key={habit.id}
                    className="surface-card flex items-start justify-between gap-3 p-4 hover:!border-text-secondary transition-colors duration-150"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center text-primary flex-shrink-0">
                        <HabitIcon name={habit.icon} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {habit.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {/* 存的还是 low/medium/high，显示成和弹窗里同一套中文，
                              否则「选了中等、列表写 medium」像是两件事 */}
                          <span className="text-[10px] text-text-secondary font-mono">
                            能量 · {ENERGY_LABELS[habit.energyDemand ?? "medium"]}
                          </span>
                          {parentHabit && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-500 font-mono px-1.5 py-0.5 rounded border border-amber-500/20">
                              前置：{parentHabit.name}
                            </span>
                          )}
                          {habit.customFormType && habit.customFormType !== "none" && (
                            <span className="text-[9px] bg-ai-blue/10 text-ai-blue font-mono px-1.5 py-0.5 rounded border border-ai-blue/20">
                              {FORM_TYPE_LABELS[habit.customFormType]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteHabit(habit.id)}
                      aria-label={`删除 ${habit.name}`}
                      className="btn btn-sm btn-ghost !w-8 !px-0 hover:!text-error flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
        </div>
      </section>

      {/* 云端同步：全宽一卡两栏 —— 左边「你是谁」，右边「有多少东西要传」。
          原先是右栏里一条竖长清单，在 840 的容器里被压到 300px 宽，
          四项数据挤成 2×2 的小方块，同步按钮还得滚下去才看得见。 */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="section-heading">
              云端同步
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed">
              数据先落在本地，登录后手动推送上云。
            </p>
          </div>
          <span className="text-[9px] bg-primary/10 text-primary font-bold font-mono px-1.5 py-0.5 rounded uppercase flex-shrink-0 pb-0.5">
            Local-First
          </span>
        </div>

        <div className="surface-card p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* 左：登录态 */}
          <div className="space-y-3">
            {isLoggedIn ? (
              <div className="flex items-center justify-between gap-3 p-3 bg-surface-2 rounded-[8px] border border-border-subtle">
                <div className="flex items-center gap-2 text-xs min-w-0">
                  <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-text-primary font-semibold truncate">
                    {email || "GrowthOS 用户"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn btn-xs btn-ghost !px-2 hover:!text-error flex-shrink-0"
                >
                  <LogOut className="w-3 h-3" /> 注销
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendMagicLink} className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 relative flex items-center">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      aria-label="登录邮箱"
                      className="field !h-9 !pl-7 !pr-3 font-mono"
                    />
                    <Mail className="w-3.5 h-3.5 text-neutral-gray absolute left-2" />
                  </div>
                  <button
                    type="submit"
                    disabled={isSendingLink}
                    className="btn btn-sm btn-primary uppercase tracking-wider"
                  >
                    {isSendingLink ? (
                      <span className="w-3 h-3 border-2 border-current/20 border-t-current rounded-full animate-spin" />
                    ) : "登录"}
                  </button>
                </div>
                <p className="text-[10px] text-text-secondary leading-relaxed">
                  输入邮箱发送登录链接。登录后才会往云端写。
                </p>
              </form>
            )}
          </div>

          {/* 右：本地数据盘点 + 同步 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
              <span>本地数据</span>
              <span className="text-text-primary font-bold tnum">
                共 {habitsCount + logsCount + cardsCount + recordsCount} 项
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[9px] text-text-secondary font-mono">
              {[
                { label: "习惯", value: habitsCount },
                { label: "打卡", value: logsCount },
                { label: "闪卡", value: cardsCount },
                { label: "意图", value: recordsCount },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-surface-2 px-2 py-1.5 rounded-[8px] border border-border-subtle flex justify-between"
                >
                  <span>{item.label}</span>
                  <span className="text-text-primary font-bold tnum">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            {isSyncing ? (
              <div className="py-2 space-y-2">
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden relative">
                  <div className="absolute top-0 bottom-0 left-0 bg-primary w-2/3 rounded-full animate-pulse" />
                </div>
                <p className="text-[9px] text-primary font-mono animate-pulse">
                  {syncStatusText}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCloudSync}
                className="btn btn-sm btn-soft w-full uppercase tracking-wider"
              >
                <Database className="w-3.5 h-3.5" />
                <span>同步到云端</span>
              </button>
            )}

            {lastSyncTime && (
              <div className="text-[9px] text-neutral-gray text-right font-mono">
                上次同步：{lastSyncTime}
              </div>
            )}
          </div>
        </div>
        </div>
      </section>

      {/* 添加习惯弹窗：条件渲染 + key，每次打开都是全新实例，
          上次没提交的输入不会粘过来 */}
      {isAddOpen && (
        <AddHabitModal
          key={addSeq}
          habits={habits}
          onClose={closeAddHabit}
          onSubmit={handleCreateHabit}
        />
      )}

      {/* Toast 提示通知层。
          桌面贴在左下角；移动端抬到 bottom-20（底部导航 h-16 之上）并居中，
          否则提示会被导航栏吃掉半截。 */}
      <div className="fixed inset-x-0 bottom-20 md:inset-x-auto md:left-6 md:bottom-6 z-50 flex justify-center md:justify-start px-4 md:px-0 pointer-events-none">
        <AnimatePresence>
          {toast.show && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className={`px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 font-mono max-w-full ${
                toast.type === "success"
                  ? "bg-surface-1 border-primary/40 text-primary shadow-[0_0_15px_rgba(29,185,84,0.2)]"
                  : "bg-surface-1 border-error/40 text-error shadow-[0_0_15px_rgba(239,68,68,0.2)]"
              }`}
            >
              <Sparkles className="w-4 h-4 text-primary animate-pulse flex-shrink-0" />
              <span>{toast.msg}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
}
