'use client';

/**
 * 输出历史
 *
 * 唯一值得强调的信息不是「你输出了几条」，而是**「标了卡壳但没补成卡的还有几条」**。
 * 所以每条记录后面挂的是「未补卡 / 已补卡」，而不是分数。
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import type { FeynmanRecord } from '@/lib/db';
import { needsFollowUp } from '@/lib/learning/feynman';

interface OutputHistoryProps {
  records: FeynmanRecord[];
  onLoad: (record: FeynmanRecord) => void;
  onDelete: (id: string) => void;
}

export default function OutputHistory({
  records,
  onLoad,
  onDelete,
}: OutputHistoryProps) {
  if (records.length === 0) {
    return (
      <div className="surface-empty p-6 text-center">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          还没有输出记录。
          <br />
          能讲清一个概念就够。
        </p>
      </div>
    );
  }

  const pending = records.filter(needsFollowUp).length;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-secondary">
          输出记录 · {records.length}
        </h3>
        {pending > 0 && (
          <span className="text-[10px] text-amber-400 font-mono">
            {pending} 条标了卡壳没补卡
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
        {records.map((record) => {
          const stuck = record.stuckPoints?.length ?? 0;
          const unfollowed = needsFollowUp(record);
          return (
            <div
              key={record.id}
              className="surface-card group hover:!border-text-secondary/30 transition-colors"
            >
              <button
                onClick={() => onLoad(record)}
                className="w-full text-left px-3.5 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] font-semibold text-text-primary leading-relaxed line-clamp-1">
                    {record.topic}
                  </p>
                  <span className="text-[9px] text-neutral-gray font-mono shrink-0 mt-0.5">
                    {new Date(record.createdAt).toLocaleDateString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] font-mono text-neutral-gray">
                    {stuck} 处卡壳
                  </span>
                  <span className="text-[9px] text-neutral-gray/50">·</span>
                  <span
                    className={`text-[9px] font-mono ${
                      unfollowed ? 'text-amber-400' : 'text-neutral-gray'
                    }`}
                  >
                    {stuck === 0 ? '无需补卡' : unfollowed ? '未补卡' : '已补卡'}
                  </span>
                </div>
              </button>
              <div className="px-3.5 pb-2 flex justify-end">
                <button
                  onClick={() => onDelete(record.id)}
                  className="text-neutral-gray hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  aria-label="删除这条输出"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
