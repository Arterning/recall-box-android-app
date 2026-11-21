import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Check,
  Database,
  Download,
  FileArchive,
  LoaderCircle,
  SlidersHorizontal,
  Smartphone,
  Upload,
} from 'lucide-react';
import { api, toErrorMessage, type SystemDataInfo } from '../lib/api';

export function SettingsPage({ onDataImported }: { onDataImported?: () => void }) {
  const [retention, setRetention] = useState(90);
  const [savedRetention, setSavedRetention] = useState(90);
  const [dataInfo, setDataInfo] = useState<SystemDataInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dbInputRef = useRef<HTMLInputElement | null>(null);

  const loadAll = async () => {
    try {
      const [settings, sys] = await Promise.all([
        api<{ desiredRetention: number }>('/api/settings'),
        api<SystemDataInfo>('/api/system/data-dir'),
      ]);
      const pct = Math.round(settings.desiredRetention * 100);
      setRetention(pct);
      setSavedRetention(pct);
      setDataInfo(sys);
    } catch (cause) {
      setError(toErrorMessage(cause, '加载设置失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const saveRetention = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await api<{ desiredRetention: number }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ desiredRetention: retention / 100 }),
      });
      const pct = Math.round(res.desiredRetention * 100);
      setRetention(pct);
      setSavedRetention(pct);
      setMessage('目标记忆保留率已保存到 SQLite app_settings 表');
    } catch (cause) {
      setError(toErrorMessage(cause, '保存设置失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleImportDb = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/system/import-db', { method: 'POST', body: form });
      const json = (await res.json()) as {
        error?: string;
        notes?: number;
        cards?: number;
        diaries?: number;
      };
      if (!res.ok) throw new Error(json.error || '导入失败');
      await loadAll();
      onDataImported?.();
      setMessage(
        `已成功导入 SQLite 数据库（${json.notes ?? 0} 篇笔记 · ${json.cards ?? 0} 张卡片 · ${json.diaries ?? 0} 篇日记）`,
      );
    } catch (cause) {
      setError(toErrorMessage(cause, '导入 recall-box.db 失败'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#262920] dark:text-[#e4e7de]">
          设置与数据兼容
        </h1>
        <p className="mt-1 text-xs text-[#74796d] dark:text-[#989e90]">
          调整 FSRS-6 记忆算法参数，或与桌面版 Arterning/recall-box 互通 SQLite 数据文件
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-[#e8c6bc] bg-[#fdf3f0] px-4 py-2.5 text-sm text-[#8f4938] dark:border-[#5b382f] dark:bg-[#2a1d19] dark:text-[#e6afa0]">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-[#d6e0cd] bg-[#f3f7ef] px-4 py-2.5 text-sm text-[#4f673f] dark:border-[#394830] dark:bg-[#222c1d] dark:text-[#b7cfa5]">
          {message}
        </div>
      )}

      {/* FSRS Retention Setting */}
      <section className="rounded-2xl border border-[#e3e5dd] bg-white p-5 sm:p-6 dark:border-[#32372d] dark:bg-[#1e221b]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf0e8] text-[#667858] dark:bg-[#2a3324] dark:text-[#a3be8e]">
            <SlidersHorizontal size={18} />
          </span>
          <div>
            <h2 className="font-display text-sm font-semibold">目标记忆保留率（Desired Retention）</h2>
            <p className="mt-0.5 text-xs text-[#74796d] dark:text-[#989e90]">
              FSRS 使用该参数计算每张卡片的下次到期时间（默认 90%）
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-[#8a8f82]">
            <LoaderCircle size={16} className="animate-spin" />
            加载中…
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-baseline justify-between">
              <span className="font-display text-4xl font-semibold tabular-nums">{retention}%</span>
              <span className="text-xs text-[#74796d] dark:text-[#989e90]">推荐范围 85% – 92%</span>
            </div>
            <input
              type="range"
              min={70}
              max={97}
              step={1}
              value={retention}
              onChange={(e) => {
                setRetention(Number(e.target.value));
                setMessage('');
              }}
              aria-label="目标记忆保留率"
              className="mt-5 w-full accent-[#667858]"
            />
            <div className="mt-1 flex justify-between text-[11px] text-[#8a8f82] tabular-nums">
              <span>70% · 复习较少</span>
              <span>90% · 默认</span>
              <span>97% · 复习密集</span>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => void saveRetention()}
                disabled={saving || retention === savedRetention}
                className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#30352a] px-5 text-xs font-medium text-white disabled:opacity-45 dark:bg-[#6d8459] dark:text-[#171a16]"
              >
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                保存保留率设置
              </button>
            </div>
          </>
        )}
      </section>

      {/* SQLite Compatibility Center */}
      <section className="rounded-2xl border border-[#e3e5dd] bg-white p-5 sm:p-6 dark:border-[#32372d] dark:bg-[#1e221b]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf0e8] text-[#667858] dark:bg-[#2a3324] dark:text-[#a3be8e]">
            <Database size={18} />
          </span>
          <div>
            <h2 className="font-display text-sm font-semibold">SQLite 数据兼容中心（recall-box.db）</h2>
            <p className="mt-0.5 text-xs leading-5 text-[#74796d] dark:text-[#989e90]">
              采用与桌面端 Arterning/recall-box 完全一致的 6 张 SQLite 数据表（notes、cards、annotations、diary_entries、review_logs、app_settings）与 go-fsrs/v4 JSON 状态格式。可直接互相导入导出。
            </p>
          </div>
        </div>

        {dataInfo && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl bg-[#f8f9f5] p-3.5 text-xs tabular-nums sm:grid-cols-5 dark:bg-[#171a16]">
            <div>
              <p className="text-[#8a8f82]">笔记</p>
              <p className="mt-0.5 font-semibold">{dataInfo.counts.notes}</p>
            </div>
            <div>
              <p className="text-[#8a8f82]">卡片</p>
              <p className="mt-0.5 font-semibold">{dataInfo.counts.cards}</p>
            </div>
            <div>
              <p className="text-[#8a8f82]">划线批注</p>
              <p className="mt-0.5 font-semibold">{dataInfo.counts.annotations}</p>
            </div>
            <div>
              <p className="text-[#8a8f82]">日记</p>
              <p className="mt-0.5 font-semibold">{dataInfo.counts.diaries}</p>
            </div>
            <div>
              <p className="text-[#8a8f82]">数据库大小</p>
              <p className="mt-0.5 font-semibold">{Math.max(1, Math.round(dataInfo.databaseSizeBytes / 1024))} KB</p>
            </div>
          </div>
        )}

        <input
          ref={dbInputRef}
          type="file"
          accept=".db,.sqlite,.sqlite3"
          className="hidden"
          onChange={(e) => void handleImportDb(e)}
        />

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          <button
            disabled={importing}
            onClick={() => dbInputRef.current?.click()}
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#d9dcd2] bg-white px-4 text-xs font-medium text-[#262920] hover:bg-[#f8f9f5] dark:border-[#3c4335] dark:bg-[#23281f] dark:text-[#e4e7de]"
          >
            {importing ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}
            导入 recall-box.db
          </button>

          <a
            href="/api/system/export-db"
            download="recall-box.db"
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#30352a] px-4 text-xs font-medium text-white hover:bg-[#41473a] dark:bg-[#6d8459] dark:text-[#171a16]"
          >
            <Download size={15} />
            导出 recall-box.db
          </a>

          <a
            href="/api/system/export-bundle"
            download="recall-box-backup.zip"
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#d9dcd2] bg-white px-4 text-xs font-medium text-[#262920] hover:bg-[#f8f9f5] dark:border-[#3c4335] dark:bg-[#23281f] dark:text-[#e4e7de]"
          >
            <FileArchive size={15} />
            导出完整备份 (.zip)
          </a>
        </div>
      </section>

      {/* Native Android Kotlin Project Download */}
      <section className="rounded-2xl border border-[#e3e5dd] bg-white p-5 sm:p-6 dark:border-[#32372d] dark:bg-[#1e221b]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf0e8] text-[#667858] dark:bg-[#2a3324] dark:text-[#a3be8e]">
              <Smartphone size={18} />
            </span>
            <div>
              <h2 className="font-display text-sm font-semibold">原生 Android 工程源码（Kotlin + Jetpack Compose + SQLite）</h2>
              <p className="mt-1 text-xs leading-5 text-[#74796d] dark:text-[#989e90]">
                包含完整 Android Studio 工程（SQLiteOpenHelper、FSRS-6 调度器、笔记/复习/卡片/日记/统计界面、SAF .db 导入导出），下载解压后用 Android Studio 打开即可编译 APK。
              </p>
            </div>
          </div>

          <a
            href="/api/system/download-android"
            download="recall-box-android.zip"
            className="flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#30352a] px-4 text-xs font-medium text-white hover:bg-[#41473a] whitespace-nowrap dark:bg-[#6d8459] dark:text-[#171a16]"
          >
            <Download size={15} />
            下载 Android 源码 (.zip)
          </a>
        </div>
      </section>
    </div>
  );
}
