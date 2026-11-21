import {
  useCallback,
  useEffect,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Layers3,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { MarkdownNote, type PreviewSelection } from '../components/MarkdownNote';
import {
  api,
  toErrorMessage,
  uploadClipboardImages,
  type Annotation,
  type Card,
  type CardListResult,
} from '../lib/api';

type CardSelection = PreviewSelection & { field: 'question' | 'answer' | 'context' };

function dueLabel(value: string | null) {
  if (!value) return '待复习';
  const due = new Date(value);
  if (due.getTime() <= Date.now()) return '待复习';
  return `下次：${due.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}

export function CardsPage({ onStatsChanged }: { onStatsChanged?: () => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'due' | 'created_desc'>('due');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [draft, setDraft] = useState({ question: '', answer: '', context: '' });
  const [saving, setSaving] = useState(false);

  const [viewCard, setViewCard] = useState<Card | null>(null);
  const [cardAnnotations, setCardAnnotations] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<CardSelection | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<string | null>(null);
  const [showAnswerInModal, setShowAnswerInModal] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);

  const load = useCallback(
    async (q: string, p: number) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(pageSize),
          sort,
        });
        if (q.trim()) params.set('q', q.trim());
        const res = await api<CardListResult>(`/api/cards?${params}`);
        setCards(res.items);
        setTotalCards(res.total);
        setDueCount(res.dueCount);
      } catch (cause) {
        setError(toErrorMessage(cause, '加载卡片库失败'));
      } finally {
        setLoading(false);
      }
    },
    [sort],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(search, page), 160);
    return () => window.clearTimeout(timer);
  }, [load, search, page]);

  const openDetail = async (card: Card) => {
    setViewCard(card);
    setShowAnswerInModal(false);
    setSelection(null);
    setAnnotationDraft(null);
    try {
      setCardAnnotations(await api<Annotation[]>(`/api/cards/${card.id}/annotations`));
    } catch {
      setCardAnnotations([]);
    }
  };

  const handleSubmitForm = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingCard) {
        const updated = await api<Card>(`/api/cards/${editingCard.id}`, {
          method: 'PUT',
          body: JSON.stringify(draft),
        });
        setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        if (viewCard?.id === updated.id) setViewCard(updated);
      } else {
        await api<Card>('/api/cards', {
          method: 'POST',
          body: JSON.stringify(draft),
        });
        await load(search, 1);
        setPage(1);
      }
      setCreateOpen(false);
      setEditingCard(null);
      setDraft({ question: '', answer: '', context: '' });
      onStatsChanged?.();
    } catch (cause) {
      setError(toErrorMessage(cause, '保存卡片失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (card: Card) => {
    if (!window.confirm('确定删除这张记忆卡片吗？')) return;
    try {
      await api(`/api/cards/${card.id}`, { method: 'DELETE' });
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      setTotalCards((t) => Math.max(0, t - 1));
      if (viewCard?.id === card.id) setViewCard(null);
      onStatsChanged?.();
    } catch (cause) {
      setError(toErrorMessage(cause, '删除卡片失败'));
    }
  };

  const pasteImage = async (
    event: ClipboardEvent<HTMLTextAreaElement>,
    field: 'question' | 'answer' | 'context',
  ) => {
    try {
      const refs = await uploadClipboardImages(event);
      if (!refs) return;
      const el = event.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const val = draft[field];
      setDraft((d) => ({
        ...d,
        [field]: `${val.slice(0, start)}\n\n${refs.join('\n\n')}\n\n${val.slice(end)}`.trim(),
      }));
    } catch (cause) {
      setError(toErrorMessage(cause, '图片上传失败'));
    }
  };

  const saveCardAnnotation = async (comment: string) => {
    if (!viewCard || !selection) return;
    try {
      const created = await api<Annotation>(`/api/cards/${viewCard.id}/annotations`, {
        method: 'POST',
        body: JSON.stringify({
          field: selection.field,
          excerpt: selection.excerpt,
          sourceText: selection.sourceText,
          startOffset: selection.start,
          endOffset: selection.end,
          comment,
        }),
      });
      setCardAnnotations((prev) => [created, ...prev]);
      setAnnotationDraft(null);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    } catch (cause) {
      setError(toErrorMessage(cause, '添加批注失败'));
    }
  };

  const quickReviewInDetail = async (rating: 1 | 2 | 3 | 4) => {
    if (!viewCard || reviewBusy) return;
    setReviewBusy(true);
    try {
      const res = await api<{ card: Card; dueAt: string }>(`/api/cards/${viewCard.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating, response: '' }),
      });
      setViewCard({ ...viewCard, dueAt: res.dueAt });
      setCards((prev) => prev.map((c) => (c.id === viewCard.id ? { ...c, dueAt: res.dueAt } : c)));
      onStatsChanged?.();
    } catch (cause) {
      setError(toErrorMessage(cause, '评分失败'));
    } finally {
      setReviewBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#262920] dark:text-[#e4e7de]">
            卡片库
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">
            <span>共 {totalCards} 张卡片</span>
            <span aria-hidden="true">·</span>
            <span>当前到期 {dueCount} 张</span>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingCard(null);
            setDraft({ question: '', answer: '', context: '' });
            setCreateOpen(true);
          }}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#30352a] px-4 text-xs font-medium text-white hover:bg-[#41473a] whitespace-nowrap dark:bg-[#6d8459] dark:text-[#171a16]"
        >
          <Plus size={15} />
          新建独立卡片
        </button>
      </div>

      {/* Filter & Sort Bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex flex-1 items-center sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 text-[#8a8f82]" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="搜索问题、答案、上下文或笔记名…"
            className="min-h-[44px] w-full rounded-xl border border-[#e3e5dd] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#788b68] dark:border-[#343a2f] dark:bg-[#1e221b]"
          />
        </label>

        <div className="flex rounded-xl bg-[#eaebe4] p-1 self-start dark:bg-[#232720]">
          <button
            onClick={() => setSort('due')}
            className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition whitespace-nowrap ${
              sort === 'due'
                ? 'bg-white text-[#262920] shadow-xs dark:bg-[#343b2f] dark:text-white'
                : 'text-[#6c7165] dark:text-[#989e90]'
            }`}
          >
            按到期时间
          </button>
          <button
            onClick={() => setSort('created_desc')}
            className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition whitespace-nowrap ${
              sort === 'created_desc'
                ? 'bg-white text-[#262920] shadow-xs dark:bg-[#343b2f] dark:text-white'
                : 'text-[#6c7165] dark:text-[#989e90]'
            }`}
          >
            最近创建
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#e8c6bc] bg-[#fdf3f0] px-4 py-2.5 text-sm text-[#8f4938]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[#8a8f82]">
          <LoaderCircle size={18} className="animate-spin" />
          正在加载卡片…
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d8dbd0] bg-[#fbfbf8] px-6 py-16 text-center dark:border-[#343a2f] dark:bg-[#1e221b]">
          <Layers3 size={24} className="mx-auto text-[#788b68]" />
          <h2 className="mt-4 font-display text-lg font-semibold">没有找到卡片</h2>
          <p className="mt-1.5 text-sm text-[#74796d]">可以在笔记中划选段落制卡，或直接创建独立记忆卡。</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <article
              key={card.id}
              onClick={() => void openDetail(card)}
              className="flex cursor-pointer flex-col justify-between rounded-2xl border border-[#e3e5dd] bg-white p-4 transition hover:border-[#b7c2aa] dark:border-[#32372d] dark:bg-[#1e221b] dark:hover:border-[#5b6d4c]"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">
                  <span className="truncate">{card.noteTitle || '独立卡片'}</span>
                  <span className="shrink-0">{dueLabel(card.dueAt)}</span>
                </div>
                <h2 className="mt-2.5 line-clamp-3 text-sm font-medium leading-6 text-[#262920] dark:text-[#e4e7de]">
                  {card.question}
                </h2>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[#f0f1eb] pt-2.5 text-xs text-[#74796d] dark:border-[#2a2f26]">
                <span className="truncate max-w-[180px] text-[#667858] dark:text-[#a3be8e]">
                  答：{card.answer}
                </span>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      setEditingCard(card);
                      setDraft({ question: card.question, answer: card.answer, context: card.excerpt });
                      setCreateOpen(true);
                    }}
                    className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-[#f2f3ed] dark:hover:bg-[#2b3027]"
                    aria-label="编辑卡片"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => void handleDelete(card)}
                    className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-[#a35b4a] hover:bg-[#fdf2ef] dark:text-[#e09887]"
                    aria-label="删除卡片"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-4 text-xs text-[#74796d] tabular-nums">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-[#e3e5dd] bg-white disabled:opacity-40 dark:border-[#343a2f] dark:bg-[#1e221b]"
          >
            <ChevronLeft size={16} />
          </button>
          <span>第 {page} / {totalPages} 页</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-[#e3e5dd] bg-white disabled:opacity-40 dark:border-[#343a2f] dark:bg-[#1e221b]"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Card Detail Sheet / Modal */}
      {viewCard && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewCard(null);
          }}
        >
          <div className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-2xl sm:p-6 dark:bg-[#1e221b]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">
                <span>{viewCard.noteTitle || '独立卡片'}</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>{dueLabel(viewCard.dueAt)}</span>
              </div>
              <button onClick={() => setViewCard(null)} className="min-h-[40px] min-w-[40px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-[#74796d]">问题（划选文本可高亮/批注）</p>
                <div className="mt-1.5 rounded-xl border border-[#eaebe4] p-3.5 dark:border-[#2e332a]">
                  <MarkdownNote
                    content={viewCard.question}
                    cards={[]}
                    annotations={cardAnnotations.filter((a) => a.field === 'question')}
                    onSelect={(sel) => setSelection(sel ? { ...sel, field: 'question' } : null)}
                  />
                </div>
              </div>

              {viewCard.excerpt && (
                <div>
                  <p className="text-xs font-semibold text-[#74796d]">上下文</p>
                  <div className="mt-1.5 rounded-xl bg-[#faf9f4] p-3.5 text-sm dark:bg-[#242820]">
                    <MarkdownNote
                      content={viewCard.excerpt}
                      cards={[]}
                      annotations={cardAnnotations.filter((a) => a.field === 'context')}
                      onSelect={(sel) => setSelection(sel ? { ...sel, field: 'context' } : null)}
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#74796d]">参考答案</p>
                  <button
                    onClick={() => setShowAnswerInModal((v) => !v)}
                    className="min-h-[36px] text-xs font-medium text-[#667858] hover:underline dark:text-[#a3be8e]"
                  >
                    {showAnswerInModal ? '隐藏答案' : '展开答案'}
                  </button>
                </div>
                {showAnswerInModal && (
                  <div className="mt-1.5 rounded-xl border border-[#dce4d4] bg-[#f6f8f3] p-3.5 dark:border-[#394532] dark:bg-[#232b1f]">
                    <MarkdownNote
                      content={viewCard.answer}
                      cards={[]}
                      annotations={cardAnnotations.filter((a) => a.field === 'answer')}
                      onSelect={(sel) => setSelection(sel ? { ...sel, field: 'answer' } : null)}
                    />
                  </div>
                )}
              </div>

              {selection && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e5dd] bg-[#fbfbf8] p-2.5 dark:border-[#343a2f] dark:bg-[#171a16]">
                  <span className="text-xs text-[#74796d] truncate max-w-[180px]">已选：{selection.excerpt}</span>
                  <button
                    onClick={() => void saveCardAnnotation('')}
                    className="flex min-h-[36px] items-center gap-1 rounded-lg bg-[#f6ecc6] px-2.5 text-xs text-[#6e5c29]"
                  >
                    <Highlighter size={13} />
                    高亮
                  </button>
                  <button
                    onClick={() => setAnnotationDraft('')}
                    className="flex min-h-[36px] items-center gap-1 rounded-lg bg-[#e9eee3] px-2.5 text-xs text-[#4f6241]"
                  >
                    <MessageSquareText size={13} />
                    批注
                  </button>
                </div>
              )}

              {annotationDraft !== null && (
                <div className="space-y-2 rounded-xl border border-[#e3e5dd] p-3 dark:border-[#343a2f]">
                  <textarea
                    value={annotationDraft}
                    onChange={(e) => setAnnotationDraft(e.target.value)}
                    rows={2}
                    placeholder="输入批注内容…"
                    className="w-full rounded-lg border border-[#e3e5dd] p-2 text-sm outline-none dark:border-[#343a2f] dark:bg-[#171a16]"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setAnnotationDraft(null)} className="min-h-[36px] px-3 text-xs">
                      取消
                    </button>
                    <button
                      onClick={() => void saveCardAnnotation(annotationDraft)}
                      className="min-h-[36px] rounded-lg bg-[#30352a] px-3.5 text-xs text-white dark:bg-[#6d8459] dark:text-[#171a16]"
                    >
                      保存批注
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-[#eaebe4] pt-4 dark:border-[#2e332a]">
                <p className="mb-2 text-xs font-medium text-[#74796d]">快速自测评分</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { r: 1 as const, label: '忘了' },
                    { r: 2 as const, label: '困难' },
                    { r: 3 as const, label: '记得' },
                    { r: 4 as const, label: '简单' },
                  ].map((item) => (
                    <button
                      key={item.r}
                      disabled={reviewBusy}
                      onClick={() => void quickReviewInDetail(item.r)}
                      className="min-h-[42px] rounded-xl border border-[#e3e5dd] text-xs font-medium hover:bg-[#f4f4ef] dark:border-[#343a2f] dark:hover:bg-[#262b22]"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Standalone Card Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <form
            onSubmit={(e) => void handleSubmitForm(e)}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-2xl sm:p-6 dark:bg-[#1e221b]"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">
                {editingCard ? '编辑记忆卡片' : '新建独立记忆卡片'}
              </h2>
              <button type="button" onClick={() => setCreateOpen(false)} className="min-h-[40px] min-w-[40px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-[#686d61] dark:text-[#a4aa9b]">
              复习问题（支持 Markdown 与粘贴图片）
              <textarea
                required
                value={draft.question}
                onPaste={(e) => void pasteImage(e, 'question')}
                onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-[#e3e5dd] bg-[#fcfcfa] px-3.5 py-2.5 text-sm outline-none dark:border-[#343a2f] dark:bg-[#171a16]"
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-[#686d61] dark:text-[#a4aa9b]">
              上下文（可选）
              <textarea
                value={draft.context}
                onPaste={(e) => void pasteImage(e, 'context')}
                onChange={(e) => setDraft({ ...draft, context: e.target.value })}
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-[#e3e5dd] bg-[#fcfcfa] px-3.5 py-2.5 text-sm outline-none dark:border-[#343a2f] dark:bg-[#171a16]"
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-[#686d61] dark:text-[#a4aa9b]">
              参考答案
              <textarea
                required
                value={draft.answer}
                onPaste={(e) => void pasteImage(e, 'answer')}
                onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                rows={4}
                className="mt-1.5 w-full rounded-xl border border-[#e3e5dd] bg-[#fcfcfa] px-3.5 py-2.5 text-sm outline-none dark:border-[#343a2f] dark:bg-[#171a16]"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="min-h-[44px] rounded-xl border border-[#e3e5dd] px-4 text-xs dark:border-[#343a2f]"
              >
                取消
              </button>
              <button
                disabled={saving || !draft.question.trim() || !draft.answer.trim()}
                className="min-h-[44px] rounded-xl bg-[#30352a] px-5 text-xs font-medium text-white disabled:opacity-50 dark:bg-[#6d8459] dark:text-[#171a16]"
              >
                {saving ? '保存中…' : editingCard ? '保存修改' : '创建并加入复习'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
