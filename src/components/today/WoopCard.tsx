'use client';

/**
 * WOOP 意图卡（从 DashboardView 拆出 + 降级）
 *
 * 改造前：page.tsx 里有一段 effect，检测到当天没填 WOOP 就在 800ms 后
 * **强制弹出 4 个字段的弹窗**，不填挡住整个首屏。这是「两分钟启动」的头号杀手。
 *
 * 改造后三态：
 * 1. 已填 → 一张可以一眼读完的折叠卡（Wish + If-Then 两行），点「改」才进表单
 * 2. 没填但没提示过 → 一次性的行内邀请，两个按钮：「填写」/「跳过」
 * 3. 没填且已提示过 → 一行安静的灰字入口，不打扰
 *
 * 弹窗只由用户主动触发（点卡片、或 Cmd+K 里的 /woop）。
 * 表单状态放在子组件里、随弹窗挂载而初始化 —— 这样不需要
 * 「打开时同步一次表单」的 effect，也避免了输入到一半被记录回写覆盖。
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Sparkles, X, Plus, ChevronRight } from 'lucide-react';
import { upsertDailyRecord, type DailyRecord } from '@/lib/db';
import type { LearningSettings } from '@/lib/learning/types';

interface WoopCardProps {
  record: DailyRecord | undefined;
  currentDate: string;
  isModalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  settings: LearningSettings | null;
  onFirstPromptHandled: () => void;
}

export default function WoopCard({
  record,
  currentDate,
  isModalOpen,
  setModalOpen,
  settings,
  onFirstPromptHandled,
}: WoopCardProps) {
  const hasWoop = Boolean(record?.woopWish);
  const showGuide = !hasWoop && settings !== null && !settings.woopPromptedOnce;

  return (
    <>
      {hasWoop ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="surface-card w-full text-left p-4 hover:border-primary/40 transition-colors group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] uppercase tracking-widest font-mono text-text-secondary">
                  今日意图
                </span>
              </div>
              <p className="text-sm font-semibold text-text-primary truncate">
                {record?.woopWish}
              </p>
              {record?.woopPlan && (
                <p className="text-[11px] text-text-secondary mt-1 truncate font-mono">
                  {record.woopPlan}
                </p>
              )}
            </div>
            <span className="text-[10px] text-text-secondary group-hover:text-primary transition-colors flex-shrink-0 flex items-center gap-0.5 mt-1">
              改
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </button>
      ) : showGuide ? (
        <div className="p-4 rounded-xl bg-surface-1 border border-dashed border-border-subtle space-y-3">
          <div className="flex items-start gap-2">
            <Target className="w-3.5 h-3.5 text-text-secondary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-text-primary">
                定个今日意图
              </p>
              <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                填一句就够，不填也能开始。
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="btn btn-sm btn-primary"
            >
              填写
            </button>
            <button
              type="button"
              onClick={onFirstPromptHandled}
              className="btn btn-sm btn-soft"
            >
              跳过
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="surface-empty w-full flex items-center justify-between h-12 px-4 hover:!border-primary/40 text-text-secondary hover:text-text-primary transition-colors"
        >
          <span className="flex items-center gap-2 text-xs">
            <Plus className="w-3.5 h-3.5" />
            设定今日意图
            <span className="text-[10px] opacity-60">选填</span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
        </button>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <WoopFormModal
            record={record}
            currentDate={currentDate}
            onClose={() => setModalOpen(false)}
            onSaved={onFirstPromptHandled}
          />
        )}
      </AnimatePresence>
    </>
  );
}

interface WoopFormModalProps {
  record: DailyRecord | undefined;
  currentDate: string;
  onClose: () => void;
  onSaved: () => void;
}

/** 表单随弹窗挂载而初始化，不依赖 effect 回填 */
function WoopFormModal({
  record,
  currentDate,
  onClose,
  onSaved,
}: WoopFormModalProps) {
  const [wish, setWish] = useState(record?.woopWish || '');
  const [outcome, setOutcome] = useState(record?.woopOutcome || '');
  const [obstacle, setObstacle] = useState(record?.woopObstacle || '');
  const [plan, setPlan] = useState(record?.woopPlan || '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsertDailyRecord(currentDate, {
      woopWish: wish.trim(),
      woopOutcome: outcome.trim(),
      woopObstacle: obstacle.trim(),
      woopPlan: plan.trim(),
    });
    onSaved();
    onClose();
  };

  // portal 到 body：遮罩长在首页的 space-y 栈里会被塞 margin-bottom，
  // fixed 遮罩的 bottom:0 被顶上去，底栏下缘会从遮罩底下露出来（同 AddHabitModal 的教训）。
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[500px] bg-surface-1 border border-border-subtle rounded-xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h3 className="font-extrabold text-sm flex items-center gap-2 text-primary uppercase tracking-wider">
            <Target className="w-4 h-4" /> 设定今日意图
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSave}
          className="p-5 space-y-4 overflow-y-auto max-h-[70vh]"
        >
          {/* 一键伴写：老项目里最实用的一处辅助，保留 */}
          <div className="p-3 bg-surface-2/60 border border-border-subtle rounded-xl flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                填入示例
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setWish('写完 GrowthOS 今日闭环的交互');
                  setOutcome('跑通一遍，晚上能安心关电脑');
                  setObstacle('觉得逻辑繁杂，写一会想切出去刷手机');
                  setPlan('如果我想切出去刷手机，那就只留在编辑器里再写 3 行。');
                }}
                className="btn btn-xs btn-soft hover:!bg-primary/15 hover:!text-primary hover:!border-primary/40"
              >
                编码示例
              </button>
              <button
                type="button"
                onClick={() => {
                  setWish('复习完今天到期的卡片');
                  setOutcome('把今天学的点钉住，不用明天重来一遍');
                  setObstacle('看到卡片数量觉得累，产生拖延');
                  setPlan('如果我产生拖延，那就先只做最前面 1 张，做完可以停。');
                }}
                className="btn btn-xs btn-soft hover:!bg-primary/15 hover:!text-primary hover:!border-primary/40"
              >
                复习示例
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-primary">
              愿望 Wish
            </label>
            <input
              type="text"
              required
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              placeholder="今天最想推进的一件事"
              className="field"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-ai-blue">
              结果 Outcome
            </label>
            <input
              type="text"
              required
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="例：晚上能安心关电脑"
              className="field"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-amber-500">
              障碍 Obstacle
            </label>
            <input
              type="text"
              required
              value={obstacle}
              onChange={(e) => setObstacle(e.target.value)}
              placeholder="例：想刷手机"
              className="field"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">
              应对 If-Then
            </label>
            <textarea
              required
              rows={3}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="如果 [障碍]，那就 [2 分钟内能开始的动作]"
              className="field field-area !min-h-[80px] resize-none"
            />
          </div>

          <button
            type="submit"
            className="btn btn-md btn-primary w-full mt-2 uppercase tracking-widest"
          >
            保存
          </button>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
