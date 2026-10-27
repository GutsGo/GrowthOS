'use client';

/**
 * 新建项目表单（一周一个）
 *
 * 没有「周期」这个输入框——`createProject` 把周期写死成 7 天。
 * 想做长项目，做法是拆成四个一周项目，而不是在这里填 30。
 */

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { DEFAULT_MILESTONES } from '@/lib/learning/projects';

interface ProjectFormProps {
  onSubmit: (input: { title: string; summary: string; milestones: string[] }) => void;
  onCancel: () => void;
}

export default function ProjectForm({ onSubmit, onCancel }: ProjectFormProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [milestones, setMilestones] = useState<string[]>([...DEFAULT_MILESTONES]);

  const updateMilestone = (index: number, value: string) =>
    setMilestones((prev) => prev.map((m, i) => (i === index ? value : m)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title,
      summary,
      milestones: milestones.map((m) => m.trim()).filter(Boolean),
    });
  };

  return (
    <form
      onSubmit={submit}
      className="surface-card !border-primary/35 p-4 md:p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          新项目 · 默认 7 天
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-neutral-gray hover:text-text-primary transition-colors"
          aria-label="取消"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="项目名：一周内能做完、能拿给别人看的一件事"
        className="field !h-[42px] !text-[14px]"
        autoFocus
      />

      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="做完能展示什么（选填）"
        className="field"
      />

      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-text-secondary">
          做完是什么样（三条以内）
        </p>
        {milestones.map((milestone, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-gray w-4">
              {index + 1}
            </span>
            <input
              value={milestone}
              onChange={(e) => updateMilestone(index, e.target.value)}
              className="field !h-8 !text-[11px] flex-1"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-neutral-gray leading-relaxed max-w-[60%]">
          写不出做完的样子，说明还没想清楚。
        </p>
        <button
          type="submit"
          disabled={!title.trim()}
          className="btn btn-md btn-primary"
        >
          <Plus className="w-3.5 h-3.5" /> 建项目
        </button>
      </div>
    </form>
  );
}
