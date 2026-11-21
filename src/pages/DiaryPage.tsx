import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  LoaderCircle,
  PencilLine,
  Save,
  Trash2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, toErrorMessage, type DiaryEntry, type DiarySummary } from '../lib/api';

function localDateString(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function displayDate(dateStr: string, opts?: Intl.DateTimeFormatOptions) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(
    'zh-CN',
    opts ?? { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
  ).format(dt);
}

export function DiaryPage() {
  const today = useMemo(() => localDateString(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [entries, setEntries] = useState<DiarySummary[]>([]);
  const [entry, setEntry] = useState<DiaryEntry>({
    id: 0,
    date: today,
    content: '',
    createdAt: '',
    updatedAt: '',
  });
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dirty = content !== savedContent;

  const loadEntries = useCallback(async (m: string) => {
    setLoadingEntries(true);
    try {
      setEntries(await api<DiarySummary[]>(`/api/diaries?month=${m}`));
    } catch (cause) {
      setError(toErrorMessage(cause, '加载月份日记失败'));
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  const loadEntry = useCallback(async (dateStr: string) => {
    setLoadingEntry(true);
    try {
      const loaded = await api<DiaryEntry>(`/api/diaries/${dateStr}`);
      setEntry(loaded);
      setContent(loaded.content);
      setSavedContent(loaded.content);
    } catch (cause) {
      setError(toErrorMessage(cause, '加载日记失败'));
    } finally {
      setLoadingEntry(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries(month);
  }, [month, loadEntries]);

  useEffect(() => {
    void loadEntry(selectedDate);
  }, [selectedDate, loadEntry]);

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api<DiaryEntry>(`/api/diaries/${selectedDate}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
      setEntry(saved);
      setContent(saved.content);
      setSavedContent(saved.content);
      await loadEntries(month);
    } catch (cause) {
      setError(toErrorMessage(cause, '保存日记失败'));
    } finally {
      setSaving(false);
    }
  }, [content, dirty, loadEntries, month, saving, selectedDate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  const remove = async () => {
    if (!entry.id || !window.confirm(`确定删除 ${displayDate(selectedDate)} 的日记吗？`)) return;
    try {
      await api(`/api/diaries/${selectedDate}`, { method: 'DELETE' });
      setEntry({ id: 0, date: selectedDate, content: '', createdAt: '', updatedAt: '' });
      setContent('');
      setSavedContent('');
      await loadEntries(month);
    } catch (cause) {
      setError(toErrorMessage(cause, '删除日记失败'));
    }
  };

  const chooseDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setMonth(dateStr.slice(0, 7));
  };

  const moveMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const dt = new Date(y, m - 1 + delta, 1);
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };

  const [yNum, mNum] = month.split('-').map(Number);
  const monthDate = new Date(yNum, mNum - 1, 1);
  const firstWeekday = monthDate.getDay();
  const daysInMonth = new Date(yNum, mNum, 0).getDate();
  const calendarCells: Array<string | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, idx) => `${month}-${String(idx + 1).padStart(2, '0')}`),
  ];
  const entryDates = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#262920] dark:text-[#e4e7de]">
            日记
          </h1>
          <p className="mt-1 text-xs text-[#74796d] dark:text-[#989e90]">
            按自然日记录学到的概念、疑问与当日复盘
          </p>
        </div>
        <button
          onClick={() => chooseDate(today)}
          className="min-h-[44px] rounded-xl border border-[#e3e5dd] bg-white px-4 text-xs font-medium text-[#5e6357] hover:bg-[#f8f9f5] dark:border-[#343a2f] dark:bg-[#1e221b] dark:text-[#cfd4c8]"
        >
          回到今天
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#e8c6bc] bg-[#fdf3f0] px-4 py-2.5 text-sm text-[#8f4938]">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:h-[calc(100vh-11rem)] lg:min-h-[540px] lg:grid-cols-[310px_minmax(0,1fr)]">
        {/* Calendar Sidebar */}
        <aside className="flex flex-col overflow-hidden rounded-2xl border border-[#e3e5dd] bg-[#fbfbf8] p-4 dark:border-[#32372d] dark:bg-[#1e221b]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#5b6154] dark:text-[#d8dcd2]">学习日历</p>
              <p className="mt-0.5 text-[11px] text-[#8a8f82] tabular-nums">{entries.length} 天有记录</p>
            </div>
            <CalendarDays size={17} className="text-[#788b68]" />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => moveMonth(-1)}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg hover:bg-white dark:hover:bg-[#262b22]"
              aria-label="上个月"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold tabular-nums">
              {new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(monthDate)}
            </p>
            <button
              onClick={() => moveMonth(1)}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg hover:bg-white dark:hover:bg-[#262b22]"
              aria-label="下个月"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 text-center text-[11px] text-[#8a8f82]">
            {'日一二三四五六'.split('').map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {calendarCells.map((day, idx) =>
              day ? (
                <button
                  key={day}
                  onClick={() => chooseDate(day)}
                  className={`relative mx-auto flex size-9 items-center justify-center rounded-xl text-xs tabular-nums transition ${
                    day === selectedDate
                      ? 'bg-[#30352a] font-semibold text-white dark:bg-[#6d8459] dark:text-[#171a16]'
                      : day === today
                        ? 'bg-[#e9eee3] font-semibold text-[#556a46] dark:bg-[#2d3627] dark:text-[#bdd3ab]'
                        : 'text-[#4f5549] hover:bg-white dark:text-[#cfd4c8] dark:hover:bg-[#262b22]'
                  }`}
                >
                  <span>{Number(day.slice(-2))}</span>
                  {entryDates.has(day) && (
                    <span
                      className={`absolute bottom-1 size-1 rounded-full ${
                        day === selectedDate ? 'bg-[#d8e6cb]' : 'bg-[#788b68]'
                      }`}
                    />
                  )}
                </button>
              ) : (
                <span key={`empty-${idx}`} />
              ),
            )}
          </div>

          <div className="mt-4 hidden min-h-0 flex-1 flex-col border-t border-[#eaebe4] pt-3 lg:flex dark:border-[#2e332a]">
            <p className="mb-2 text-xs font-semibold text-[#74796d]">本月记录</p>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {loadingEntries ? (
                <p className="px-2 py-3 text-xs text-[#8a8f82]">加载中…</p>
              ) : entries.length === 0 ? (
                <p className="px-2 py-3 text-xs text-[#8a8f82]">本月还没有日记。</p>
              ) : (
                entries.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => chooseDate(item.date)}
                    className={`w-full rounded-xl px-3 py-2 text-left transition ${
                      item.date === selectedDate
                        ? 'bg-[#e9eee3] dark:bg-[#2c3427]'
                        : 'hover:bg-white dark:hover:bg-[#262b22]'
                    }`}
                  >
                    <p className="text-xs font-medium text-[#262920] tabular-nums dark:text-[#e4e7de]">
                      {displayDate(item.date, { month: 'numeric', day: 'numeric', weekday: 'short' })}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#74796d] dark:text-[#989e90]">
                      {item.excerpt || '（空日记）'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Diary Editor/Preview */}
        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[#e3e5dd] bg-white dark:border-[#32372d] dark:bg-[#1e221b]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eaebe4] px-4 py-3.5 sm:px-6 dark:border-[#2e332a]">
            <div>
              <p className="text-xs text-[#74796d] dark:text-[#989e90]">
                {selectedDate === today ? '今天' : '学习记录'}
              </p>
              <h2 className="font-display text-base font-semibold text-[#262920] dark:text-[#e4e7de]">
                {displayDate(selectedDate)}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-xl bg-[#f2f3ed] p-1 dark:bg-[#262b22]">
                <button
                  onClick={() => setView('edit')}
                  className={`flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium ${
                    view === 'edit'
                      ? 'bg-white text-[#262920] shadow-xs dark:bg-[#343b2f] dark:text-white'
                      : 'text-[#74796d]'
                  }`}
                >
                  <PencilLine size={13} />
                  编辑
                </button>
                <button
                  onClick={() => setView('preview')}
                  className={`flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium ${
                    view === 'preview'
                      ? 'bg-white text-[#262920] shadow-xs dark:bg-[#343b2f] dark:text-white'
                      : 'text-[#74796d]'
                  }`}
                >
                  <Eye size={13} />
                  预览
                </button>
              </div>

              {entry.id > 0 && (
                <button
                  onClick={() => void remove()}
                  className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl text-[#a35b4a] hover:bg-[#fdf2ef] dark:text-[#e09887]"
                  aria-label="删除日记"
                >
                  <Trash2 size={15} />
                </button>
              )}

              <button
                disabled={!dirty || saving || loadingEntry}
                onClick={() => void save()}
                className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#30352a] px-3.5 text-xs font-medium text-white disabled:opacity-45 dark:bg-[#6d8459] dark:text-[#171a16]"
              >
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? '保存中…' : dirty ? '保存日记' : '已保存'}
              </button>
            </div>
          </div>

          {loadingEntry ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[#8a8f82]">
              <LoaderCircle size={16} className="animate-spin" />
              正在加载日记…
            </div>
          ) : view === 'edit' ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="今天学到了什么？有什么卡住的问题？支持 Markdown。"
              className="min-h-[300px] flex-1 resize-none px-5 py-5 font-mono text-[13.5px] leading-[1.85] text-[#2f3328] outline-none placeholder:font-sans placeholder:text-[#a8aba0] dark:bg-transparent dark:text-[#dce0d5]"
            />
          ) : (
            <article className="markdown-preview min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                {content || '*这一天还没有记录。切换到编辑开始写日记。*'}
              </ReactMarkdown>
            </article>
          )}

          <div className="flex items-center justify-between border-t border-[#f0f1eb] px-5 py-2.5 text-[11px] text-[#8a8f82] tabular-nums dark:border-[#2a2f26]">
            <span>{content.length.toLocaleString()} 字符</span>
            <span>{dirty ? '有未保存的修改' : '已存入 SQLite 数据库'}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
