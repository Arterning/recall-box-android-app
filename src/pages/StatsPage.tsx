import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, BarChart3, BookOpenCheck, Clock3, LoaderCircle } from 'lucide-react';
import { api, toErrorMessage, type OverviewData } from '../lib/api';

const ratingLabels: Record<string, string> = {
  '1': '忘了',
  '2': '困难',
  '3': '记得',
  '4': '简单',
};

const ratingStyles: Record<string, string> = {
  '1': 'bg-[#d98a74]',
  '2': 'bg-[#d1b46a]',
  '3': 'bg-[#7d9769]',
  '4': 'bg-[#649684]',
};

export function StatsPage({
  onGoReview,
  onGoHistory,
}: {
  onGoReview: () => void;
  onGoHistory: () => void;
}) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api<OverviewData>(`/api/reviews/overview?year=${selectedYear}`)
      .then(setData)
      .catch((cause) => setError(toErrorMessage(cause, '加载统计数据失败')))
      .finally(() => setLoading(false));
  }, [selectedYear]);

  const noteHeatmap = useMemo(() => {
    const days = data?.noteDays ?? [];
    if (days.length === 0) return [];
    const [fy, fm, fd] = days[0].date.split('-').map(Number);
    const startPadding = new Date(fy, fm - 1, fd).getDay();
    const padded = [
      ...Array.from({ length: startPadding }, () => ({ date: '', count: 0 })),
      ...days,
    ];
    const weeks: Array<Array<{ date: string; count: number }>> = [];
    for (let i = 0; i < padded.length; i += 7) {
      const slice = padded.slice(i, i + 7);
      while (slice.length < 7) slice.push({ date: '', count: 0 });
      weeks.push(slice);
    }
    return weeks;
  }, [data?.noteDays]);

  if (loading && !data) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-[#8a8f82]">
        <LoaderCircle size={18} className="animate-spin" />
        正在统计学习记录…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-[#e8c6bc] bg-[#fdf3f0] px-4 py-3 text-sm text-[#8f4938]">
        {error || '无法加载统计数据'}
      </div>
    );
  }

  const { summary } = data;
  const maxReviews = Math.max(1, ...data.days.map((d) => d.count));
  const maxNotesInDay = Math.max(1, ...data.noteDays.map((d) => d.count));
  const totalRatings = Object.values(data.ratings).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#262920] dark:text-[#e4e7de]">
            统计与复盘
          </h1>
          <p className="mt-1 text-xs text-[#74796d] dark:text-[#989e90]">
            追踪笔记积累、FSRS 复习频率与记忆自评分布
          </p>
        </div>
        <button
          onClick={onGoHistory}
          className="min-h-[44px] rounded-xl border border-[#e3e5dd] bg-white px-4 text-xs font-medium text-[#5e6357] hover:bg-[#f8f9f5] dark:border-[#343a2f] dark:bg-[#1e221b] dark:text-[#cfd4c8]"
        >
          查看完整提交历史
        </button>
      </div>

      {/* 4 Summary Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={<BookOpenCheck size={16} />}
          label="今日复习"
          value={summary.reviewedToday}
          hint={`${summary.due} 张卡片待复习`}
        />
        <MetricCard
          icon={<Activity size={16} />}
          label="近 30 天"
          value={summary.reviewsLast30Days}
          hint="次复习提交"
        />
        <MetricCard
          icon={<BarChart3 size={16} />}
          label="累计复习"
          value={summary.totalReviews}
          hint={`${summary.cards} 张卡片 · ${summary.notes} 篇笔记`}
        />
        <MetricCard
          icon={<Clock3 size={16} />}
          label="平均自评"
          value={summary.totalReviews ? `${summary.averageRating.toFixed(1)} / 4` : '—'}
          hint="1 忘了 · 4 简单"
        />
      </div>

      {/* Note Creation Heatmap */}
      <section className="rounded-2xl border border-[#e3e5dd] bg-white p-5 dark:border-[#32372d] dark:bg-[#1e221b]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold">笔记创建热力图</h2>
            <p className="mt-0.5 text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">
              {selectedYear} 年每日新建笔记分布
            </p>
          </div>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="min-h-[40px] rounded-xl border border-[#e3e5dd] bg-white px-3 text-xs tabular-nums outline-none dark:border-[#343a2f] dark:bg-[#171a16]"
            aria-label="选择年份"
          >
            {data.noteYears.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex gap-1 min-w-[700px]">
            {noteHeatmap.map((week, wIdx) => (
              <div key={wIdx} className="grid grid-rows-7 gap-1">
                {week.map((day, dIdx) => {
                  if (!day.date) {
                    return <span key={`empty-${wIdx}-${dIdx}`} className="size-[11px]" />;
                  }
                  const level =
                    day.count === 0
                      ? 0
                      : day.count >= maxNotesInDay
                        ? 4
                        : Math.ceil((day.count / maxNotesInDay) * 4);
                  const colors = [
                    'bg-[#eff0ea] dark:bg-[#252922]',
                    'bg-[#dce5d3] dark:bg-[#313f29]',
                    'bg-[#bed1ae] dark:bg-[#435b36]',
                    'bg-[#98b482] dark:bg-[#587947]',
                    'bg-[#6c8757] dark:bg-[#769e60]',
                  ];
                  return (
                    <span
                      key={day.date}
                      title={`${day.date}：${day.count} 篇笔记`}
                      className={`size-[11px] rounded-[2.5px] ${colors[level]}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 30-day Chart & Rating Distribution */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)]">
        <section className="rounded-2xl border border-[#e3e5dd] bg-white p-5 dark:border-[#32372d] dark:bg-[#1e221b]">
          <h2 className="font-display text-sm font-semibold">每日复习量（近 30 天）</h2>
          <p className="mt-0.5 text-xs text-[#74796d] dark:text-[#989e90]">
            深色部分表示「记得」或「简单」
          </p>
          <div className="mt-6 flex h-40 items-end gap-[3px] sm:gap-1.5">
            {data.days.map((day, idx) => {
              const h = day.count ? Math.max(8, (day.count / maxReviews) * 100) : 2;
              const goodRatio = day.count ? (day.good / day.count) * 100 : 0;
              return (
                <div key={day.date} className="relative flex h-full min-w-0 flex-1 items-end">
                  <div
                    title={`${day.date}：${day.count} 次（记得/简单 ${day.good} 次）`}
                    className="relative w-full overflow-hidden rounded-t-[4px] bg-[#e5e9de] dark:bg-[#2c3127]"
                    style={{ height: `${h}%`, minHeight: day.count ? 8 : 2 }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-[4px] bg-[#788f64]"
                      style={{ height: `${goodRatio}%` }}
                    />
                  </div>
                  {idx % 7 === 0 && (
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-[#8a8f82] tabular-nums">
                      {day.date.slice(5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-7 text-right text-xs text-[#74796d] tabular-nums">
            近 30 天共 {summary.reviewsLast30Days} 次提交
          </div>
        </section>

        <section className="rounded-2xl border border-[#e3e5dd] bg-white p-5 dark:border-[#32372d] dark:bg-[#1e221b]">
          <h2 className="font-display text-sm font-semibold">记忆自评分布</h2>
          <p className="mt-0.5 text-xs text-[#74796d] dark:text-[#989e90]">FSRS 四档评分比例</p>
          {totalRatings > 0 ? (
            <div className="mt-5 space-y-4">
              {Object.entries(ratingLabels).map(([key, label]) => {
                const count = data.ratings[key] || 0;
                const pct = (count / totalRatings) * 100;
                return (
                  <div key={key}>
                    <div className="mb-1.5 flex items-center justify-between text-xs tabular-nums">
                      <span>{label}</span>
                      <span className="text-[#74796d] dark:text-[#989e90]">
                        {count} 次 · {Math.round(pct)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#eff0ea] dark:bg-[#2a2e26]">
                      <div className={`h-full rounded-full ${ratingStyles[key]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-8 text-center text-xs text-[#8a8f82]">完成复习评分后将在此显示分布。</p>
          )}
        </section>
      </div>

      {/* Recent Submissions */}
      <section className="rounded-2xl border border-[#e3e5dd] bg-white p-5 dark:border-[#32372d] dark:bg-[#1e221b]">
        <h2 className="font-display text-sm font-semibold">最近提交的回答</h2>
        {data.recent.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#8a8f82]">
            还没有复习记录，
            <button onClick={onGoReview} className="ml-1 font-medium text-[#667858] underline">
              立即开始复习
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {data.recent.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[#eceee7] bg-[#fcfcfa] p-4 dark:border-[#2e332a] dark:bg-[#171a16]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">
                  <span>
                    {item.noteTitle || '独立卡片'} ·{' '}
                    {new Date(item.reviewedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span className="font-medium text-[#556a46] dark:text-[#a8c294]">
                    {ratingLabels[String(item.rating)] || '已评分'}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-[#262920] dark:text-[#e4e7de]">
                  {item.question || item.excerpt}
                </p>
                <p className="mt-1.5 text-xs text-[#666c5d] dark:text-[#a4aa9b]">
                  我的回答：{item.response || '（未填写文字回答）'}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e3e5dd] bg-white p-4 dark:border-[#32372d] dark:bg-[#1e221b]">
      <div className="flex items-center gap-2 text-xs text-[#74796d] dark:text-[#989e90]">
        <span className="text-[#788b68]">{icon}</span>
        <span>{label}</span>
      </div>
      <p className="mt-2.5 font-display text-2xl font-semibold tracking-tight tabular-nums text-[#262920] dark:text-[#e4e7de]">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[#8a8f82] tabular-nums">{hint}</p>
    </div>
  );
}
