import { useCallback, useEffect, useState } from 'react';
import {
  BookOpenText,
  Brain,
  ChartNoAxesColumnIncreasing,
  Layers3,
  Moon,
  NotebookPen,
  Settings2,
  Sun,
} from 'lucide-react';
import { api, type Stats } from './lib/api';
import { CardsPage } from './pages/CardsPage';
import { DiaryPage } from './pages/DiaryPage';
import { NotesPage } from './pages/NotesPage';
import { ReviewHistoryPage } from './pages/ReviewHistoryPage';
import { ReviewPage } from './pages/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';

type TabKey = 'notes' | 'review' | 'cards' | 'diary' | 'stats' | 'settings' | 'history';

const navItems: Array<{ key: TabKey; label: string; shortLabel: string; icon: typeof BookOpenText }> = [
  { key: 'notes', label: '笔记', shortLabel: '笔记', icon: BookOpenText },
  { key: 'review', label: '今日复习', shortLabel: '复习', icon: Brain },
  { key: 'cards', label: '卡片库', shortLabel: '卡片', icon: Layers3 },
  { key: 'diary', label: '日记', shortLabel: '日记', icon: NotebookPen },
  { key: 'stats', label: '统计', shortLabel: '统计', icon: ChartNoAxesColumnIncreasing },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>('notes');
  const [dueCount, setDueCount] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const [dark, setDark] = useState(() => localStorage.getItem('recall-box-theme') === 'dark');

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      localStorage.setItem('recall-box-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('recall-box-theme', 'light');
    }
  }, [dark]);

  const refreshStats = useCallback(() => {
    api<Stats>('/api/reviews/stats')
      .then((s) => setDueCount(s.due))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshStats();
    const timer = window.setInterval(refreshStats, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshStats]);

  const handleDataImported = () => {
    refreshStats();
    setDataVersion((v) => v + 1);
  };

  return (
    <div className="min-h-screen bg-[#f4f4ef] text-[#262920] dark:bg-[#171a16] dark:text-[#e2e5dc]">
      {/* Mobile Compact Top App Bar (< lg) */}
      <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between border-b border-[#e3e5dd] bg-[#f4f4ef]/90 px-4 backdrop-blur-md lg:hidden dark:border-[#2e332a] dark:bg-[#171a16]/90">
        <button
          onClick={() => setTab('notes')}
          className="font-display text-base font-bold tracking-tight text-[#262920] whitespace-nowrap shrink-0 dark:text-[#e4e7de]"
        >
          Recall Box
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDark((d) => !d)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#5e6357] hover:bg-white/70 dark:text-[#cfd4c8] dark:hover:bg-[#23281f]"
            aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition ${
              tab === 'settings'
                ? 'bg-[#e7ebe1] text-[#30352a] dark:bg-[#2d3627] dark:text-[#d5e6c7]'
                : 'text-[#5e6357] hover:bg-white/70 dark:text-[#cfd4c8] dark:hover:bg-[#23281f]'
            }`}
            aria-label="设置与 SQLite 同步"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      {/* Desktop 3-Zone Top Bar (>= lg) */}
      <header className="hidden lg:block border-b border-[#e3e5dd] bg-[#f4f4ef] dark:border-[#2e332a] dark:bg-[#171a16]">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-7">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            onClick={() => setTab('notes')}
            className="font-display text-lg font-bold tracking-tight text-[#262920] whitespace-nowrap shrink-0 dark:text-[#e4e7de]"
          >
            Recall Box
          </button>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="flex items-center gap-7 text-sm font-medium">
            {navItems.map((item) => {
              const active =
                tab === item.key || (item.key === 'review' && tab === 'history');
              return (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  className={`relative flex min-h-[44px] items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'text-[#262920] font-semibold dark:text-white'
                      : 'text-[#6c7165] hover:text-[#262920] dark:text-[#989e90] dark:hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.key === 'review' && dueCount > 0 && (
                    <span className="text-xs font-semibold text-[#5b724b] tabular-nums dark:text-[#a3be8e]">
                      ({dueCount})
                    </span>
                  )}
                  {active && (
                    <span className="absolute inset-x-0 bottom-1 h-0.5 rounded-full bg-[#30352a] dark:bg-[#a3be8e]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setDark((d) => !d)}
              className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-[#e0e2da] bg-white text-[#5e6357] hover:bg-[#f8f9f5] dark:border-[#343a2f] dark:bg-[#1e221b] dark:text-[#cfd4c8]"
              aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setTab('settings')}
              className="flex min-h-[42px] items-center gap-2 rounded-xl bg-[#30352a] px-4 text-xs font-medium text-white transition hover:bg-[#41473a] whitespace-nowrap shrink-0 dark:bg-[#6d8459] dark:text-[#171a16]"
            >
              <Settings2 size={14} />
              设置与数据
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        key={dataVersion}
        className="mx-auto max-w-[1440px] px-4 pt-4 pb-24 lg:px-7 lg:py-6"
      >
        {tab === 'notes' && <NotesPage onStatsChanged={refreshStats} />}
        {tab === 'review' && (
          <ReviewPage
            onOpenHistory={() => setTab('history')}
            onGoNotes={() => setTab('notes')}
            onStatsChanged={refreshStats}
          />
        )}
        {tab === 'history' && <ReviewHistoryPage onBack={() => setTab('review')} />}
        {tab === 'cards' && <CardsPage onStatsChanged={refreshStats} />}
        {tab === 'diary' && <DiaryPage />}
        {tab === 'stats' && (
          <StatsPage
            onGoReview={() => setTab('review')}
            onGoHistory={() => setTab('history')}
          />
        )}
        {tab === 'settings' && <SettingsPage onDataImported={handleDataImported} />}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (< lg, <= 60px) */}
      <nav
        aria-label="主导航"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-[60px] grid-cols-5 items-center border-t border-[#e3e5dd] bg-[#f4f4ef]/95 backdrop-blur-md lg:hidden dark:border-[#2e332a] dark:bg-[#171a16]/95"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            tab === item.key || (item.key === 'review' && tab === 'history');
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                active
                  ? 'text-[#30352a] font-semibold dark:text-[#a8c294]'
                  : 'text-[#74796d] dark:text-[#989e90]'
              }`}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                {item.key === 'review' && dueCount > 0 && (
                  <span className="absolute -right-2.5 -top-1 text-[10px] font-bold text-[#5b724b] tabular-nums dark:text-[#a8c294]">
                    {dueCount > 99 ? '99+' : dueCount}
                  </span>
                )}
              </div>
              <span className="whitespace-nowrap">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
