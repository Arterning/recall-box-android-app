import { useEffect, useState } from 'react';
import { ArrowLeft, History, LoaderCircle } from 'lucide-react';
import { api, toErrorMessage, type ReviewHistoryItem } from '../lib/api';

const ratingLabels: Record<number, string> = {
  1: '忘了',
  2: '困难',
  3: '记得',
  4: '简单',
};

export function ReviewHistoryPage({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<ReviewHistoryItem[]>('/api/reviews/history')
      .then(setItems)
      .catch((cause) => setError(toErrorMessage(cause, '加载复习历史失败')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#262920] dark:text-[#e4e7de]">
            提交历史
          </h1>
          <p className="mt-1 text-xs text-[#74796d] dark:text-[#989e90]">
            查看每次复习提交的回忆内容、FSRS 自评等级与时间记录
          </p>
        </div>
        <button
          onClick={onBack}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#e3e5dd] bg-white px-3.5 text-xs font-medium text-[#5e6357] hover:bg-[#f8f9f5] dark:border-[#343a2f] dark:bg-[#1e221b] dark:text-[#cfd4c8]"
        >
          <ArrowLeft size={15} />
          返回复习
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#e8c6bc] bg-[#fdf3f0] px-4 py-2.5 text-sm text-[#8f4938]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[#8a8f82]">
          <LoaderCircle size={17} className="animate-spin" />
          正在加载提交历史…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d8dbd0] bg-[#fbfbf8] px-6 py-16 text-center dark:border-[#343a2f] dark:bg-[#1e221b]">
          <History size={24} className="mx-auto text-[#788b68]" />
          <h2 className="mt-4 font-display text-lg font-semibold">还没有提交记录</h2>
          <p className="mt-1.5 text-sm text-[#74796d]">完成一次复习并评分后，记录会出现在这里。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-[#e3e5dd] bg-white p-5 dark:border-[#32372d] dark:bg-[#1e221b]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">
                <span>
                  {item.noteTitle || '独立卡片'} · 卡片 #{item.cardId}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#556a46] dark:text-[#a8c294]">
                    {ratingLabels[item.rating] || `评分 ${item.rating}`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <time>
                    {new Date(item.reviewedAt).toLocaleString('zh-CN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </div>
              </div>
              <h2 className="mt-2.5 whitespace-pre-wrap text-sm font-medium leading-6 text-[#262920] dark:text-[#e4e7de]">
                {item.question || item.excerpt || '卡片问题已不可用'}
              </h2>
              <div className="mt-3 rounded-xl bg-[#f7f8f4] p-3.5 dark:bg-[#171a16]">
                <p className="text-[11px] font-semibold text-[#7b8472]">我的回答</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#3f4438] dark:text-[#cfd4c8]">
                  {item.response || '（未填写文字回答）'}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
