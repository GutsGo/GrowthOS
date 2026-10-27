'use client';

/**
 * 复习页（Phase 2：从 FlowView 里独立出来）
 *
 * 老实现有三个结构性问题，这里逐条改掉：
 *
 * 1. **藏在番茄钟里**。想复习得先进「专注空间」，再点一下才进复习模式。
 *    复习是最该被一步触达的动作，现在它是独立 tab。
 *
 * 2. **用下标索引活队列**。老代码 `reviewCards[currentCardIndex]`，
 *    而队列是 `useLiveQuery` 的活数据：评完一张，它的 nextReview 变成未来，
 *    队列立刻少一张，下标却没动——于是会跳卡、会漏卡。
 *    现在改成「永远取还没评过的第一张」：评完就进 `ratedIds`，
 *    队列自己缩短，不存在下标和内容错位。
 *
 * 3. **评分不留痕**。评完只更新 cards，没有事件流，于是热力图只能拿习惯打卡凑数。
 *    现在每次评分写一条 reviewEvents，在同一个事务里。
 *
 * 另外，进度分母不是 `queue.total`，而是 `已评 + 待评`：
 * 因为评完的卡会离开队列，直接拿队列长度当分母会让进度条永远停在 0%。
 */

import React, { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { apiFetch } from '@/lib/api';
import { fromStoredCard } from '@/lib/learning/adapters';
import {
  previewIntervals,
  summarizeSession,
} from '@/lib/learning/review';
import { recordReview, setCardType } from '@/lib/learning/review-store';
import { planSession } from '@/lib/learning/session';
import { useDailyQueue } from '@/lib/learning/use-daily-queue';
import { stripHtml } from '@/lib/learning/recall';
import {
  EXAM_MAX_ROUNDS,
  buildFallbackQuestion,
  summarizeExam,
  type ExamTurn,
} from '@/lib/learning/exam';
import type { CardType, Rating, ReviewEvent } from '@/lib/learning/types';
import ReviewCard from './ReviewCard';
import RatingBar from './RatingBar';
import ExaminerPanel from './ExaminerPanel';
import SessionDone from './SessionDone';
import SingleCardDone from './SingleCardDone';

export default function ReviewsView() {
  const { setActiveTab, startReview, reviewScope } = useAppStore();
  const { queue, byId, ready, sequence, meta, interleaving } = useDailyQueue();

  /** 本次会话已经评过的卡。用来把卡从待办里排除，不依赖队列的实时长度 */
  const [ratedIds, setRatedIds] = useState<Set<string>>(() => new Set());
  const [sessionEvents, setSessionEvents] = useState<ReviewEvent[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState<Rating | null>(null);
  /** 「先说后看」开关。默认关，因为默认开会让第一次用的人不知所措 */
  const [recallEnabled, setRecallEnabled] = useState(false);
  /** 考官模式：翻面前可选的两轮追问。与「先说后看」互斥，避免同一张卡问两遍 */
  const [examOpen, setExamOpen] = useState(false);
  const [examTurns, setExamTurns] = useState<ExamTurn[] | null>(null);
  const [examQuestion, setExamQuestion] = useState<string | null>(null);
  const [examLoading, setExamLoading] = useState(false);
  const [examFallback, setExamFallback] = useState(false);

  /**
   * 本次会话该显示什么 = 交错顺序 - 已评过的，再按「进入意图」裁剪。
   *
   * 顺序来自 `useDailyQueue().sequence`，不再是 `[...due, ...fresh]`。
   * 评完一张后队列会重算一次（那张卡的 nextReview 变成未来，离开了队列），
   * 因此顺序可能局部变化——这不影响正确性：`ratedIds` 保证不重复，
   * 而队列本身保证不丢卡，用户看到的永远只是「下一张」。
   * 想冻结整批顺序，得把会话状态存进库里，对这个功能来说代价过高。
   */
  const plan = useMemo(
    () => planSession(sequence, ratedIds, reviewScope),
    [sequence, ratedIds, reviewScope],
  );

  const currentQueueCard = plan.pending[0];
  const currentCard = currentQueueCard ? byId.get(currentQueueCard.id) : undefined;
  const total = plan.total;

  /**
   * 四档各自的下次间隔。
   *
   * now 传 0：顺序不影响结果——间隔只由 ease/reps/interval 决定，与当前时刻无关。
   * 传 0 而不是 Date.now() 是为了让这个 memo 真正是纯的，
   * 避免「同一张卡在同一秒内渲染两次得到不同按钮文案」这种玄学。
   */
  const previews = useMemo(() => {
    if (!currentCard) return [];
    return previewIntervals(fromStoredCard(currentCard, 0), 0);
  }, [currentCard]);

  const handlePickType = (cardType: CardType) => {
    if (currentCard) void setCardType(currentCard.id, cardType);
    setFlipped(true);
  };

  const handleRate = async (rating: Rating) => {
    if (!currentCard || saving !== null) return;
    const cardId = currentCard.id;
    setSaving(rating);

    try {
      // 把这张卡的考官问答一并写进事件：翻面之后 examTurns 会在 finally 里被清空，
      // 所以必须在这一刻交出去。
      const outcome = await recordReview(cardId, rating, {
        exam: examTurns ?? undefined,
      });
      if (outcome) {
        setSessionEvents((prev) => [...prev, outcome.event]);
      }
    } catch (err) {
      // 写失败也要往下走：卡在这一张上比丢一条统计糟糕得多
      console.error('记录复习失败:', err);
    } finally {
      setSaving(null);
      setFlipped(false);
      // 换卡时把考官状态清干净：清不干净的话，下一张卡的背面会带着
      // 上一张的「已答两轮」提示，而那两轮答的根本不是这道题。
      setExamOpen(false);
      setExamTurns(null);
      setRatedIds((prev) => {
        const next = new Set(prev);
        next.add(cardId);
        return next;
      });
    }
  };

  /**
   * 考官问完两轮（或模型说没什么可问的了）。
   *
   * 这里直接翻面，不额外要求点一次「看答案」——刚答完的那一刻最想知道
   * 自己漏了什么，那一下点击纯属浪费。
   *
   * 顺带跳过「这题在考什么」那一档：能答两轮追问的人，已经知道它在考什么。
   */
  const finishExam = (turns: ExamTurn[]) => {
    setExamTurns(turns);
    setExamOpen(false);
    setExamLoading(false);
    setExamQuestion(null);
    setFlipped(true);
  };

  /**
   * 问下一轮。
   *
   * 请求放在这一层而不是面板里，是为了让「什么时候发请求」由点击决定。
   * 面板在 effect 里发首问会闪一下空白，也过不了 `set-state-in-effect`。
   *
   * 网络挂了不报错：退回本地追问（逼「说步骤」+「拿掉术语」），
   * 这两问不需要模型判断对错，所以离线的考官依然成立。
   */
  const askExam = async (history: ExamTurn[]) => {
    if (!currentCard) return;
    setExamLoading(true);
    try {
      const res = await apiFetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          front: currentCard.front,
          back: currentCard.back,
          turns: history,
        }),
      });
      const data = (await res.json()) as {
        question?: string | null;
        done?: boolean;
        fallback?: boolean;
      };

      if (data.done || !data.question) {
        finishExam(history);
        return;
      }
      setExamQuestion(data.question);
      setExamFallback(Boolean(data.fallback));
    } catch {
      setExamQuestion(
        buildFallbackQuestion(
          currentCard.front,
          stripHtml(currentCard.back),
          history,
        ),
      );
      setExamFallback(true);
    } finally {
      setExamLoading(false);
    }
  };

  const openExam = () => {
    setExamOpen(true);
    setExamQuestion(null);
    setExamFallback(false);
    setExamLoading(true);
    void askExam([]);
  };

  const submitExamAnswer = (answer: string) => {
    const next: ExamTurn[] = [
      ...(examTurns ?? []),
      { question: examQuestion ?? '', answer },
    ];
    setExamTurns(next);
    setExamQuestion(null);

    if (next.length >= EXAM_MAX_ROUNDS) {
      finishExam(next);
      return;
    }
    void askExam(next);
  };

  // ---------- 加载中 ----------
  if (!ready) {
    return (
      <div className="page-scroll">
        <div className="page-shell space-y-4">
          <div className="h-3 w-24 bg-surface-3 rounded animate-pulse" />
          <div className="h-[340px] w-full bg-surface-1 border border-border-subtle rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const summary = summarizeSession(sessionEvents);

  // ---------- 「先复习一张」：这一张复习完了，但今天还有 ----------
  // 必须排在「本次会话结束」之前：整队清空是另一个事实，不能混用同一句话。
  if (plan.oneDone) {
    return (
      <div className="page-scroll">
        <div className="page-shell">
          <SingleCardDone
            rest={plan.restCount}
            onContinue={() => startReview('all')}
            onBack={() => setActiveTab('dashboard')}
          />
        </div>
      </div>
    );
  }

  // ---------- 本次会话结束 ----------
  if (!currentCard && ratedIds.size > 0) {
    return (
      <div className="page-scroll">
        <div className="page-shell">
          <SessionDone
            rated={summary.rated}
            lapsed={summary.lapsed}
            introduced={summary.introduced}
            examined={summary.examined}
            deferredNew={queue.deferredNew}
            onBack={() => setActiveTab('dashboard')}
            onMakeCard={() => setActiveTab('brain')}
          />
        </div>
      </div>
    );
  }

  // ---------- 没有卡可评 ----------
  if (!currentCard) {
    // 走到这里说明本次会话还没评过任何卡，所以队列本来就是空的。
    // 「有卡但今天没到期」和「一张卡都没有」要给不同的出路：
    // 前者该说「明天见」，后者该说「先复习一张」。
    const hasAnyCard = byId.size > 0;
    return (
      <div className="page-scroll">
        <div className="page-shell py-16 text-center space-y-4">
          <h2 className="text-lg font-extrabold text-text-primary">
            {hasAnyCard ? '今天的卡都复习完了' : '还没有卡'}
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed max-w-[360px] mx-auto">
            {hasAnyCard
              ? '下次复习已排好。断开一天不改长期轨迹。'
              : '先有一张卡。制一张能问住自己的卡。'}
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveTab('brain')}
              className="btn btn-md btn-primary"
            >
              {hasAnyCard ? '再制一张' : '去制第一张卡'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="btn btn-md btn-secondary"
            >
              回今日
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progress = total > 0 ? (plan.rated / total) * 100 : 0;
  const interleaveLabel =
    meta.dimension === 'type'
      ? '题型混排'
      : meta.dimension === 'tag'
        ? '主题混排'
        : null;

  return (
    <div className="page-scroll">
      <div className="page-shell space-y-4">
        {/* 顶部：进度 + 先说后看开关 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {reviewScope === 'one' ? (
              /* 「先复习一张」进来的，就别摆 `0 / 2` 的进度条——
                 那等于刚答应只复习一张，立刻改口说还有一堆 */
              <>
                <span className="text-[11px] font-mono text-text-secondary">
                  这一张
                </span>
                <span className="text-[10px] text-text-secondary/60">
                  复习完就能走
                </span>
              </>
            ) : (
              <>
                <span className="text-[11px] font-mono tabular-nums text-text-secondary">
                  {plan.rated} / {total}
                </span>
                <div className="w-20 h-1 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              </>
            )}
            {queue.deferredNew > 0 && (
              <span className="text-[10px] text-text-secondary/60 font-mono truncate">
                还有 {queue.deferredNew} 张新卡排在明天
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setRecallEnabled((v) => !v);
              setFlipped(false);
            }}
            className={`btn btn-xs !rounded-full !px-2.5 gap-1.5 ${
              recallEnabled
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'btn-secondary !rounded-full'
            }`}
            title="翻面前先说一遍答案，再算覆盖率"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                recallEnabled ? 'bg-primary' : 'bg-surface-3'
              }`}
            />
            先说后看
          </button>
        </div>

        {/* 交错提示：只在真的打散了才出现。
            数据里只有一种卡的时候不写这一行——「已开启交错」会是假提示 */}
        {interleaving && interleaveLabel && (
          <p
            className="text-[10px] text-text-secondary/60 -mt-1"
            title="混着刷才是检索内容，连着刷只记住刚才在做什么。"
          >
            交错中 · {interleaveLabel}
          </p>
        )}

        <ReviewCard
          key={currentCard.id}
          card={currentCard}
          flipped={flipped}
          /* 已经答过两轮考官追问，就不必再要求「先说一遍」——
             同一张卡问两遍，第二次只是在惩罚认真的人 */
          recallEnabled={recallEnabled && !examTurns}
          onPickType={handlePickType}
          onSkipType={() => setFlipped(true)}
        />

        {/* 评分条：翻面之后才出现。没看答案就评分，等于自己骗自己 */}
        <div className="min-h-[64px] flex items-center">
          {flipped ? (
            <div className="w-full space-y-1.5">
              {examTurns && <ExamSummaryLine turns={examTurns} />}
              <RatingBar previews={previews} saving={saving} onRate={handleRate} />
              <p className="text-[10px] text-text-secondary/60 text-center">
                选「困难」不会让卡消失，只会让它早点回来。
              </p>
            </div>
          ) : examOpen ? (
            <ExaminerPanel
              question={examQuestion}
              loading={examLoading}
              fallback={examFallback}
              answeredCount={examTurns?.length ?? 0}
              onSubmit={submitExamAnswer}
              onSkip={() => {
                setExamOpen(false);
                setExamLoading(false);
                setFlipped(true);
              }}
            />
          ) : (
            <div className="w-full flex flex-col items-center gap-2">
              <p className="text-[10px] text-text-secondary/50 text-center">
                先判断这题在考什么，再翻。
              </p>
              <button
                type="button"
                onClick={openExam}
                className="btn btn-xs !rounded-full !px-2.5 border-ai-blue/40 bg-ai-blue/10 text-ai-blue hover:bg-ai-blue/20"
                title="AI 考官追问两轮，答完再翻面"
              >
                先追问两轮
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 考官两轮之后的结论。
 *
 * 不打分、不评价人，只陈述一个事实（答了几轮、几轮很薄），
 * 再加一句提醒。这样它不构成「外驱动机」——手册里最反对的就是
 * 让人为了一个分数去复习，而不是为了「我到底会不会」。
 */
function ExamSummaryLine({ turns }: { turns: ExamTurn[] }) {
  const summary = summarizeExam(turns);
  const thin = summary.thin;

  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 text-[10px] leading-relaxed ${
        thin > 0
          ? 'border-warning/40 bg-warning/10 text-warning'
          : 'border-border-subtle bg-surface-2/60 text-text-secondary'
      }`}
    >
      {thin > 0
        ? `两轮里有 ${thin} 轮答得薄。选「良好」骗的是明天的自己。`
        : `两轮都答出来了。没卡就选「良好」或「简单」。`}
    </div>
  );
}
