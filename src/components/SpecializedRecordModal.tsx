"use client";

import React, { useState, useRef } from "react";
import { Habit } from "@/lib/db";
import { MOOD_LABELS, type HabitCustomData } from "@/lib/habit-data";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Trash2,
  Upload,
  Camera,
  Dumbbell,
  Users,
  Check,
} from "lucide-react";

interface SetData {
  setNum: number;
  weight: number;
  reps: number;
}

interface SpecializedRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  habit: Habit | null;
  onSave: (customData: HabitCustomData, imageUrl?: string) => void;
}

export default function SpecializedRecordModal({
  isOpen,
  onClose,
  habit,
  onSave,
}: SpecializedRecordModalProps) {
  // 1. 健身表单状态
  const [sets, setSets] = useState<SetData[]>([{ setNum: 1, weight: 40, reps: 10 }]);
  const [fitnessMood, setFitnessMood] = useState<"great" | "good" | "tired">("good");
  const [fitnessNotes, setFitnessNotes] = useState("");

  // 2. 社交表单状态
  const [socialContact, setSocialContact] = useState("");
  const [socialTopic, setSocialTopic] = useState("");
  const [socialReflect, setSocialReflect] = useState("");
  const [socialFollowUp, setSocialFollowUp] = useState("");

  // 3. 凭证图片上传状态 (可选)
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
   * 这里原本有一个 useEffect：isOpen / habit 变化时把 9 个 state 重置回初始值。
   *
   * 那是「把 props 的变化同步进 state」，React 明确不建议这么写——
   * 每次打开都要多渲染一轮，而且 9 个字段只要漏写一个就是「上次的输入
   * 粘到了这次」。改成由 HabitGrid 传 key（见那边的注释），
   * 习惯一换组件直接重挂载，所有 state 天然回到初始值，不可能漏。
   */

  if (!isOpen || !habit) return null;

  const isFitness = habit.customFormType === "fitness";

  // 添加一组健身数据
  const handleAddSet = () => {
    setSets((prev) => [
      ...prev,
      {
        setNum: prev.length + 1,
        weight: prev[prev.length - 1]?.weight || 40,
        reps: prev[prev.length - 1]?.reps || 10,
      },
    ]);
  };

  // 删除某一组健身数据
  const handleRemoveSet = (index: number) => {
    if (sets.length === 1) return; // 至少保留一组
    const newSets = sets
      .filter((_, idx) => idx !== index)
      .map((set, idx) => ({ ...set, setNum: idx + 1 }));
    setSets(newSets);
  };

  // 修改健身数据中特定组的内容
  const handleSetChange = (index: number, key: "weight" | "reps", val: number) => {
    setSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: val };
      return next;
    });
  };

  // 处理图片压缩及 Base64 降级读取
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 限制 4MB
    if (file.size > 4 * 1024 * 1024) {
      alert("图片不能超过 4MB");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      
      // 使用 canvas 进行轻量级 Web 压缩，减少 IndexedDB 存储压力
      const img = new Image();
      img.src = base64String;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 600; // 离线凭证不需要超高清，600px 宽度足够
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        // 输出为压缩后的 jpeg
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        setImagePreview(compressedBase64);
        setIsUploading(false);
      };
    };
    reader.readAsDataURL(file);
  };

  // 提交特化数据表单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let customData: HabitCustomData = {};
    if (isFitness) {
      customData = {
        sets,
        mood: fitnessMood,
        notes: fitnessNotes,
      };
    } else {
      customData = {
        contact: socialContact,
        topic: socialTopic,
        reflect: socialReflect,
        followUp: socialFollowUp,
      };
    }

    // 调用保存，并传递可选的本地图片 Base64 (imageUrl)
    onSave(customData, imagePreview || undefined);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        {/* 背景遮罩点击关闭 */}
        <div className="absolute inset-0 cursor-default" onClick={onClose} />

        {/* Modal 实体 */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: "spring", duration: 0.4 }}
          className="bg-surface-1 border border-border-subtle rounded-xl w-full max-w-[480px] p-5 shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* 装饰背景流光 */}
          <div className={`absolute -right-12 -top-12 w-28 h-28 rounded-full blur-3xl opacity-20 pointer-events-none ${
            isFitness ? "bg-primary" : "bg-ai-blue"
          }`} />

          {/* 顶栏 */}
          <div className="flex items-center justify-between border-b border-border-subtle pb-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isFitness ? "bg-primary/20 text-primary" : "bg-ai-blue/20 text-ai-blue"
              }`}>
                {isFitness ? <Dumbbell className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-secondary">
                  {isFitness ? "力量训练特化打卡" : "社交复盘特化打卡"}
                </h3>
                <p className="text-sm font-bold text-text-primary mt-0.5 truncate max-w-[280px]">
                  {habit.name}
                </p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 表单内容区 (支持滚动) */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
            {isFitness ? (
              // ==========================================
              // 1. 力量健身表单
              // ==========================================
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                      组数
                    </span>
                    <button
                      type="button"
                      onClick={handleAddSet}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 font-mono uppercase"
                    >
                      <Plus className="w-3 h-3" /> 添加一组
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {sets.map((set, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-surface-2/60 p-2.5 rounded-lg border border-border-subtle/50 text-xs font-mono">
                        <span className="w-12 text-text-secondary font-bold text-center">第 {set.setNum} 组</span>
                        
                        <div className="flex-1 flex items-center gap-1.5">
                          <input
                            type="number"
                            required
                            min="1"
                            value={set.weight}
                            onChange={(e) => handleSetChange(idx, "weight", Number(e.target.value))}
                            className="w-full bg-surface-1 border border-border-subtle rounded px-2 py-1 text-center font-bold text-text-primary outline-none focus:border-primary"
                          />
                          <span className="text-text-secondary font-medium">kg</span>
                        </div>

                        <div className="flex-1 flex items-center gap-1.5">
                          <input
                            type="number"
                            required
                            min="1"
                            value={set.reps}
                            onChange={(e) => handleSetChange(idx, "reps", Number(e.target.value))}
                            className="w-full bg-surface-1 border border-border-subtle rounded px-2 py-1 text-center font-bold text-text-primary outline-none focus:border-primary"
                          />
                          <span className="text-text-secondary font-medium">次</span>
                        </div>

                        <button
                          type="button"
                          disabled={sets.length === 1}
                          onClick={() => handleRemoveSet(idx)}
                          className={`p-1.5 rounded hover:bg-surface-3 transition-colors ${
                            sets.length === 1 ? "text-text-secondary/20 cursor-not-allowed" : "text-text-secondary hover:text-error"
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 训练状态评价 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                    训练精神状态
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      ["great", "good", "tired"] as NonNullable<HabitCustomData["mood"]>[]
                    ).map((mood) => {
                      const isSelected = fitnessMood === mood;
                      return (
                        <button
                          key={mood}
                          type="button"
                          onClick={() => setFitnessMood(mood)}
                          className={`py-2 rounded-lg border text-xs font-bold font-mono transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary shadow-[0_0_8px_rgba(29,185,84,0.15)]"
                              : "border-border-subtle bg-surface-2/40 text-text-secondary hover:border-text-secondary"
                          }`}
                        >
                          {MOOD_LABELS[mood]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 训练笔记 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                    训练简记
                  </label>
                  <textarea
                    rows={2}
                    value={fitnessNotes}
                    onChange={(e) => setFitnessNotes(e.target.value)}
                    placeholder="选填。心得或不标准的动作"
                    className="w-full px-3 py-2 bg-surface-2/40 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none resize-none font-mono"
                  />
                </div>
              </div>
            ) : (
              // ==========================================
              // 2. 社交复盘表单
              // ==========================================
              <div className="space-y-3.5">
                {/* 谈话对象 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                    谈话对象
                  </label>
                  <input
                    type="text"
                    required
                    value={socialContact}
                    onChange={(e) => setSocialContact(e.target.value)}
                    placeholder="姓名、职业，如：导师、合伙人"
                    className="w-full px-3 py-2 bg-surface-2/40 rounded-lg border border-border-subtle focus:border-ai-blue text-xs text-text-primary outline-none font-mono"
                  />
                </div>

                {/* 探讨核心 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                    主题
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={socialTopic}
                    onChange={(e) => setSocialTopic(e.target.value)}
                    placeholder="聊了什么，对方的关切"
                    className="w-full px-3 py-2 bg-surface-2/40 rounded-lg border border-border-subtle focus:border-ai-blue text-xs text-text-primary outline-none resize-none font-mono"
                  />
                </div>

                {/* 情商边界反思 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                    沟通反思
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={socialReflect}
                    onChange={(e) => setSocialReflect(e.target.value)}
                    placeholder="说多了吗？倾听边界如何？有无内耗？"
                    className="w-full px-3 py-2 bg-surface-2/40 rounded-lg border border-border-subtle focus:border-ai-blue text-xs text-text-primary outline-none resize-none font-mono"
                  />
                </div>

                {/* 后续跟进待办 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
                    后续动作
                  </label>
                  <input
                    type="text"
                    required
                    value={socialFollowUp}
                    onChange={(e) => setSocialFollowUp(e.target.value)}
                    placeholder="如：明天发邮件、两周后约见"
                    className="w-full px-3 py-2 bg-surface-2/40 rounded-lg border border-border-subtle focus:border-ai-blue text-xs text-text-primary outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* ==========================================
            // 3. 打卡凭证图片上传组件 (可选)
            // ========================================== */}
            <div className="space-y-2 pt-2 border-t border-border-subtle/50">
              <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono flex items-center justify-between">
                <span>图片凭证</span>
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => setImagePreview(null)}
                    className="text-[9px] text-error hover:underline uppercase font-bold"
                  >
                    清除图片
                  </button>
                )}
              </span>

              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden border border-border-subtle h-[120px] bg-surface-2 group">
                  {/* 这里是用户刚选图片的 base64 预览，没有任何网络请求，
                      也没有「按尺寸裁剪」的余地（尺寸要等读文件才知道）。
                      next/image 对 data URL 只能 unoptimized 透传，换过去只多一层包装。 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Upload Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-surface-1 border border-border-subtle text-[10px] font-bold rounded-lg hover:scale-105 transition-all text-text-primary flex items-center gap-1"
                    >
                      <Camera className="w-3.5 h-3.5" /> 更换图片
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-dashed border-border-subtle hover:border-primary/40 bg-surface-2/20 hover:bg-surface-2/40 rounded-xl py-6 px-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 group"
                >
                  <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center text-text-secondary group-hover:text-primary transition-all">
                    {isUploading ? (
                      <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-text-primary group-hover:text-primary transition-colors">
                    {isUploading ? "处理中…" : "选择图片"}
                  </span>
                  <span className="text-[9px] text-neutral-gray">
                    可拖入图片，最大 4MB
                  </span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </div>
          </form>

          {/* 底栏提交按钮 */}
          <div className="flex gap-3 pt-4 border-t border-border-subtle/50 flex-shrink-0">
            <button
              onClick={handleSubmit}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all active:scale-95 text-black ${
                isFitness 
                  ? "bg-primary hover:bg-primary-hover shadow-[0_0_12px_rgba(29,185,84,0.2)]" 
                  : "bg-ai-blue hover:bg-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.2)] text-white"
              }`}
            >
              <Check className="w-4 h-4" />
              <span>保存并完成打卡</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 bg-surface-3 hover:bg-surface-2 border border-border-subtle rounded-lg text-xs font-semibold transition-all active:scale-95"
            >
              取消
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
