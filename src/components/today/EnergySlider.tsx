'use client';

/**
 * 能量滑块（从 DashboardView 拆出）
 *
 * 改造前它是首屏右上角一块常驻面板，占掉一块视觉重量。
 * 现在降级成「一个胶囊」：默认只显示 5/10，点一下才展开滑块。
 * 理由：能量是「顺便记一下」的元数据，不该和「今天做什么」抢同一层注意力。
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ChevronDown } from 'lucide-react';

interface EnergySliderProps {
  energy: number;
  onChange: (value: number) => void;
}

export default function EnergySlider({ energy, onChange }: EnergySliderProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        /* 胶囊按钮：高度和其它小按钮对齐到 32，只有圆角是 pill——它是「状态 + 开关」，
           不是动作，所以用形状区分，而不是用另一套尺寸 */
        className="btn btn-sm btn-secondary !rounded-full gap-1.5"
        aria-expanded={isOpen}
        aria-label="记录今日能量"
      >
        <Zap className="w-3.5 h-3.5 text-primary" />
        <span className="font-mono font-bold text-text-primary">{energy}</span>
        <span className="font-mono text-[10px] text-text-secondary">/10</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-[240px] z-30 p-3.5 rounded-xl bg-surface-1 border border-border-subtle shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest font-mono text-text-secondary">
                今日能量
              </span>
              <span className="text-xs font-bold font-mono text-primary">
                {energy}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={energy}
              onChange={(e) => onChange(Number(e.target.value))}
              className="w-full h-1 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <p className="text-[10px] text-text-secondary mt-2 leading-relaxed">
              只影响「最宜」高亮，不打分。
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
