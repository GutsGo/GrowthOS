'use client';

/**
 * 输出页（Phase 3：费曼正确版）
 *
 * 老项目把「输出」做成了 AI 打分：写完 → 请求 /api/feynman → 得到一个 0–100 的分数。
 * 这条路走不通，因为分数是**终点**，而学习需要的是**下一步**。
 *
 * 现在的流程固定三步，每一步都不依赖 AI：
 *   讲一遍 → 标卡壳 → 写 100 字大白话
 * 产出物是「一条待补卡建议」，不是分数。建议不自动落库——
 * 自己动手建那张卡，才是这次输出真正留下的东西。
 *
 * 三步的顺序不能换：先标卡壳再写大白话，是因为「讲不清的地方」和
 * 「说不明白的地方」往往不是同一处，后者才是自己真正的盲区。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Mic } from 'lucide-react';
import { db, trackDeletion, type FeynmanRecord } from '@/lib/db';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import {
  FEYNMAN_STEPS,
  buildCardSuggestion,
  checkDraft,
  measurePlainSummary,
  splitSentences,
  type FeynmanDraft,
} from '@/lib/learning/feynman';
import { normalizeFollowUp, type FollowUp } from '@/lib/ai/contract';
import StepSpeak from './StepSpeak';
import StepStuck from './StepStuck';
import StepPlain from './StepPlain';
import OutputDone, { type FollowUpState } from './OutputDone';
import OutputHistory from './OutputHistory';

type Step = 'speak' | 'stuck' | 'plain' | 'done';

const EMPTY_DRAFT: FeynmanDraft = {
  concept: '',
  text: '',
  stuckPoints: [],
  plainSummary: '',
};

export default function OutputView() {
  const { setActiveTab, outputSeed, setOutputSeed } = useAppStore();

  /** 从项目难题带过来的题目在挂载时消费一次。不预填正文，只预填题目。 */
  const [seed] = useState(() => outputSeed);
  const [draft, setDraft] = useState<FeynmanDraft>(() =>
    seed ? { ...EMPTY_DRAFT, concept: seed.concept, cardId: seed.cardId } : EMPTY_DRAFT,
  );
  const [step, setStep] = useState<Step>('speak');
  const [saving, setSaving] = useState(false);
  /**
   * AI 追问的结果。
   *
   * 它刻意**不阻塞**完成页：先把「讲完了、存下了」给到用户，
   * 再让 AI 在后台找漏讲点。反过来做的话，网络慢的时候人会卡在
   * 一个转圈的按钮前面，而他已经讲完了。
   */
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [followUpState, setFollowUpState] = useState<FollowUpState>('idle');

  // 消费掉 store 里的种子，否则从看板跳过来第二次会重复预填
  useEffect(() => {
    if (outputSeed) setOutputSeed(null);
  }, [outputSeed, setOutputSeed]);

  const records =
    useLiveQuery(() => db.feynmanRecords.orderBy('createdAt').reverse().toArray()) ||
    [];

  const sentences = useMemo(() => splitSentences(draft.text), [draft.text]);
  const plainCheck = useMemo(
    () => measurePlainSummary(draft.plainSummary),
    [draft.plainSummary],
  );
  const draftCheck = useMemo(() => checkDraft(draft), [draft]);
  const suggestion = useMemo(() => buildCardSuggestion(draft), [draft]);

  const patch = (next: Partial<FeynmanDraft>) =>
    setDraft((prev) => ({ ...prev, ...next }));

  const toggleStuck = (sentence: string) =>
    setDraft((prev) => ({
      ...prev,
      stuckPoints: prev.stuckPoints.includes(sentence)
        ? prev.stuckPoints.filter((s) => s !== sentence)
        : [...prev.stuckPoints, sentence],
    }));

  /**
   * 让 AI 找漏讲的点。
   *
   * 拿到之后回写记录：这样历史里再打开这一条，还能看见当时的漏讲点，
   * 而不是每次都要重新调一次接口（那既慢又不稳定）。
   */
  const askFollowUp = async (record: FeynmanRecord) => {
    setFollowUpState('loading');
    try {
      const res = await apiFetch('/api/feynman', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: record.topic,
          content: record.content,
          plainSummary: record.plainSummary,
        }),
      });

      const data = await res.json();
      const parsed = normalizeFollowUp(data);
      const fallback = data?.fallback === true || !parsed;

      setFollowUp(parsed);
      setFollowUpState(fallback ? 'fallback' : 'done');

      if (parsed) {
        await db.feynmanRecords.update(record.id, {
          aiGaps: parsed.gaps,
          aiTerms: parsed.terms,
        });
      }
    } catch {
      setFollowUpState('fallback');
    }
  };

  const finish = async () => {
    if (!draftCheck.ok || saving) return;
    setSaving(true);
    const now = new Date();
    const record: FeynmanRecord = {
      id: crypto.randomUUID(),
      topic: draft.concept.trim(),
      content: draft.text.trim(),
      // 老字段保留兼容：不再打分，写 0 与「未评分」，避免统计里出现假的 85 分
      score: 0,
      grade: '未评分',
      tips: [],
      cardId: draft.cardId,
      stuckPoints: draft.stuckPoints,
      plainSummary: draft.plainSummary.trim(),
      createdAt: now,
    };

    try {
      await db.feynmanRecords.put(record);
    } catch (err) {
      console.error('保存输出失败:', err);
    } finally {
      setSaving(false);
      // 存失败也进完成页：卡在这一屏比丢一条记录更糟，
      // 用户已经讲完了，不该被存储问题扣住。
      setStep('done');
      void askFollowUp(record);
    }
  };

  const restart = () => {
    setDraft(EMPTY_DRAFT);
    setFollowUp(null);
    setFollowUpState('idle');
    setStep('speak');
  };

  const loadRecord = (record: FeynmanRecord) => {
    setDraft({
      concept: record.topic,
      text: record.content,
      stuckPoints: record.stuckPoints ?? [],
      plainSummary: record.plainSummary ?? '',
      cardId: record.cardId,
    });
    // 历史记录里存过漏讲点就直接显示，不必重新问一遍 AI
    if (record.aiGaps?.length) {
      setFollowUp({
        gaps: record.aiGaps,
        terms: record.aiTerms ?? [],
        score: null,
      });
      setFollowUpState('done');
    } else {
      setFollowUp(null);
      setFollowUpState('idle');
    }
    setStep('speak');
  };

  const deleteRecord = async (id: string) => {
    await db.feynmanRecords.delete(id);
    await trackDeletion('feynmanRecords', id);
  };

  return (
    <div className="page-scroll">
      <div className="page-shell space-y-6">
        {/* 第三步存盘之后，AI 会自动指出漏讲的点——
            不再需要把用户送去另一个页面「找教练」 */}
        <header>
          <p className="eyebrow">Output · Feynman</p>
          <h1 className="page-title mt-1">讲一遍</h1>
          <p className="page-sub">
            讲不清的地方，就是下一张卡该补的地方。
          </p>
        </header>

        {/* 步骤指示 */}
        {step !== 'done' && (
          <div className="flex items-center gap-2">
            {FEYNMAN_STEPS.map((s, index) => {
              const order = FEYNMAN_STEPS.findIndex((x) => x.id === step);
              const active = s.id === step;
              const passed = index < order;
              return (
                <React.Fragment key={s.id}>
                  <div
                    className={`chip !rounded-full ${
                      active
                        ? 'chip-active'
                        : passed
                          ? 'bg-surface-2'
                          : 'opacity-60'
                    }`}
                  >
                    <span className="font-mono">{index + 1}</span>
                    <span>{s.title}</span>
                  </div>
                  {index < FEYNMAN_STEPS.length - 1 && (
                    <div className="flex-1 h-px bg-border-subtle/60" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 主区 */}
          <div className="lg:col-span-2 surface-card p-5 md:p-6">
            {step === 'speak' && (
              <StepSpeak
                concept={draft.concept}
                text={draft.text}
                seed={seed?.seed}
                onConceptChange={(v) => patch({ concept: v })}
                onTextChange={(v) => patch({ text: v })}
                onNext={() => setStep('stuck')}
                blocker={draftCheck.blockers.speak}
              />
            )}

            {step === 'stuck' && (
              <StepStuck
                sentences={sentences}
                stuckPoints={draft.stuckPoints}
                onToggle={toggleStuck}
                onAdd={(sentence) =>
                  setDraft((prev) =>
                    prev.stuckPoints.includes(sentence)
                      ? prev
                      : { ...prev, stuckPoints: [...prev.stuckPoints, sentence] },
                  )
                }
                onBack={() => setStep('speak')}
                onNext={() => setStep('plain')}
                hint={draftCheck.hints.stuck}
              />
            )}

            {step === 'plain' && (
              <StepPlain
                value={draft.plainSummary}
                check={plainCheck}
                onChange={(v) => patch({ plainSummary: v })}
                onBack={() => setStep('stuck')}
                onFinish={finish}
                saving={saving}
              />
            )}

            {step === 'done' && (
              <OutputDone
                concept={draft.concept}
                stuckPoints={draft.stuckPoints}
                plainSummary={draft.plainSummary}
                suggestion={suggestion}
                followUp={followUp}
                followUpState={followUpState}
                onGoBrain={() => setActiveTab('brain')}
                onRestart={restart}
              />
            )}
          </div>

          {/* 侧栏 */}
          <div className="space-y-4">
            <div className="surface-card p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Mic className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-secondary">
                  规则
                </span>
              </div>
              <ul className="space-y-2 text-[11px] text-text-secondary leading-relaxed">
                <li>· 先讲，再看卡片。</li>
                <li>· 卡壳点自己标，系统不猜。</li>
                <li>· 100 字里出现「底层逻辑」这类词，说明还在背，没在讲。</li>
              </ul>
            </div>

            <OutputHistory
              records={records}
              onLoad={loadRecord}
              onDelete={deleteRecord}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
