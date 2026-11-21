import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, History, LoaderCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, toErrorMessage, type Card, type Stats } from '../lib/api';

const ratingOptions = [
  {
    rating: 1 as const,
    label: '忘了',
    sub: 'Again',
    className: 'bg-[#f6e7e1] text-[#8f4e3d] hover:bg-[#f0dbd2] dark:bg-[#3a2621] dark:text-[#e7afa0]',
  },
  {
    rating: 2 as const,
    label: '困难',
    sub: 'Hard',
    className: 'bg-[#f3eee0] text-[#836e43] hover:bg-[#ebe3cf] dark:bg-[#363122] dark:text-[#e2cd96]',
  },
  {
    rating: 3 as const,
    label: '记得',
    sub: 'Good',
    className: 'bg-[#e9eee3] text-[#556a46] hover:bg-[#dee6d5] dark:bg-[#2a3625] dark:text-[#bdd3ab]',
  },
  {
    rating: 4 as const,
    label: '简单',
    sub: 'Easy',
    className: 'bg-[#e2ece8] text-[#456b5e] hover:bg-[#d5e5df] dark:bg-[#21332d] dark:text-[#a8d1c2]',
  },
];

function Confetti() {
  const colors = ['#7b9467', '#c4ac5f', '#89a89d', '#d18d75'];
  return (
    <div className="review-confetti" aria-hidden="true">
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 4.1) % 98}%`,
            backgroundColor: colors[i % colors.length],
            animationDelay: `${(i % 8) * 110}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function ReviewPage({
  onOpenHistory,
  onGoNotes,
  onStatsChanged,
}: {
  onOpenHistory: () => void;
  onGoNotes: () => void;
  onStatsChanged?: () => void;
}) {
  const [dueCards, setDueCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState<Stats>({ notes: 0, cards: 0, due: 0, reviewedToday: 0 });
  const [response, setResponse] = useState('');
  const [showReference, setShowReference] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [cards, summary] = await Promise.all([
      api<Card[]>('/api/cards/due'),
      api<Stats>('/api/reviews/stats'),
    ]);
    setDueCards(cards);
    setStats(summary);
    onStatsChanged?.();
    return cards;
  }, [onStatsChanged]);

  useEffect(() => {
    refresh()
      .catch((cause) => setError(toErrorMessage(cause, '加载待复习卡片失败')))
      .finally(() => setLoading(false));
  }, [refresh]);

  const current = dueCards[index];

  const rate = async (rating: 1 | 2 | 3 | 4) => {
    if (!current || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/cards/${current.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating, response }),
      });
      setResponse('');
      setShowReference(false);
      setShowContext(false);
      const remaining = await refresh();
      setIndex((curr) => Math.min(curr, Math.max(0, remaining.length - 1)));
      setCelebrating(remaining.length === 0);
    } catch (cause) {
      setError(toErrorMessage(cause, '提交评分失败'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#262920] dark:text-[#e4e7de]">
            今日复习
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">
            <span>待复习 {stats.due} 张</span>
            <span aria-hidden="true">·</span>
            <span>今日已完成 {stats.reviewedToday} 次</span>
          </div>
        </div>
        <button
          onClick={onOpenHistory}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#e3e5dd] bg-white px-3.5 text-xs font-medium text-[#5e6357] hover:bg-[#f8f9f5] whitespace-nowrap dark:border-[#343a2f] dark:bg-[#1e221b] dark:text-[#cfd4c8]"
        >
          <History size={15} />
          提交历史
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#e8c6bc] bg-[#fdf3f0] px-4 py-2.5 text-sm text-[#8f4938] dark:border-[#5b382f] dark:bg-[#2a1d19] dark:text-[#e6afa0]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-[#8a8f82]">
          <LoaderCircle size={18} className="animate-spin" />
          正在加载待复习队列…
        </div>
      ) : !current ? (
        <div className="relative overflow-hidden rounded-2xl border border-[#e3e5dd] bg-white px-6 py-16 text-center dark:border-[#32372d] dark:bg-[#1e221b]">
          {celebrating && <Confetti />}
          <div className="relative z-10">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e9eee3] text-[#647555] dark:bg-[#2c3627] dark:text-[#a8c294]">
              <Check size={24} />
            </div>
            <h2 className="mt-5 font-display text-xl font-semibold text-[#262920] dark:text-[#e4e7de]">
              今天的复习完成了
            </h2>
            <p className="mt-2 text-sm text-[#74796d] dark:text-[#989e90]">
              新创建的卡片与之后到期的卡片会按照 FSRS 调度自动出现在这里。
            </p>
            <button
              onClick={onGoNotes}
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#30352a] px-5 text-sm font-medium text-white hover:bg-[#41473a] dark:bg-[#6d8459] dark:text-[#171a16]"
            >
              回到笔记继续整理
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Card Progress Bar */}
          {dueCards.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {dueCards.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setIndex(i);
                    setResponse('');
                    setShowReference(false);
                    setShowContext(false);
                  }}
                  className={`min-h-[38px] min-w-[38px] shrink-0 rounded-xl px-2.5 text-xs font-medium tabular-nums transition ${
                    i === index
                      ? 'bg-[#30352a] text-white dark:bg-[#6d8459] dark:text-[#171a16]'
                      : 'border border-[#e3e5dd] bg-white text-[#6c7165] dark:border-[#343a2f] dark:bg-[#1e221b] dark:text-[#989e90]'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Active Card */}
          <article className="rounded-2xl border border-[#e3e5dd] bg-white p-5 sm:p-7 dark:border-[#32372d] dark:bg-[#1e221b]">
            <div className="flex items-center justify-between gap-2 text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">
              <span>{current.noteTitle || '独立卡片'}</span>
              <span>
                第 {index + 1} / {dueCards.length} 张
              </span>
            </div>

            <div className="markdown-preview mt-4 text-base leading-7 text-[#262920] dark:text-[#e4e7de]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                {current.question}
              </ReactMarkdown>
            </div>

            {current.excerpt && current.excerpt !== current.question && (
              <div className="mt-3">
                <button
                  onClick={() => setShowContext((v) => !v)}
                  className="flex min-h-[40px] items-center gap-1 text-xs font-medium text-[#667858] hover:underline dark:text-[#a3be8e]"
                >
                  {showContext ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  {showContext ? '收起原文上下文' : '查看原文上下文'}
                </button>
                {showContext && (
                  <div className="mt-2 rounded-xl bg-[#faf9f4] p-3.5 text-sm leading-6 text-[#5f5b4d] dark:bg-[#242820] dark:text-[#c7cbc0]">
                    {current.excerpt}
                  </div>
                )}
              </div>
            )}

            <label className="mt-5 block">
              <span className="text-xs font-medium text-[#6c7165] dark:text-[#989e90]">
                先尝试回忆并写下答案（可选）
              </span>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={3}
                placeholder="输入你的回忆内容，提交后可对比参考答案…"
                className="mt-2 w-full resize-y rounded-xl border border-[#e3e5dd] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#262920] outline-none focus:border-[#788b68] dark:border-[#343a2f] dark:bg-[#171a16] dark:text-[#e2e5dc]"
              />
            </label>

            {!showReference ? (
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                <button
                  onClick={() => setShowReference(true)}
                  className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-[#30352a] px-5 text-sm font-medium text-white transition hover:bg-[#41473a] dark:bg-[#6d8459] dark:text-[#171a16]"
                >
                  查看参考答案
                </button>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => void rate(2)}
                    className="min-h-[48px] flex-1 rounded-xl bg-[#f3eee0] px-4 text-xs font-medium text-[#836e43] hover:bg-[#ebe3cf] sm:flex-initial dark:bg-[#363122] dark:text-[#e2cd96]"
                  >
                    直接记为困难
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void rate(3)}
                    className="min-h-[48px] flex-1 rounded-xl bg-[#e9eee3] px-4 text-xs font-medium text-[#556a46] hover:bg-[#dee6d5] sm:flex-initial dark:bg-[#2a3625] dark:text-[#bdd3ab]"
                  >
                    直接记为记得
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-[#dce4d4] bg-[#f6f8f3] p-4 dark:border-[#394532] dark:bg-[#232b1f]">
                  <p className="text-xs font-semibold text-[#5b6f4c] dark:text-[#a3be8e]">参考答案</p>
                  <div className="markdown-preview mt-2 text-sm leading-6 text-[#262920] dark:text-[#e4e7de]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                      {current.answer}
                    </ReactMarkdown>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {ratingOptions.map((opt) => (
                    <button
                      key={opt.rating}
                      disabled={busy}
                      onClick={() => void rate(opt.rating)}
                      className={`flex min-h-[56px] flex-col items-center justify-center rounded-xl px-3 py-2 transition disabled:opacity-50 ${opt.className}`}
                    >
                      <span className="text-sm font-semibold">{opt.label}</span>
                      <span className="mt-0.5 text-[11px] opacity-80 tabular-nums">
                        {current.intervalPreviews?.[opt.rating] ?? opt.sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  );
}
