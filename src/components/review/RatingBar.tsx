'use client';

/**
 * 四档评分条
 *
 * 两个设计决定值得写下来：
 *
 * 1. **按钮上直接印下次间隔**。手册里最容易被误解的就是「为什么下次是这个日子」。
 *    与其写一段说明文，不如把它印在按钮上：忘记·明天 / 困难·4 天后 /
 *    良好·9 天后 / 简单·12 天后。用户一眼看见「困难比良好短」，
 *    就愿意诚实自评，而不是为了让卡快点消失去点「简单」。
 *    任何让人靠虚报来省事的设计，最后都会把数据搞脏。
 *
 * 2. **自评标准放在按钮的 title 里**，不铺在界面上。
 *    铺开会占掉半屏，而且复习时人不会读长句；但悬停能读到，足以在犹豫时查一次。
 *    真正的标准应该内化，不该永远摆在眼前当拐棍。
 */

import React from 'react';
import { RATING_META, type Rating } from '@/lib/learning/types';
import type { IntervalPreview } from '@/lib/learning/review';

interface RatingBarProps {
  previews: IntervalPreview[];
  /** 正在保存的那一档；非 null 时全部按钮禁用，防止连点两次记两条事件 */
  saving: Rating | null;
  onRate: (rating: Rating) => void;
}

/**
 * 四档的视觉权重刻意不同：
 * 「良好」是默认动作，所以最重（实心）；
 * 「忘记」只描边——它是正常的，不该被做成一个可怕的红按钮，
 * 否则用户会不敢点，于是把所有卡都判成「良好」，间隔全乱。
 *
 * 颜色用 Phase 4 收口的四档语义色（红 / 橙 / 绿 / 青）。
 * 色点只是辅助线索：按钮顺序固定，灰度下也能靠位置区分，
 * 所以色盲用户不会因为认不出颜色而点错档。
 */
const TONE: Record<Rating, string> = {
  0: 'border-border-subtle bg-surface-1 hover:border-rating-forgot hover:text-rating-forgot',
  3: 'border-border-subtle bg-surface-1 hover:border-rating-hard hover:text-rating-hard',
  4: 'border-primary bg-primary text-primary-text hover:bg-primary-hover',
  5: 'border-border-subtle bg-surface-1 hover:border-rating-easy hover:text-rating-easy',
};

const DOT: Record<Rating, string> = {
  0: 'bg-rating-forgot',
  3: 'bg-rating-hard',
  4: 'bg-primary-text/70',
  5: 'bg-rating-easy',
};

const LABEL_COLOR: Record<Rating, string> = {
  0: '',
  3: '',
  4: 'text-primary-text',
  5: '',
};

export default function RatingBar({ previews, saving, onRate }: RatingBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {previews.map((preview) => {
        const meta = RATING_META[preview.rating];
        const isSaving = saving === preview.rating;
        const disabled = saving !== null;

        return (
          <button
            key={preview.rating}
            type="button"
            disabled={disabled}
            onClick={() => onRate(preview.rating)}
            title={`${meta.hint}\n算法动作：${meta.action}`}
            className={`group relative rounded-xl border px-2 py-3 flex flex-col items-center gap-1 transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${TONE[preview.rating]}`}
          >
            <span
              className={`flex items-center gap-1.5 text-xs font-bold tracking-wide ${LABEL_COLOR[preview.rating]}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${DOT[preview.rating]}`}
                aria-hidden
              />
              {meta.label}
            </span>
            <span
              className={`text-[10px] font-mono tabular-nums ${
                preview.rating === 4 ? 'text-primary-text/70' : 'text-text-secondary'
              }`}
            >
              {isSaving ? '保存中' : preview.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
