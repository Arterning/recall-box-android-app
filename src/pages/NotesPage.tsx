import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react';
import {
  ArrowLeft,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Highlighter,
  ImagePlus,
  ListTree,
  LoaderCircle,
  MessageSquareText,
  PencilLine,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  MarkdownNote,
  markdownOutline,
  type PreviewSelection,
} from '../components/MarkdownNote';
import {
  api,
  emptyNote,
  toErrorMessage,
  uploadClipboardImages,
  uploadImageFile,
  type Annotation,
  type Card,
  type Note,
  type NoteListResult,
} from '../lib/api';

function makeClozeQuestion(content: string, start: number, end: number) {
  if (start < 0 || end <= start || end > content.length) return '［选中内容］';
  const previousParagraphBreak = content.lastIndexOf('\n\n', Math.max(0, start - 1));
  const nextParagraphBreak = content.indexOf('\n\n', end);
  const paragraphStart = previousParagraphBreak < 0 ? 0 : previousParagraphBreak + 2;
  const paragraphEnd = nextParagraphBreak < 0 ? content.length : nextParagraphBreak;
  const before = content.slice(paragraphStart, start).trim();
  const after = content.slice(end, paragraphEnd).trim();
  if (!before && !after) return '［选中内容］';
  return `${before} ［　］ ${after}`.trim();
}

function formatDate(value: string) {
  if (!value) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function NotesPage({ onStatsChanged }: { onStatsChanged?: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [totalNotes, setTotalNotes] = useState(0);
  const [notesPage, setNotesPage] = useState(1);
  const pageSize = 25;
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<Note>(emptyNote);
  const [editing, setEditing] = useState(false); // true when a note is open (reader or editor)
  const [view, setView] = useState<'preview' | 'edit'>('preview');
  const [cards, setCards] = useState<Card[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [hideAnnotations, setHideAnnotations] = useState(false);
  const [showOutlineMobile, setShowOutlineMobile] = useState(false);
  const [showNoteCardsModal, setShowNoteCardsModal] = useState(false);

  const [selection, setSelection] = useState<PreviewSelection | null>(null);
  const [draft, setDraft] = useState<{ question: string; answer: string } | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<string | null>(null);
  const [pendingAnnotationId, setPendingAnnotationId] = useState<number | null>(null);
  const [annotationPopover, setAnnotationPopover] = useState<{
    item: Annotation;
    x: number;
    y: number;
  } | null>(null);
  const [editingPopover, setEditingPopover] = useState(false);
  const [popoverComment, setPopoverComment] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const outline = useMemo(() => markdownOutline(note.content), [note.content]);

  const loadNotes = useCallback(async (searchText: string, page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (searchText.trim()) params.set('q', searchText.trim());
      const res = await api<NoteListResult>(`/api/notes?${params}`);
      setNotes(res.items);
      setTotalNotes(res.total);
    } catch (cause) {
      setError(toErrorMessage(cause, '加载笔记列表失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCards = useCallback(async (noteId: number) => {
    if (!noteId) {
      setCards([]);
      return;
    }
    try {
      setCards(await api<Card[]>(`/api/notes/${noteId}/cards`));
    } catch {
      setCards([]);
    }
  }, []);

  const loadAnnotations = useCallback(async (noteId: number) => {
    if (!noteId) {
      setAnnotations([]);
      return;
    }
    try {
      setAnnotations(await api<Annotation[]>(`/api/notes/${noteId}/annotations`));
    } catch {
      setAnnotations([]);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNotes(query, notesPage), 160);
    return () => window.clearTimeout(timer);
  }, [query, notesPage, loadNotes]);

  // Auto-open first note on desktop if nothing open yet
  useEffect(() => {
    if (!editing && notes.length > 0 && window.innerWidth >= 1024 && !note.id) {
      void openNote(notes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const persistNote = useCallback(async () => {
    const isNew = !note.id;
    const payload = {
      title: note.title.trim() || '未命名笔记',
      content: note.content,
      format: 'markdown',
      tags: note.tags,
    };
    setSaving(true);
    setError('');
    try {
      const saved = note.id
        ? await api<Note>(`/api/notes/${note.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await api<Note>('/api/notes', { method: 'POST', body: JSON.stringify(payload) });
      setNote(saved);
      setEditing(true);
      await Promise.all([loadCards(saved.id), loadAnnotations(saved.id)]);
      const targetPage = isNew ? 1 : notesPage;
      if (isNew) setNotesPage(1);
      await loadNotes(query, targetPage);
      onStatsChanged?.();
      setToast('笔记已保存');
      return saved;
    } finally {
      setSaving(false);
    }
  }, [loadAnnotations, loadCards, loadNotes, note, notesPage, onStatsChanged, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && editing) {
        event.preventDefault();
        void persistNote().catch((cause) => setError(toErrorMessage(cause, '保存失败')));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, persistNote]);

  const openNote = async (id: number) => {
    setError('');
    try {
      const loaded = await api<Note>(`/api/notes/${id}`);
      setNote(loaded);
      setEditing(true);
      setView('preview');
      setSelection(null);
      setDraft(null);
      setAnnotationDraft(null);
      setPendingAnnotationId(null);
      setAnnotationPopover(null);
      await Promise.all([loadCards(id), loadAnnotations(id)]);
    } catch (cause) {
      setError(toErrorMessage(cause, '无法打开笔记'));
    }
  };

  const createNewNote = () => {
    setNote({ ...emptyNote, format: 'markdown' });
    setEditing(true);
    setView('edit');
    setCards([]);
    setAnnotations([]);
    setSelection(null);
    setDraft(null);
    setAnnotationDraft(null);
    setPendingAnnotationId(null);
    setAnnotationPopover(null);
  };

  const deleteCurrentNote = async () => {
    if (!note.id || !window.confirm(`确定删除笔记「${note.title || '未命名笔记'}」及其关联卡片吗？`)) return;
    setBusy(true);
    try {
      await api(`/api/notes/${note.id}`, { method: 'DELETE' });
      setNote(emptyNote);
      setEditing(false);
      setCards([]);
      setAnnotations([]);
      await loadNotes(query, notesPage);
      onStatsChanged?.();
      setToast('笔记已删除');
    } catch (cause) {
      setError(toErrorMessage(cause, '删除笔记失败'));
    } finally {
      setBusy(false);
    }
  };

  const captureEditorSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (end <= start) {
      setSelection(null);
      return;
    }
    const sourceText = note.content.slice(start, end);
    if (!sourceText.trim()) return;
    const rect = editor.getBoundingClientRect();
    setSelection({
      start,
      end,
      excerpt: sourceText,
      sourceText,
      x: Math.max(16, Math.min(window.innerWidth - 260, rect.left + 80)),
      y: Math.max(16, rect.top + 48),
      right: rect.left + 200,
      bottom: rect.top + 80,
    });
  };

  const insertImageMarkdown = (refs: string[]) => {
    const editor = editorRef.current;
    const insertion = refs.join('\n\n');
    const start = editor ? editor.selectionStart : note.content.length;
    const end = editor ? editor.selectionEnd : note.content.length;
    const before = note.content.slice(0, start);
    const after = note.content.slice(end);
    const prefix = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const suffix = after && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
    setNote((prev) => ({ ...prev, content: before + prefix + insertion + suffix + after }));
    setToast('图片已插入 Markdown');
  };

  const handlePasteImage = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    try {
      const refs = await uploadClipboardImages(event);
      if (refs) insertImageMarkdown(refs);
    } catch (cause) {
      setError(toErrorMessage(cause, '图片上传失败'));
    }
  };

  const handleUploadImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const ref = await uploadImageFile(file);
      insertImageMarkdown([ref]);
    } catch (cause) {
      setError(toErrorMessage(cause, '图片上传失败'));
    } finally {
      setBusy(false);
    }
  };

  const beginCard = () => {
    if (!selection) return;
    setAnnotationDraft(null);
    setDraft({
      question: makeClozeQuestion(note.content, selection.start, selection.end),
      answer: selection.excerpt.trim(),
    });
  };

  const saveCard = async () => {
    if (!selection || !draft) return;
    setBusy(true);
    setError('');
    try {
      const savedNote = note.id ? note : await persistNote();
      const created = await api<Card>(`/api/notes/${savedNote.id}/cards`, {
        method: 'POST',
        body: JSON.stringify({
          excerpt: selection.excerpt,
          sourceText: selection.sourceText,
          startOffset: selection.start,
          endOffset: selection.end,
          question: draft.question,
          answer: draft.answer,
        }),
      });
      setCards((prev) => [created, ...prev]);
      setDraft(null);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      onStatsChanged?.();
      setToast('已创建复习卡并加入今日队列');
    } catch (cause) {
      setError(toErrorMessage(cause, '创建卡片失败'));
    } finally {
      setBusy(false);
    }
  };

  const beginAnnotation = async (openEditor: boolean) => {
    if (!selection) return;
    setDraft(null);
    setView('preview');
    setBusy(true);
    setError('');
    try {
      const savedNote = note.id ? note : await persistNote();
      const created = await api<Annotation>(`/api/notes/${savedNote.id}/annotations`, {
        method: 'POST',
        body: JSON.stringify({
          excerpt: selection.excerpt,
          sourceText: selection.sourceText,
          startOffset: selection.start,
          endOffset: selection.end,
          comment: '',
        }),
      });
      setAnnotations((prev) => [created, ...prev]);
      if (openEditor) {
        setPendingAnnotationId(created.id);
        setAnnotationDraft('');
      } else {
        setSelection(null);
        window.getSelection()?.removeAllRanges();
        setToast('已添加划线高亮');
      }
    } catch (cause) {
      setError(toErrorMessage(cause, '创建批注失败'));
    } finally {
      setBusy(false);
    }
  };

  const saveAnnotationComment = async () => {
    if (pendingAnnotationId === null || annotationDraft === null) return;
    setBusy(true);
    try {
      const updated = await api<Annotation>(`/api/annotations/${pendingAnnotationId}`, {
        method: 'PUT',
        body: JSON.stringify({ comment: annotationDraft }),
      });
      setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setPendingAnnotationId(null);
      setAnnotationDraft(null);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      setToast('批注已保存');
    } catch (cause) {
      setError(toErrorMessage(cause, '保存批注失败'));
    } finally {
      setBusy(false);
    }
  };

  const openAnnotationPopover = (id: number, rect: DOMRect) => {
    const item = annotations.find((a) => a.id === id);
    if (!item) return;
    setAnnotationPopover({
      item,
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 312)),
      y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 220)),
    });
    setPopoverComment(item.comment);
    setEditingPopover(false);
    setSelection(null);
  };

  const updatePopoverComment = async () => {
    if (!annotationPopover) return;
    setBusy(true);
    try {
      const updated = await api<Annotation>(`/api/annotations/${annotationPopover.item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ comment: popoverComment }),
      });
      setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setAnnotationPopover({ ...annotationPopover, item: updated });
      setEditingPopover(false);
      setToast('批注已更新');
    } catch (cause) {
      setError(toErrorMessage(cause, '更新批注失败'));
    } finally {
      setBusy(false);
    }
  };

  const removeAnnotation = async (id: number) => {
    setBusy(true);
    try {
      await api(`/api/annotations/${id}`, { method: 'DELETE' });
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      setAnnotationPopover(null);
      setToast('已移除划线与批注');
    } catch (cause) {
      setError(toErrorMessage(cause, '删除批注失败'));
    } finally {
      setBusy(false);
    }
  };

  const jumpToHeading = (headingId: string) => {
    setView('preview');
    setShowOutlineMobile(false);
    requestAnimationFrame(() => {
      document.getElementById(headingId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const totalPages = Math.max(1, Math.ceil(totalNotes / pageSize));

  return (
    <div className="mx-auto max-w-[1440px]">
      {error && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-[#e8c6bc] bg-[#fdf3f0] px-4 py-2.5 text-sm text-[#8f4938] dark:border-[#5b382f] dark:bg-[#2a1d19] dark:text-[#e6afa0]">
          <span>{error}</span>
          <button onClick={() => setError('')} className="min-h-[40px] min-w-[40px] flex items-center justify-center" aria-label="关闭错误">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:h-[calc(100vh-8.5rem)] lg:grid-cols-[300px_minmax(0,1fr)_270px]">
        {/* Left Pane: Notes List (hidden on mobile when a note is open) */}
        <aside
          className={`${
            editing ? 'hidden lg:flex' : 'flex'
          } flex-col overflow-hidden rounded-2xl border border-[#e3e5dd] bg-[#fbfbf8] dark:border-[#32372d] dark:bg-[#1e221b]`}
        >
          <div className="flex items-center justify-between border-b border-[#eaebe4] px-4 py-3.5 dark:border-[#2e332a]">
            <div>
              <h1 className="font-display text-base font-semibold text-[#262920] dark:text-[#e4e7de]">笔记库</h1>
              <p className="text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">{totalNotes} 篇 Markdown 笔记</p>
            </div>
            <button
              onClick={createNewNote}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#30352a] px-3.5 py-2 text-xs font-medium text-[#f5f4eb] transition hover:bg-[#41473a] whitespace-nowrap shrink-0 dark:bg-[#6d8459] dark:text-[#171a16]"
            >
              <Plus size={15} />
              新建
            </button>
          </div>

          <div className="border-b border-[#eaebe4] px-3 py-2.5 dark:border-[#2e332a]">
            <label className="relative flex items-center">
              <Search size={15} className="pointer-events-none absolute left-3 text-[#8a8f82]" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setNotesPage(1);
                }}
                placeholder="搜索标题、内容或标签…"
                className="min-h-[42px] w-full rounded-xl border border-[#e3e5dd] bg-white pl-9 pr-3 text-sm text-[#262920] outline-none focus:border-[#788b68] dark:border-[#343a2f] dark:bg-[#171a16] dark:text-[#e2e5dc]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 divide-y divide-[#eef0e9] overflow-y-auto dark:divide-[#2b3027]">
            {loading && notes.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#8a8f82]">
                <LoaderCircle size={16} className="animate-spin" />
                正在读取笔记…
              </div>
            ) : notes.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-[#8a8f82]">
                {query ? '没有匹配的笔记' : '还没有笔记，点击右上角「新建」开始记录'}
              </div>
            ) : (
              notes.map((item) => {
                const active = editing && item.id === note.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => void openNote(item.id)}
                    className={`flex min-h-[64px] w-full flex-col items-start px-4 py-3 text-left transition ${
                      active
                        ? 'bg-[#e9eee3] dark:bg-[#2c3427]'
                        : 'hover:bg-white dark:hover:bg-[#23281f]'
                    }`}
                  >
                    <p className="w-full truncate text-sm font-medium text-[#262920] dark:text-[#e4e7de]">
                      {item.title || '未命名笔记'}
                    </p>
                    <p className="mt-1 w-full truncate text-xs text-[#74796d] dark:text-[#989e90]">
                      {item.content.replace(/[#>*`\n]+/g, ' ').trim() || '空白笔记'}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#8f9487] tabular-nums">
                      <span>{formatDate(item.updatedAt)}</span>
                      {item.tags && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[160px]">{item.tags}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#eaebe4] px-3 py-2 text-xs text-[#74796d] dark:border-[#2e332a]">
              <button
                disabled={notesPage <= 1}
                onClick={() => setNotesPage((p) => Math.max(1, p - 1))}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg disabled:opacity-40"
                aria-label="上一页"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="tabular-nums">{notesPage} / {totalPages}</span>
              <button
                disabled={notesPage >= totalPages}
                onClick={() => setNotesPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg disabled:opacity-40"
                aria-label="下一页"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </aside>

        {/* Center Pane: Reader / Editor */}
        <section
          className={`${
            editing ? 'flex' : 'hidden lg:flex'
          } min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-[#e3e5dd] bg-white dark:border-[#32372d] dark:bg-[#1e221b]`}
        >
          {!editing ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
              <BookOpenText size={28} className="text-[#788b68]" />
              <h2 className="mt-4 font-display text-lg font-semibold text-[#262920] dark:text-[#e4e7de]">
                选择一篇笔记或新建笔记
              </h2>
              <p className="mt-1.5 max-w-sm text-sm text-[#74796d] dark:text-[#989e90]">
                在阅读模式下划选重点文字即可划线、添加批注或一键生成 FSRS 挖空复习卡。
              </p>
              <button
                onClick={createNewNote}
                className="mt-5 flex min-h-[44px] items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm font-medium text-white dark:bg-[#6d8459] dark:text-[#171a16]"
              >
                <Plus size={16} />
                新建笔记
              </button>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eaebe4] px-3 py-2.5 sm:px-5 dark:border-[#2e332a]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => setEditing(false)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#5e6357] hover:bg-[#f3f4ef] lg:hidden dark:text-[#cfd4c8] dark:hover:bg-[#2a2f26]"
                    aria-label="返回列表"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="flex rounded-xl bg-[#f2f3ed] p-1 dark:bg-[#262b22]">
                    <button
                      onClick={() => setView('preview')}
                      className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition whitespace-nowrap ${
                        view === 'preview'
                          ? 'bg-white text-[#262920] shadow-xs dark:bg-[#343b2f] dark:text-[#f0f2ec]'
                          : 'text-[#6c7165] dark:text-[#989e90]'
                      }`}
                    >
                      <BookOpenText size={14} />
                      阅读
                    </button>
                    <button
                      onClick={() => setView('edit')}
                      className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition whitespace-nowrap ${
                        view === 'edit'
                          ? 'bg-white text-[#262920] shadow-xs dark:bg-[#343b2f] dark:text-[#f0f2ec]'
                          : 'text-[#6c7165] dark:text-[#989e90]'
                      }`}
                    >
                      <PencilLine size={14} />
                      编辑
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setHideAnnotations((v) => !v)}
                    title={hideAnnotations ? '显示划线批注' : '遮盖划线自测'}
                    className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition whitespace-nowrap ${
                      hideAnnotations
                        ? 'border-[#8fa17d] bg-[#eef2e8] text-[#45563b] dark:border-[#6d8459] dark:bg-[#2d3627] dark:text-[#cfe0c0]'
                        : 'border-[#e3e5dd] text-[#5e6357] hover:bg-[#f8f9f5] dark:border-[#343a2f] dark:text-[#cfd4c8] dark:hover:bg-[#262b22]'
                    }`}
                  >
                    {hideAnnotations ? <EyeOff size={15} /> : <Eye size={15} />}
                    <span className="hidden sm:inline">{hideAnnotations ? '显示高亮' : '遮盖自测'}</span>
                  </button>

                  <button
                    onClick={() => setShowOutlineMobile(true)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#e3e5dd] text-[#5e6357] hover:bg-[#f8f9f5] lg:hidden dark:border-[#343a2f] dark:text-[#cfd4c8]"
                    aria-label="目录与卡片"
                  >
                    <ListTree size={16} />
                  </button>

                  {view === 'edit' && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => void handleUploadImageFile(e)}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        title="插入图片"
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#e3e5dd] text-[#5e6357] hover:bg-[#f8f9f5] dark:border-[#343a2f] dark:text-[#cfd4c8]"
                        aria-label="插入图片"
                      >
                        <ImagePlus size={16} />
                      </button>
                    </>
                  )}

                  {note.id > 0 && (
                    <button
                      onClick={() => void deleteCurrentNote()}
                      disabled={busy}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#a35b4a] hover:bg-[#fdf2ef] dark:text-[#e09887] dark:hover:bg-[#2f201c]"
                      aria-label="删除笔记"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  <button
                    onClick={() => void persistNote()}
                    disabled={saving}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#30352a] px-3.5 text-xs font-medium text-white transition hover:bg-[#41473a] disabled:opacity-50 whitespace-nowrap dark:bg-[#6d8459] dark:text-[#171a16]"
                  >
                    {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                    保存
                  </button>
                </div>
              </div>

              {/* Note Title & Meta */}
              <div className="border-b border-[#f0f1eb] px-5 py-3.5 dark:border-[#2a2f26]">
                {view === 'edit' ? (
                  <div className="space-y-2">
                    <input
                      value={note.title}
                      onChange={(e) => setNote({ ...note, title: e.target.value })}
                      placeholder="笔记标题"
                      className="w-full font-display text-xl font-semibold text-[#262920] outline-none placeholder:text-[#a8aba0] dark:bg-transparent dark:text-[#e4e7de]"
                    />
                    <input
                      value={note.tags}
                      onChange={(e) => setNote({ ...note, tags: e.target.value })}
                      placeholder="标签（用逗号分隔，例如：算法,Android）"
                      className="w-full text-xs text-[#6e7366] outline-none placeholder:text-[#a8aba0] dark:bg-transparent dark:text-[#989e90]"
                    />
                  </div>
                ) : (
                  <div>
                    <h2 className="font-display text-xl font-semibold text-[#262920] dark:text-[#e4e7de]">
                      {note.title || '未命名笔记'}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#74796d] tabular-nums dark:text-[#989e90]">
                      <span>{formatDate(note.updatedAt)}</span>
                      {note.tags && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{note.tags}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <button
                        onClick={() => setShowNoteCardsModal(true)}
                        className="underline decoration-[#9aa88c] underline-offset-2 hover:text-[#262920] dark:hover:text-white"
                      >
                        {cards.length} 张关联卡片
                      </button>
                      <span aria-hidden="true">·</span>
                      <span>{annotations.length} 处划线批注</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Body */}
              {view === 'edit' ? (
                <textarea
                  ref={editorRef}
                  value={note.content}
                  onChange={(e) => setNote({ ...note, content: e.target.value })}
                  onMouseUp={captureEditorSelection}
                  onTouchEnd={() => window.setTimeout(captureEditorSelection, 40)}
                  onKeyUp={captureEditorSelection}
                  onPaste={(e) => void handlePasteImage(e)}
                  placeholder="在这里使用 Markdown 记录知识… 支持粘贴截图、选中文本创建复习卡。"
                  className="min-h-0 flex-1 resize-none px-5 py-5 font-mono text-[13.5px] leading-[1.85] text-[#2f3328] outline-none placeholder:font-sans placeholder:text-[#a8aba0] dark:bg-transparent dark:text-[#dce0d5]"
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
                  <MarkdownNote
                    content={note.content}
                    cards={cards}
                    annotations={annotations}
                    hideAnnotations={hideAnnotations}
                    onSelect={setSelection}
                    onAnnotationClick={openAnnotationPopover}
                  />
                </div>
              )}
            </>
          )}
        </section>

        {/* Right Pane (Desktop): Outline & Cloze Card Builder */}
        {editing && (
          <aside className="hidden lg:flex flex-col overflow-hidden rounded-2xl border border-[#e3e5dd] bg-[#fbfbf8] p-4 dark:border-[#32372d] dark:bg-[#1e221b]">
            {draft ? (
              <div className="flex flex-1 flex-col overflow-y-auto">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#4f5946] dark:text-[#b6cba3]">新建挖空复习卡</p>
                  <button
                    onClick={() => setDraft(null)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#8a8f82]"
                    aria-label="关闭制卡"
                  >
                    <X size={15} />
                  </button>
                </div>
                <label className="mt-3 block text-xs font-medium text-[#686d61] dark:text-[#a4aa9b]">
                  复习问题（默认挖空上下文）
                  <textarea
                    value={draft.question}
                    onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                    rows={4}
                    className="mt-1.5 w-full resize-y rounded-xl border border-[#e3e5dd] bg-white px-3 py-2 text-xs leading-5 text-[#262920] outline-none focus:border-[#788b68] dark:border-[#343a2f] dark:bg-[#171a16] dark:text-[#e2e5dc]"
                  />
                </label>
                <label className="mt-3 block text-xs font-medium text-[#686d61] dark:text-[#a4aa9b]">
                  参考答案（选中的重点）
                  <textarea
                    value={draft.answer}
                    onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                    rows={4}
                    className="mt-1.5 w-full resize-y rounded-xl border border-[#e3e5dd] bg-white px-3 py-2 text-xs leading-5 text-[#262920] outline-none focus:border-[#788b68] dark:border-[#343a2f] dark:bg-[#171a16] dark:text-[#e2e5dc]"
                  />
                </label>
                <button
                  disabled={busy || !draft.question.trim() || !draft.answer.trim()}
                  onClick={() => void saveCard()}
                  className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#30352a] text-xs font-medium text-white hover:bg-[#41473a] disabled:opacity-50 dark:bg-[#6d8459] dark:text-[#171a16]"
                >
                  {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
                  创建复习卡
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-[#5b6154] dark:text-[#a4aa9b]">大纲目录</p>
                <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto">
                  {outline.length > 0 ? (
                    outline.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => jumpToHeading(h.id)}
                        style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
                        className="flex min-h-[38px] w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-xs text-[#64695d] hover:bg-white hover:text-[#262920] dark:text-[#a1a798] dark:hover:bg-[#262b22] dark:hover:text-white"
                      >
                        <ChevronRight size={12} className="shrink-0 text-[#9aa091]" />
                        <span className="truncate">{h.title}</span>
                      </button>
                    ))
                  ) : (
                    <p className="py-6 text-center text-xs text-[#909588]">笔记中暂无 Markdown 标题</p>
                  )}
                </nav>
              </>
            )}
          </aside>
        )}
      </div>

      {/* Floating Selection Toolbar (works cleanly on both mouse & mobile touch) */}
      {selection && !draft && annotationDraft === null && (
        <div
          className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[#dcdfd6] bg-white p-1.5 shadow-xl lg:bottom-auto dark:border-[#3c4335] dark:bg-[#23281f]"
          style={
            window.innerWidth >= 1024
              ? {
                  left: Math.max(16, Math.min(selection.x, window.innerWidth - 320)),
                  top: Math.max(16, Math.min((selection.bottom ?? selection.y + 44) + 8, window.innerHeight - 80)),
                  transform: 'none',
                }
              : undefined
          }
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            disabled={busy}
            onClick={() => void beginAnnotation(false)}
            className="flex min-h-[42px] items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-[#736233] hover:bg-[#f7f2e2] whitespace-nowrap dark:text-[#e3cf8e] dark:hover:bg-[#35301f]"
          >
            <Highlighter size={14} />
            划线
          </button>
          <button
            onClick={() => void beginAnnotation(true)}
            className="flex min-h-[42px] items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-[#736233] hover:bg-[#f7f2e2] whitespace-nowrap dark:text-[#e3cf8e] dark:hover:bg-[#35301f]"
          >
            <MessageSquareText size={14} />
            批注
          </button>
          <button
            onClick={beginCard}
            className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#30352a] px-3 text-xs font-medium text-white hover:bg-[#41473a] whitespace-nowrap dark:bg-[#6d8459] dark:text-[#171a16]"
          >
            <Plus size={14} />
            制卡
          </button>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(selection.excerpt).catch(() => undefined);
              setSelection(null);
              window.getSelection()?.removeAllRanges();
              setToast('已复制选中内容');
            }}
            className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl text-[#74796d] hover:bg-[#f2f3ed] dark:text-[#a5ab9c] dark:hover:bg-[#2f352a]"
            aria-label="复制"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={() => {
              setSelection(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl text-[#8a8f82] hover:bg-[#f2f3ed] dark:hover:bg-[#2f352a]"
            aria-label="取消选中"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Mobile Cloze Card Modal */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4 lg:hidden">
          <div className="w-full max-w-lg rounded-t-3xl border border-[#e3e5dd] bg-white p-5 sm:rounded-2xl dark:border-[#343a2f] dark:bg-[#1e221b]">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#d7dad0] sm:hidden dark:bg-[#3a4035]" />
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">创建挖空复习卡</h3>
              <button onClick={() => setDraft(null)} className="min-h-[40px] min-w-[40px] flex items-center justify-center" aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <label className="mt-3 block text-xs font-medium text-[#686d61] dark:text-[#a4aa9b]">
              复习问题
              <textarea
                value={draft.question}
                onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-[#e3e5dd] bg-[#fcfcfa] px-3 py-2.5 text-sm outline-none dark:border-[#343a2f] dark:bg-[#171a16]"
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-[#686d61] dark:text-[#a4aa9b]">
              参考答案
              <textarea
                value={draft.answer}
                onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-[#e3e5dd] bg-[#fcfcfa] px-3 py-2.5 text-sm outline-none dark:border-[#343a2f] dark:bg-[#171a16]"
              />
            </label>
            <button
              disabled={busy || !draft.question.trim() || !draft.answer.trim()}
              onClick={() => void saveCard()}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#30352a] text-sm font-medium text-white disabled:opacity-50 dark:bg-[#6d8459] dark:text-[#171a16]"
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
              创建并加入今日复习
            </button>
          </div>
        </div>
      )}

      {/* New Annotation Comment Dialog */}
      {annotationDraft !== null && pendingAnnotationId !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl border border-[#e3e5dd] bg-white p-5 sm:rounded-2xl dark:border-[#343a2f] dark:bg-[#1e221b]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">添加批注</h3>
              <button
                onClick={() => {
                  setAnnotationDraft(null);
                  setPendingAnnotationId(null);
                  setSelection(null);
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-[#74796d] dark:text-[#989e90]">
              {selection?.excerpt}
            </p>
            <textarea
              autoFocus
              value={annotationDraft}
              onChange={(e) => setAnnotationDraft(e.target.value)}
              rows={3}
              placeholder="写下补充理解或回忆线索…"
              className="mt-3 w-full rounded-xl border border-[#e3e5dd] bg-[#fcfcfa] px-3 py-2.5 text-sm outline-none dark:border-[#343a2f] dark:bg-[#171a16]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setAnnotationDraft(null);
                  setPendingAnnotationId(null);
                  setSelection(null);
                }}
                className="min-h-[44px] rounded-xl border border-[#e3e5dd] px-4 text-xs dark:border-[#343a2f]"
              >
                保留划线
              </button>
              <button
                disabled={busy}
                onClick={() => void saveAnnotationComment()}
                className="min-h-[44px] rounded-xl bg-[#30352a] px-4 text-xs font-medium text-white dark:bg-[#6d8459] dark:text-[#171a16]"
              >
                保存批注
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Annotation Popover */}
      {annotationPopover && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAnnotationPopover(null);
          }}
        >
          <div className="w-full max-w-md rounded-t-3xl border border-[#e3e5dd] bg-white p-5 shadow-2xl sm:rounded-2xl dark:border-[#343a2f] dark:bg-[#1e221b]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">划线与批注</span>
              <button
                onClick={() => setAnnotationPopover(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 rounded-xl bg-[#faf7ec] px-3 py-2 text-xs text-[#695e3a] dark:bg-[#2d291a] dark:text-[#e3cf8e]">
              {annotationPopover.item.excerpt}
            </p>
            {editingPopover ? (
              <>
                <textarea
                  autoFocus
                  value={popoverComment}
                  onChange={(e) => setPopoverComment(e.target.value)}
                  rows={3}
                  className="mt-3 w-full rounded-xl border border-[#e3e5dd] bg-[#fcfcfa] px-3 py-2 text-sm outline-none dark:border-[#343a2f] dark:bg-[#171a16]"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => setEditingPopover(false)}
                    className="min-h-[42px] rounded-xl border border-[#e3e5dd] px-3.5 text-xs dark:border-[#343a2f]"
                  >
                    取消
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void updatePopoverComment()}
                    className="min-h-[42px] rounded-xl bg-[#30352a] px-4 text-xs font-medium text-white dark:bg-[#6d8459] dark:text-[#171a16]"
                  >
                    保存修改
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#34382d] dark:text-[#d8dcd2]">
                  {annotationPopover.item.comment || '（仅划线，未填写批注）'}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <button
                    disabled={busy}
                    onClick={() => void removeAnnotation(annotationPopover.item.id)}
                    className="min-h-[42px] rounded-xl px-3 text-xs text-[#a35b4a] hover:bg-[#fdf2ef] dark:text-[#e09887]"
                  >
                    删除划线
                  </button>
                  <button
                    onClick={() => setEditingPopover(true)}
                    className="min-h-[42px] rounded-xl border border-[#e3e5dd] px-4 text-xs font-medium dark:border-[#343a2f]"
                  >
                    编辑批注
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Outline Bottom Sheet */}
      {showOutlineMobile && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowOutlineMobile(false);
          }}
        >
          <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 dark:bg-[#1e221b]">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#d7dad0] dark:bg-[#3a4035]" />
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">大纲目录</h3>
              <button onClick={() => setShowOutlineMobile(false)} className="min-h-[40px] min-w-[40px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 space-y-1">
              {outline.length > 0 ? (
                outline.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => jumpToHeading(h.id)}
                    style={{ paddingLeft: `${8 + (h.level - 1) * 14}px` }}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-xl text-left text-sm text-[#4f5549] hover:bg-[#f4f4ef] dark:text-[#d8dcd2]"
                  >
                    <ChevronRight size={14} />
                    <span className="truncate">{h.title}</span>
                  </button>
                ))
              ) : (
                <p className="py-6 text-center text-sm text-[#8a8f82]">这篇笔记暂无标题</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Linked Cards Sheet */}
      {showNoteCardsModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNoteCardsModal(false);
          }}
        >
          <div className="max-h-[78vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-2xl dark:bg-[#1e221b]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">关联复习卡 ({cards.length})</h3>
              <button onClick={() => setShowNoteCardsModal(false)} className="min-h-[40px] min-w-[40px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 space-y-2.5">
              {cards.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#8a8f82]">阅读时选中任意文字即可创建复习卡。</p>
              ) : (
                cards.map((c) => (
                  <div key={c.id} className="rounded-xl border border-[#e6e8df] p-3.5 dark:border-[#343a2f]">
                    <p className="text-sm font-medium text-[#262920] dark:text-[#e4e7de]">{c.question}</p>
                    <p className="mt-1.5 text-xs text-[#667858] dark:text-[#a3be8e]">答：{c.answer}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-xs font-medium text-white shadow-lg lg:bottom-6 dark:bg-[#6d8459] dark:text-[#171a16]">
          <Check size={14} />
          {toast}
        </div>
      )}
    </div>
  );
}
