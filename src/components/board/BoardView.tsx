'use client';

/**
 * 看板：项目 / 周复盘 / 数据
 *
 * 老项目这一屏叫「数据与复盘」，打开先看到雷达图和徽章墙——
 * 那些东西回答的是「我看起来怎么样」，而这一屏应该回答「下一步改什么」。
 *
 * 所以三块的顺序是有意的：
 *   项目（这周要做完什么）→ 周复盘（只改一个变量）→ 数据（已经发生的事实）
 * 数据沉到第三位，且不再是一进就看见的默认视图。
 */

import React, { useState } from 'react';
import { FolderKanban, LineChart, PenLine } from 'lucide-react';
import ProjectBoard from './ProjectBoard';
import WeeklyReviewPanel from './WeeklyReviewPanel';
import StatsView from '../StatsView';

type BoardTab = 'projects' | 'weekly' | 'data';

const TABS: { id: BoardTab; label: string; icon: React.ReactNode }[] = [
  { id: 'projects', label: '项目', icon: <FolderKanban className="w-3.5 h-3.5" /> },
  { id: 'weekly', label: '周复盘', icon: <PenLine className="w-3.5 h-3.5" /> },
  { id: 'data', label: '数据', icon: <LineChart className="w-3.5 h-3.5" /> },
];

export default function BoardView() {
  const [tab, setTab] = useState<BoardTab>('projects');

  return (
    <div className="page-scroll">
      <div className="page-shell space-y-5">
        <header>
          <p className="eyebrow">Board</p>
          <h1 className="page-title mt-1">看板</h1>
          <p className="page-sub">项目 → 周复盘 → 数据。</p>
        </header>

        {/* 分段控件：外层一块 12px 圆角的面板，里面是 32 高的按钮。
            之前是 29 高的 11px 按钮，和复习页的题型按钮、设置页的档位按钮
            各差 1~2px，凑在一起会看出「没对齐」。 */}
        <div className="inline-flex items-center gap-1 p-1 rounded-[12px] bg-surface-1 border border-border-subtle w-fit">
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === 'projects' && <ProjectBoard />}
        {tab === 'weekly' && <WeeklyReviewPanel />}
        {/* 数据区直接复用老的 StatsView：它的出勤格子已经在 Phase 1 改对了 */}
        {tab === 'data' && <StatsView embedded />}
      </div>
    </div>
  );
}
