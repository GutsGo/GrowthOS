"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Check, Plus, X } from "lucide-react";
import type { Habit } from "@/lib/db";
import {
  ENERGY_LABELS,
  ENERGY_ORDER,
  FORM_TYPE_LABELS,
  FORM_TYPE_ORDER,
  type EnergyDemand,
  type HabitFormType,
} from "@/lib/habit-labels";
import { HABIT_ICON_OPTIONS, HabitIcon } from "./habit-icons";

/**
 * 新建习惯要收集的字段。
 * id / order / createdAt 由调用方补 —— 弹窗不碰数据库，只负责收集。
 */
export interface NewHabitInput {
  name: string;
  icon: string;
  energyDemand: EnergyDemand;
  dependsOn?: string;
  customFormType: HabitFormType;
}

interface AddHabitModalProps {
  /** 已有习惯，只用于「前置习惯」下拉 */
  habits: Habit[];
  onClose: () => void;
  onSubmit: (input: NewHabitInput) => void | Promise<void>;
}

/**
 * 「添加习惯」弹窗。
 *
 * 为什么是弹窗而不是常驻表单：添加习惯是**一次性配置**，一辈子做几次；
 * 而它原本占着设置页右栏一整块常驻面积，导致每次进设置页都要先扫过
 * 5 个字段和 6 个 chip 才能看到真正天天要用的东西（同步、配额）。
 * 低频操作不该有常驻版位。
 *
 * 表单状态不做重置逻辑：由父级条件渲染 + 每次打开换 key，
 * 组件直接重挂载，所有 state 天然回初始值（同 SpecializedRecordModal 的处理）。
 */
export default function AddHabitModal({
  habits,
  onClose,
  onSubmit,
}: AddHabitModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(HABIT_ICON_OPTIONS[0].name);
  const [energyDemand, setEnergyDemand] =
    useState<NewHabitInput["energyDemand"]>("medium");
  const [dependsOn, setDependsOn] = useState("");
  const [customFormType, setCustomFormType] =
    useState<NewHabitInput["customFormType"]>("none");
  const [submitting, setSubmitting] = useState(false);

  // ESC 关闭 + 锁背景滚动（设置页本身是可滚动的 .page-scroll，
  // 不锁的话滚轮会穿透到背后的列表上，看着像弹窗在抖）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    await onSubmit({
      name: name.trim(),
      icon,
      energyDemand,
      dependsOn: dependsOn || undefined,
      customFormType,
    });
    // 成功后父级会 close 并把本组件卸载，这里不再 setState
  };

  return createPortal(
    // 居中 + 四周 p-4 留边，与首页「设定今日意图」弹窗同一形状。
    // 以前移动端做成贴底抽屉（items-end + pb-16）想躲开底部导航，
    // 结果弹窗悬在底栏上方 64px —— 看着像遮罩没盖到底、又没有横向边距。
    // 居中方案里弹窗底边距视口约 64px，正好让开底栏；遮罩（z-50）全屏覆盖含底栏。
    //
    // 为什么 portal 到 body：遮罩以前长在 page-shell（space-y-6）里，
    // space-y 给每个非末尾子元素塞 24px margin-bottom，fixed 元素也照吃 ——
    // bottom:0 被顶成「视口底往上 24px」，底栏下半截从遮罩底下露出来。
    // portal 出去后遮罩不属于任何 space-y 栈，也免疫未来祖先的 transform 陷阱。
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      {/* 遮罩点击关闭 */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-habit-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", duration: 0.35 }}
        className="relative z-10 w-full max-w-[520px] max-h-[85vh] flex flex-col bg-surface-1 border border-border-subtle rounded-xl shadow-2xl overflow-hidden"
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Plus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="add-habit-title" className="section-heading">
                添加习惯
              </h3>
              <p className="text-[11px] text-text-secondary mt-0.5">
                小到不可能失败的那种
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="btn btn-sm btn-ghost !w-8 !px-0 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          id="add-habit-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
        >
          {/* 习惯名称 */}
          <div className="space-y-1.5">
            <label
              htmlFor="habit-name"
              className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono"
            >
              习惯名称
            </label>
            <input
              id="habit-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：早起半小时晨读"
              className="field"
            />
          </div>

          {/* 图标 */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono block">
              图标
            </span>
            <div className="grid grid-cols-4 gap-2">
              {HABIT_ICON_OPTIONS.map((option) => {
                const isSelected = icon === option.name;
                return (
                  <button
                    key={option.name}
                    type="button"
                    onClick={() => setIcon(option.name)}
                    aria-pressed={isSelected}
                    className={`flex flex-col items-center justify-center gap-1 h-12 rounded-[8px] border transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border-subtle bg-surface-2 text-text-secondary hover:border-text-secondary"
                    }`}
                  >
                    <HabitIcon name={option.name} />
                    <span className="text-[8px] font-sans">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 能量阻力 */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono block">
              能量阻力
            </span>
            <div className="grid grid-cols-3 gap-2">
              {ENERGY_ORDER.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setEnergyDemand(level)}
                  className={`chip !h-8 !w-full !px-1 !text-[10px] ${
                    energyDemand === level ? "chip-active" : ""
                  }`}
                >
                  {ENERGY_LABELS[level]}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-gray leading-relaxed">
              能量低的日子，系统只推荐「轻松」这一档。
            </p>
          </div>

          {/* 记录表单 */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono block">
              记录表单
            </span>
            <div className="grid grid-cols-3 gap-2">
              {FORM_TYPE_ORDER.map((formType) => (
                <button
                  key={formType}
                  type="button"
                  onClick={() => setCustomFormType(formType)}
                  className={`chip !h-8 !w-full ${
                    customFormType === formType ? "chip-active" : ""
                  }`}
                >
                  {FORM_TYPE_LABELS[formType]}
                </button>
              ))}
            </div>
          </div>

          {/* 前置习惯。列表为空时整块不渲染 —— 一个只有「无」的下拉框就是个摆设 */}
          {habits.length > 0 && (
            <div className="space-y-1.5">
              <label
                htmlFor="habit-depends-on"
                className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono block"
              >
                前置习惯
              </label>
              <select
                id="habit-depends-on"
                value={dependsOn}
                onChange={(e) => setDependsOn(e.target.value)}
                className="field font-mono"
              >
                <option value="">无</option>
                {habits.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-neutral-gray leading-relaxed">
                接在别人后面：前一件没打卡，这件不会被推荐。
              </p>
            </div>
          )}
        </form>

        {/* 底栏 */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-border-subtle flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-md btn-secondary"
          >
            取消
          </button>
          {/* form 在滚动区里，按钮在外层（滚到底才看得到提交很烦）。
              用 form="..." 把两者关联，回车提交和点按钮走同一条路径。 */}
          <button
            type="submit"
            form="add-habit-form"
            disabled={!name.trim() || submitting}
            className="btn btn-md btn-primary flex-1"
          >
            <Check className="w-4 h-4" />
            {submitting ? "保存中…" : "保存习惯"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
