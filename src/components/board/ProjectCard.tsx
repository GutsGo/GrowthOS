'use client';

/**
 * 项目卡片
 *
 * 两件东西合在一屏：里程碑（做完了什么）和「难题—解法」（学会了什么）。
 * 前者给进度感，后者给面试素材——大多数人的项目记录只有前者，
 * 于是半年后只能说出「我做过一个 XX 系统」，说不出任何细节。
 */

import React, { useState } from 'react';
import { Check, ChevronDown, Mic, Plus, Trash2 } from 'lucide-react';
import type { Project, ProjectPitfall } from '@/lib/learning/types';
import {
  addMilestone,
  canShip,
  createPitfall,
  projectHealth,
  projectProgress,
  toggleMilestone,
  daysLeft,
} from '@/lib/learning/projects';

interface ProjectCardProps {
  project: Project;
  onUpdate: (next: Project) => void;
  onDelete: (id: string) => void;
  onTellStory: (pitfall: ProjectPitfall) => void;
}

const TONE_CLASS: Record<string, string> = {
  comfortable: 'border-border-subtle text-text-secondary',
  tight: 'border-amber-500/40 text-amber-400',
  overdue: 'border-red-500/40 text-red-400',
  done: 'border-primary/40 text-primary',
  paused: 'border-border-subtle text-neutral-gray',
};

export default function ProjectCard({
  project,
  onUpdate,
  onDelete,
  onTellStory,
}: ProjectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [newMilestone, setNewMilestone] = useState('');
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');

  const progress = projectProgress(project);
  const health = projectHealth(project);
  const ship = canShip(project);
  const isDone = project.status === 'shipped' || project.status === 'archived';

  const addPitfall = () => {
    if (!problem.trim() || !solution.trim()) return;
    const pitfall = createPitfall(problem, solution, crypto.randomUUID());
    onUpdate({ ...project, pitfalls: [pitfall, ...project.pitfalls] });
    setProblem('');
    setSolution('');
  };

  return (
    <div
      className={`surface-card overflow-hidden transition-colors ${isDone ? 'opacity-80' : ''}`}
    >
      {/* 头部 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-text-primary truncate">
              {project.title}
            </h3>
            <span
              className={`shrink-0 px-1.5 py-0.5 rounded border text-[9px] font-mono ${TONE_CLASS[health.tone]}`}
            >
              {health.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="h-1 w-24 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.ratio * 100}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-neutral-gray">
              {progress.done}/{progress.total} 里程碑
            </span>
            <span className="text-[9px] text-neutral-gray/50">·</span>
            <span className="text-[9px] font-mono text-neutral-gray">
              {project.pitfalls.length} 条难题
            </span>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-neutral-gray shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border-subtle/60 pt-4">
          {project.summary && (
            <p className="text-[11px] text-text-secondary leading-relaxed">
              {project.summary}
            </p>
          )}

          {/* 里程碑 */}
          <div className="space-y-1.5">
            {project.milestones.map((milestone) => (
              <button
                key={milestone.id}
                onClick={() =>
                  onUpdate({
                    ...project,
                    milestones: toggleMilestone(project.milestones, milestone.id),
                  })
                }
                className="w-full flex items-start gap-2 text-left group"
              >
                <span
                  className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    milestone.done
                      ? 'bg-primary border-primary text-primary-text'
                      : 'border-border-subtle group-hover:border-text-secondary'
                  }`}
                >
                  {milestone.done && <Check className="w-2.5 h-2.5" />}
                </span>
                <span
                  className={`text-[11px] leading-relaxed ${
                    milestone.done
                      ? 'text-neutral-gray line-through'
                      : 'text-text-primary'
                  }`}
                >
                  {milestone.title}
                </span>
              </button>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <input
                value={newMilestone}
                onChange={(e) => setNewMilestone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = addMilestone(
                      project,
                      newMilestone,
                      crypto.randomUUID(),
                    );
                    onUpdate({ ...project, milestones: next });
                    setNewMilestone('');
                  }
                }}
                placeholder="里程碑内容"
                className="field !h-8 !text-[11px] flex-1"
              />
              <button
                onClick={() => {
                  onUpdate({
                    ...project,
                    milestones: addMilestone(
                      project,
                      newMilestone,
                      crypto.randomUUID(),
                    ),
                  });
                  setNewMilestone('');
                }}
                disabled={!newMilestone.trim()}
                className="btn btn-xs btn-soft !w-7 !px-0"
                aria-label="添加里程碑"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 难题—解法 */}
          <div className="space-y-2">
            <p className="text-[9px] font-mono uppercase tracking-widest text-text-secondary">
              难题—解法 · 面试故事的原料
            </p>

            {project.pitfalls.map((pitfall) => (
              <div
                key={pitfall.id}
                className="rounded-xl border border-border-subtle bg-surface-2/60 p-3 space-y-1.5"
              >
                <p className="text-[11px] font-semibold text-text-primary leading-relaxed">
                  {pitfall.problem}
                </p>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  {pitfall.solution}
                </p>
                <button
                  onClick={() => onTellStory(pitfall)}
                  className="btn btn-xs btn-ghost !h-6 !px-1.5 !text-primary gap-1"
                >
                  <Mic className="w-3 h-3" /> 用这段讲一遍
                </button>
              </div>
            ))}

            <div className="space-y-1.5 pt-1">
              <input
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="卡住的问题"
                className="field !h-8 !text-[11px]"
              />
              <input
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                placeholder="怎么解决的（一句话）"
                className="field !h-8 !text-[11px]"
              />
              <button
                onClick={addPitfall}
                disabled={!problem.trim() || !solution.trim()}
                className="btn btn-xs btn-soft w-full"
              >
                记下这条难题
              </button>
            </div>
          </div>

          {/* 收尾动作 */}
          <div className="flex items-center justify-between pt-1 border-t border-border-subtle/60">
            <div className="flex items-center gap-2">
              {!isDone && (
                <button
                  onClick={() => onUpdate({ ...project, status: 'shipped' })}
                  disabled={!ship.ok}
                  title={ship.reason}
                  className="btn btn-xs !border-primary/40 !text-primary hover:!bg-primary/10"
                >
                  标记完成
                </button>
              )}
              <button
                onClick={() =>
                  onUpdate({
                    ...project,
                    status: project.status === 'paused' ? 'active' : 'paused',
                  })
                }
                className="btn btn-xs btn-secondary"
              >
                {project.status === 'paused' ? '继续' : '暂停'}
              </button>
              {!ship.ok && !isDone && (
                <span className="text-[9px] text-neutral-gray max-w-[160px] leading-tight">
                  {daysLeft(project) < 0
                    ? '已超期。今天收尾，或明确放弃。'
                    : ship.reason}
                </span>
              )}
            </div>
            <button
              onClick={() => onDelete(project.id)}
              className="text-neutral-gray hover:text-red-400 transition-colors"
              aria-label="删除项目"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
