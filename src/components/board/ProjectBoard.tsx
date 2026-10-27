'use client';

/**
 * 项目看板
 *
 * 手册 4.2 的硬约束「一周一个可展示小项目」在这里落地。
 * 看板上只需要回答一个问题：**今天该管哪个**。所以排序按「进行中优先、超期优先」，
 * 而不是按创建时间——后者只会让新项目一直排在最上面，老项目永远烂在下面。
 */

import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FolderPlus } from 'lucide-react';
import { db, trackDeletion } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import type { Project, ProjectPitfall } from '@/lib/learning/types';
import {
  FIRST_PROJECT_HINT,
  createProject,
  pitfallToStory,
  sortProjects,
} from '@/lib/learning/projects';
import ProjectCard from './ProjectCard';
import ProjectForm from './ProjectForm';

export default function ProjectBoard() {
  const { setActiveTab, setOutputSeed } = useAppStore();
  const projects = useLiveQuery(() => db.projects.toArray());
  const [creating, setCreating] = useState(false);

  const sorted = useMemo(() => sortProjects(projects ?? []), [projects]);

  const create = async (input: {
    title: string;
    summary: string;
    milestones: string[];
  }) => {
    const project = createProject({
      id: crypto.randomUUID(),
      title: input.title,
      summary: input.summary,
      milestones: input.milestones,
    });
    await db.projects.put(project);
    setCreating(false);
  };

  const update = async (next: Project) => {
    await db.projects.put(next);
  };

  const remove = async (id: string) => {
    await db.projects.delete(id);
    await trackDeletion('projects', id);
  };

  const tellStory = (pitfall: ProjectPitfall, project: Project) => {
    const story = pitfallToStory(pitfall, project.title);
    setOutputSeed({ concept: story.concept, seed: story.seed });
    setActiveTab('output');
  };

  const activeCount = sorted.filter((p) => p.status === 'active').length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="section-heading">
            项目实战
          </h2>
          <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
            {activeCount > 0
              ? `${activeCount} 个进行中。一个项目最多 7 天，超了就收尾或放弃。`
              : '一周一个能拿给别人看的小项目。'}
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="btn btn-sm btn-primary shrink-0"
          >
            <FolderPlus className="w-3.5 h-3.5" /> 新建项目
          </button>
        )}
      </div>

      {creating && (
        <ProjectForm onSubmit={create} onCancel={() => setCreating(false)} />
      )}

      {projects === undefined ? (
        <div className="surface-card h-24 animate-pulse" />
      ) : sorted.length === 0 ? (
        <div className="surface-empty p-8 text-center space-y-2">
          <p className="text-[12px] text-text-primary font-semibold">还没有项目</p>
          <p className="text-[11px] text-text-secondary leading-relaxed max-w-[380px] mx-auto">
            {FIRST_PROJECT_HINT}。
            <span className="text-text-primary">能拿给别人看就够</span>。
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onUpdate={update}
              onDelete={remove}
              onTellStory={(pitfall) => tellStory(pitfall, project)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
