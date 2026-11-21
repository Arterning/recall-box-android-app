import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  checkpointAndReadDb,
  getDataPaths,
  getDb,
  replaceDatabaseFromBuffer,
} from './server/db.ts';
import {
  createInitialFsrsState,
  previewIntervals,
  scheduleReview,
} from './server/fsrs.ts';
import {
  clozeExcerpt,
  findAnchor,
  localDateString,
  resolveCardContext,
  sliceUTF16,
  toIsoOrNull,
} from './server/helpers.ts';

type NoteRow = {
  id: number;
  title: string;
  content: string;
  format: string;
  tags: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CardRow = {
  id: number;
  note_id: number | null;
  excerpt: string;
  context_override: string;
  source_text: string;
  start_offset: number;
  end_offset: number;
  anchor_valid: number;
  question: string;
  prompt: string;
  answer: string;
  due_at: string | null;
  fsrs_state: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  note_title?: string | null;
  note_content?: string | null;
  note_format?: string | null;
};

type AnnotationRow = {
  id: number;
  note_id: number | null;
  card_id: number | null;
  field: string;
  excerpt: string;
  source_text: string;
  start_offset: number;
  end_offset: number;
  comment: string;
  anchor_valid: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type DiaryRow = {
  id: number;
  entry_date: string;
  content: string;
  created_at: string;
  updated_at: string;
};

function parseTimestampMs(val: string | null | undefined): number | null {
  if (!val) return null;
  const iso = toIsoOrNull(val);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function isCardDue(dueAt: string | null | undefined, nowMs: number): boolean {
  if (!dueAt) return true;
  const ms = parseTimestampMs(dueAt);
  if (ms === null) return true;
  return ms <= nowMs;
}

function getDesiredRetention(): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'desiredRetention'`)
    .get() as { value?: string } | undefined;
  const parsed = Number.parseFloat(row?.value ?? '0.9');
  if (Number.isNaN(parsed) || parsed < 0.7 || parsed > 0.97) return 0.9;
  return parsed;
}

function formatNote(row: NoteRow) {
  return {
    id: row.id,
    title: row.title || '',
    content: row.content || '',
    format: 'markdown' as const,
    tags: row.tags || '',
    createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoOrNull(row.updated_at) ?? new Date().toISOString(),
  };
}

function formatCard(row: CardRow, retention?: number, now?: Date) {
  const question = row.question || row.prompt || '';
  const excerpt = resolveCardContext(
    {
      note_id: row.note_id,
      excerpt: row.excerpt,
      context_override: row.context_override,
      start_offset: row.start_offset,
      end_offset: row.end_offset,
    },
    row.note_content,
  );
  const createdDate = new Date(toIsoOrNull(row.created_at) ?? Date.now());
  const base = {
    id: row.id,
    noteId: row.note_id ?? null,
    excerpt,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    anchorValid: Boolean(row.anchor_valid),
    question,
    prompt: row.prompt || '',
    answer: row.answer || '',
    dueAt: toIsoOrNull(row.due_at),
    fsrsState: row.fsrs_state || '',
    createdAt: createdDate.toISOString(),
    noteTitle: row.note_id == null ? '独立卡片' : (row.note_title ?? ''),
    noteFormat: 'markdown' as const,
  };
  if (retention !== undefined && now !== undefined) {
    return {
      ...base,
      intervalPreviews: previewIntervals(row.fsrs_state, createdDate, now, retention),
    };
  }
  return base;
}

function formatAnnotation(row: AnnotationRow) {
  return {
    id: row.id,
    noteId: row.note_id ?? undefined,
    cardId: row.card_id ?? undefined,
    field: (row.field || undefined) as 'question' | 'answer' | 'context' | undefined,
    excerpt: row.excerpt,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    comment: row.comment || '',
    anchorValid: Boolean(row.anchor_valid),
    createdAt: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
  };
}

function escapeLike(input: string): string {
  return `%${input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

function diaryExcerpt(content: string): string {
  for (const rawLine of content.split(/\r?\n/)) {
    const cleaned = rawLine.trim().replace(/^[#>\-*+\s`]+/, '').trim();
    if (cleaned) {
      return cleaned.length > 72 ? `${cleaned.slice(0, 72)}…` : cleaned;
    }
  }
  return '';
}

async function startServer() {
  // Initialize SQLite DB early
  getDb();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // Health
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // System & SQLite Compatibility Routes
  app.get('/api/system/data-dir', (_req: Request, res: Response) => {
    const db = getDb();
    const paths = getDataPaths();
    const notesCount = Number(
      (db.prepare(`SELECT COUNT(*) AS c FROM notes WHERE deleted_at IS NULL`).get() as { c: number }).c,
    );
    const cardsCount = Number(
      (db.prepare(`SELECT COUNT(*) AS c FROM cards WHERE deleted_at IS NULL`).get() as { c: number }).c,
    );
    const diariesCount = Number(
      (db.prepare(`SELECT COUNT(*) AS c FROM diary_entries`).get() as { c: number }).c,
    );
    const annotationsCount = Number(
      (db.prepare(`SELECT COUNT(*) AS c FROM annotations WHERE deleted_at IS NULL`).get() as { c: number }).c,
    );
    const reviewLogsCount = Number(
      (db.prepare(`SELECT COUNT(*) AS c FROM review_logs`).get() as { c: number }).c,
    );
    const androidProjectExists = fs.existsSync(path.resolve(process.cwd(), 'android', 'settings.gradle.kts'));
    res.json({
      path: paths.dataDir,
      database: paths.databasePath,
      attachments: paths.attachmentsDir,
      databaseSizeBytes: paths.databaseSizeBytes,
      schemaCompatible: true,
      androidProjectAvailable: androidProjectExists,
      counts: {
        notes: notesCount,
        cards: cardsCount,
        diaries: diariesCount,
        annotations: annotationsCount,
        reviewLogs: reviewLogsCount,
      },
    });
  });

  app.get('/api/system/export-db', (_req: Request, res: Response) => {
    try {
      const dbBuffer = checkpointAndReadDb();
      res.setHeader('Content-Type', 'application/x-sqlite3');
      res.setHeader('Content-Disposition', 'attachment; filename="recall-box.db"');
      res.send(dbBuffer);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '导出数据库失败' });
    }
  });

  app.post('/api/system/import-db', memoryUpload.single('file'), (req: Request, res: Response) => {
    try {
      if (!req.file?.buffer) {
        res.status(400).json({ error: '请上传 .db SQLite 文件' });
        return;
      }
      const counts = replaceDatabaseFromBuffer(req.file.buffer);
      res.json({ status: 'ok', ...counts });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '导入数据库失败' });
    }
  });

  app.get('/api/system/export-bundle', (_req: Request, res: Response) => {
    try {
      const dbBuffer = checkpointAndReadDb();
      const { attachmentsDir } = getDataPaths();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="recall-box-backup.zip"');
      const archive = new ZipArchive({ zlib: { level: 9 } });
      archive.on('error', (err: Error) => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });
      archive.pipe(res);
      archive.append(dbBuffer, { name: 'recall-box.db' });
      if (fs.existsSync(attachmentsDir)) {
        archive.directory(attachmentsDir, 'attachments');
      }
      void archive.finalize();
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '导出备份失败' });
    }
  });

  app.get('/api/system/download-android', (_req: Request, res: Response) => {
    const androidDir = path.resolve(process.cwd(), 'android');
    if (!fs.existsSync(androidDir)) {
      res.status(404).json({ error: 'Android 源码目录不存在' });
      return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="recall-box-android.zip"');
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err: Error) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    archive.pipe(res);
    archive.directory(androidDir, 'recall-box-android');
    void archive.finalize();
  });

  // Assets (Images)
  app.post('/api/assets', memoryUpload.single('file'), (req: Request, res: Response) => {
    const data = req.file?.buffer;
    if (!data || data.length === 0) {
      res.status(400).json({ error: 'image file is required' });
      return;
    }
    if (data.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: 'image must be 10 MB or smaller' });
      return;
    }

    let ext = '';
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
      ext = '.png';
    } else if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      ext = '.jpg';
    } else if (data.subarray(0, 6).toString('ascii').startsWith('GIF8')) {
      ext = '.gif';
    } else if (
      data.length >= 12 &&
      data.subarray(0, 4).toString('ascii') === 'RIFF' &&
      data.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      ext = '.webp';
    } else {
      res.status(400).json({ error: 'supported image formats are PNG, JPEG, GIF, and WebP' });
      return;
    }

    const { attachmentsDir } = getDataPaths();
    const name = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(attachmentsDir, name), data);
    res.status(201).json({ name, url: `/api/assets/${name}` });
  });

  app.get('/api/assets/:name', (req: Request, res: Response) => {
    const rawName = String(req.params.name ?? '');
    const name = path.basename(rawName);
    if (name !== rawName || name.length < 36 || name.length > 37) {
      res.status(404).end();
      return;
    }
    const ext = path.extname(name).toLowerCase();
    const id = name.slice(0, -ext.length);
    if (!['.png', '.jpg', '.gif', '.webp'].includes(ext) || !/^[0-9a-f]{32}$/.test(id)) {
      res.status(404).end();
      return;
    }
    const { attachmentsDir } = getDataPaths();
    const filePath = path.join(attachmentsDir, name);
    if (!fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }
    const types: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', types[ext]);
    res.sendFile(filePath);
  });

  // Notes
  app.get('/api/notes', (req: Request, res: Response) => {
    const db = getDb();
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '25'), 10) || 25));
    const q = String(req.query.q ?? '').trim();

    let whereSql = `deleted_at IS NULL`;
    const params: string[] = [];
    if (q) {
      const like = escapeLike(q);
      whereSql += ` AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')`;
      params.push(like, like, like);
    }

    const total = Number(
      (db.prepare(`SELECT COUNT(*) AS cnt FROM notes WHERE ${whereSql}`).get(...params) as { cnt: number }).cnt,
    );
    const rows = db
      .prepare(
        `SELECT * FROM notes WHERE ${whereSql} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize) as unknown as NoteRow[];

    res.json({
      items: rows.map(formatNote),
      total,
      page,
      pageSize,
    });
  });

  app.post('/api/notes', (req: Request, res: Response) => {
    const db = getDb();
    const title = String(req.body?.title ?? '');
    const content = String(req.body?.content ?? '');
    const tags = String(req.body?.tags ?? '');
    const nowIso = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO notes (title, content, format, tags, created_at, updated_at) VALUES (?, ?, 'markdown', ?, ?, ?)`,
      )
      .run(title, content, tags, nowIso, nowIso);
    const created = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(Number(result.lastInsertRowid)) as unknown as NoteRow;
    res.status(201).json(formatNote(created));
  });

  app.get('/api/notes/:id', (req: Request, res: Response) => {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL`)
      .get(Number(req.params.id)) as unknown as NoteRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'record not found' });
      return;
    }
    res.json(formatNote(row));
  });

  app.put('/api/notes/:id', (req: Request, res: Response) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db
      .prepare(`SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as unknown as NoteRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'record not found' });
      return;
    }

    const nextTitle = req.body?.title !== undefined ? String(req.body.title) : existing.title;
    const nextContent = req.body?.content !== undefined ? String(req.body.content) : existing.content;
    const nextTags = req.body?.tags !== undefined ? String(req.body.tags) : existing.tags;
    const nowIso = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      if (nextContent !== existing.content) {
        const cards = db
          .prepare(`SELECT * FROM cards WHERE note_id = ? AND deleted_at IS NULL`)
          .all(id) as unknown as CardRow[];
        const updateCardAnchor = db.prepare(
          `UPDATE cards SET start_offset = ?, end_offset = ?, anchor_valid = ?, updated_at = ? WHERE id = ?`,
        );
        for (const card of cards) {
          const anchor = card.source_text || card.excerpt;
          const { start, end, found } = findAnchor(nextContent, anchor, card.start_offset);
          updateCardAnchor.run(start, end, found ? 1 : 0, nowIso, card.id);
        }

        const annotations = db
          .prepare(`SELECT * FROM annotations WHERE note_id = ? AND deleted_at IS NULL`)
          .all(id) as unknown as AnnotationRow[];
        const updateAnnAnchor = db.prepare(
          `UPDATE annotations SET start_offset = ?, end_offset = ?, anchor_valid = ?, updated_at = ? WHERE id = ?`,
        );
        for (const ann of annotations) {
          const anchor = ann.source_text || ann.excerpt;
          const { start, end, found } = findAnchor(nextContent, anchor, ann.start_offset);
          updateAnnAnchor.run(start, end, found ? 1 : 0, nowIso, ann.id);
        }
      }

      db.prepare(
        `UPDATE notes SET title = ?, content = ?, format = 'markdown', tags = ?, updated_at = ? WHERE id = ?`,
      ).run(nextTitle, nextContent, nextTags, nowIso, id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: err instanceof Error ? err.message : '更新笔记失败' });
      return;
    }

    const updated = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as unknown as NoteRow;
    res.json(formatNote(updated));
  });

  app.delete('/api/notes/:id', (req: Request, res: Response) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db
      .prepare(`SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as unknown as NoteRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'record not found' });
      return;
    }
    const nowIso = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `UPDATE annotations SET deleted_at = ? WHERE card_id IN (SELECT id FROM cards WHERE note_id = ?) AND deleted_at IS NULL`,
      ).run(nowIso, id);
      db.prepare(`UPDATE cards SET deleted_at = ? WHERE note_id = ? AND deleted_at IS NULL`).run(nowIso, id);
      db.prepare(`UPDATE annotations SET deleted_at = ? WHERE note_id = ? AND deleted_at IS NULL`).run(nowIso, id);
      db.prepare(`UPDATE notes SET deleted_at = ? WHERE id = ?`).run(nowIso, id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: err instanceof Error ? err.message : '删除笔记失败' });
      return;
    }
    res.status(204).end();
  });

  // Note Cards
  app.get('/api/notes/:id/cards', (req: Request, res: Response) => {
    const db = getDb();
    const noteId = Number(req.params.id);
    const note = db
      .prepare(`SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL`)
      .get(noteId) as unknown as NoteRow | undefined;
    if (!note) {
      res.status(404).json({ error: 'record not found' });
      return;
    }
    const rows = db
      .prepare(`SELECT * FROM cards WHERE note_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC`)
      .all(noteId) as unknown as CardRow[];
    res.json(
      rows.map((r) =>
        formatCard({
          ...r,
          note_title: note.title,
          note_content: note.content,
          note_format: note.format,
        }),
      ),
    );
  });

  app.post('/api/notes/:id/cards', (req: Request, res: Response) => {
    const db = getDb();
    const noteId = Number(req.params.id);
    const note = db
      .prepare(`SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL`)
      .get(noteId) as unknown as NoteRow | undefined;
    if (!note) {
      res.status(404).json({ error: 'record not found' });
      return;
    }

    const excerptInput = String(req.body?.excerpt ?? '');
    const sourceText = String(req.body?.sourceText ?? '') || excerptInput;
    const startOffset = Number(req.body?.startOffset ?? 0);
    const endOffset = Number(req.body?.endOffset ?? 0);
    const question = String(req.body?.question ?? req.body?.prompt ?? '').trim();
    const prompt = String(req.body?.prompt ?? '');
    const answer = String(req.body?.answer ?? '').trim() || sourceText;

    if (!excerptInput.trim() || startOffset < 0 || endOffset <= startOffset) {
      res.status(400).json({ error: 'excerpt and valid offsets are required' });
      return;
    }
    if (endOffset > note.content.length) {
      res.status(400).json({ error: 'selection offsets exceed note content' });
      return;
    }
    if (sourceText.length !== endOffset - startOffset || sliceUTF16(note.content, startOffset, endOffset) !== sourceText) {
      res.status(400).json({ error: 'selection text and offsets do not match' });
      return;
    }
    if (!question) {
      res.status(400).json({ error: 'question is required' });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const cloze = clozeExcerpt(note.content, startOffset, endOffset);
    const fsrsState = createInitialFsrsState(now);

    const result = db
      .prepare(
        `INSERT INTO cards (note_id, excerpt, context_override, source_text, start_offset, end_offset, anchor_valid, question, prompt, answer, due_at, fsrs_state, created_at, updated_at) VALUES (?, ?, '', ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        noteId,
        cloze,
        sourceText,
        startOffset,
        endOffset,
        question,
        prompt,
        answer,
        nowIso,
        fsrsState,
        nowIso,
        nowIso,
      );

    const created = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(Number(result.lastInsertRowid)) as unknown as CardRow;
    res.status(201).json(
      formatCard({
        ...created,
        note_title: note.title,
        note_content: note.content,
        note_format: note.format,
      }),
    );
  });

  // Annotations
  app.get('/api/notes/:id/annotations', (req: Request, res: Response) => {
    const db = getDb();
    const noteId = Number(req.params.id);
    const rows = db
      .prepare(`SELECT * FROM annotations WHERE note_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC`)
      .all(noteId) as unknown as AnnotationRow[];
    res.json(rows.map(formatAnnotation));
  });

  app.post('/api/notes/:id/annotations', (req: Request, res: Response) => {
    const db = getDb();
    const noteId = Number(req.params.id);
    const note = db
      .prepare(`SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL`)
      .get(noteId) as unknown as NoteRow | undefined;
    if (!note) {
      res.status(404).json({ error: 'record not found' });
      return;
    }

    const excerpt = String(req.body?.excerpt ?? '');
    const sourceText = String(req.body?.sourceText ?? '') || excerpt;
    const startOffset = Number(req.body?.startOffset ?? 0);
    const endOffset = Number(req.body?.endOffset ?? 0);
    const comment = String(req.body?.comment ?? '').trim();

    if (!excerpt.trim() || startOffset < 0 || endOffset <= startOffset) {
      res.status(400).json({ error: 'selected text and valid offsets are required' });
      return;
    }
    if (sourceText.length !== endOffset - startOffset || sliceUTF16(note.content, startOffset, endOffset) !== sourceText) {
      res.status(400).json({ error: 'source text does not match the note' });
      return;
    }

    const nowIso = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO annotations (note_id, card_id, field, excerpt, source_text, start_offset, end_offset, comment, anchor_valid, created_at, updated_at) VALUES (?, NULL, '', ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(noteId, excerpt, sourceText, startOffset, endOffset, comment, nowIso, nowIso);
    const created = db.prepare(`SELECT * FROM annotations WHERE id = ?`).get(Number(result.lastInsertRowid)) as unknown as AnnotationRow;
    res.status(201).json(formatAnnotation(created));
  });

  app.get('/api/cards/:id/annotations', (req: Request, res: Response) => {
    const db = getDb();
    const cardId = Number(req.params.id);
    const card = db
      .prepare(`SELECT id FROM cards WHERE id = ? AND deleted_at IS NULL`)
      .get(cardId) as { id: number } | undefined;
    if (!card) {
      res.status(404).json({ error: 'record not found' });
      return;
    }
    const rows = db
      .prepare(`SELECT * FROM annotations WHERE card_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC`)
      .all(cardId) as unknown as AnnotationRow[];
    res.json(rows.map(formatAnnotation));
  });

  app.post('/api/cards/:id/annotations', (req: Request, res: Response) => {
    const db = getDb();
    const cardId = Number(req.params.id);
    const card = db
      .prepare(
        `SELECT c.*, n.content AS note_content FROM cards c LEFT JOIN notes n ON n.id = c.note_id AND n.deleted_at IS NULL WHERE c.id = ? AND c.deleted_at IS NULL`,
      )
      .get(cardId) as unknown as CardRow | undefined;
    if (!card) {
      res.status(404).json({ error: 'record not found' });
      return;
    }

    const field = String(req.body?.field ?? '').trim();
    if (!['question', 'answer', 'context'].includes(field)) {
      res.status(400).json({ error: 'field must be question, answer, or context' });
      return;
    }
    const excerpt = String(req.body?.excerpt ?? '');
    const sourceText = String(req.body?.sourceText ?? '') || excerpt;
    const startOffset = Number(req.body?.startOffset ?? 0);
    const endOffset = Number(req.body?.endOffset ?? 0);
    const comment = String(req.body?.comment ?? '').trim();

    if (!excerpt.trim() || startOffset < 0 || endOffset <= startOffset) {
      res.status(400).json({ error: 'selected text and valid offsets are required' });
      return;
    }

    let targetContent = card.question || card.prompt || '';
    if (field === 'answer') {
      targetContent = card.answer;
    } else if (field === 'context') {
      targetContent = resolveCardContext(card, card.note_content);
    }

    if (sourceText.length !== endOffset - startOffset || sliceUTF16(targetContent, startOffset, endOffset) !== sourceText) {
      res.status(400).json({ error: 'source text does not match card content' });
      return;
    }

    const nowIso = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO annotations (note_id, card_id, field, excerpt, source_text, start_offset, end_offset, comment, anchor_valid, created_at, updated_at) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(cardId, field, excerpt, sourceText, startOffset, endOffset, comment, nowIso, nowIso);
    const created = db.prepare(`SELECT * FROM annotations WHERE id = ?`).get(Number(result.lastInsertRowid)) as unknown as AnnotationRow;
    res.status(201).json(formatAnnotation(created));
  });

  app.put('/api/annotations/:id', (req: Request, res: Response) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db
      .prepare(`SELECT * FROM annotations WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as unknown as AnnotationRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'record not found' });
      return;
    }
    const comment = String(req.body?.comment ?? '').trim();
    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE annotations SET comment = ?, updated_at = ? WHERE id = ?`).run(comment, nowIso, id);
    const updated = db.prepare(`SELECT * FROM annotations WHERE id = ?`).get(id) as unknown as AnnotationRow;
    res.json(formatAnnotation(updated));
  });

  app.delete('/api/annotations/:id', (req: Request, res: Response) => {
    const db = getDb();
    const id = Number(req.params.id);
    const nowIso = new Date().toISOString();
    const result = db
      .prepare(`UPDATE annotations SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(nowIso, id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'annotation not found' });
      return;
    }
    res.status(204).end();
  });

  // Cards Library & Standalone
  app.get('/api/cards', (req: Request, res: Response) => {
    const db = getDb();
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '30'), 10) || 30));
    const sortBy = String(req.query.sort ?? 'due');
    const search = String(req.query.q ?? '').trim();

    let whereSql = `c.deleted_at IS NULL`;
    const params: string[] = [];
    if (search) {
      const like = escapeLike(search);
      whereSql += ` AND (c.question LIKE ? ESCAPE '\\' OR c.answer LIKE ? ESCAPE '\\' OR c.excerpt LIKE ? ESCAPE '\\' OR c.context_override LIKE ? ESCAPE '\\' OR n.title LIKE ? ESCAPE '\\')`;
      params.push(like, like, like, like, like);
    }

    const allRows = db
      .prepare(
        `SELECT c.*, n.title AS note_title, n.content AS note_content, n.format AS note_format
         FROM cards c
         LEFT JOIN notes n ON n.id = c.note_id AND n.deleted_at IS NULL
         WHERE ${whereSql}`,
      )
      .all(...params) as unknown as CardRow[];

    const nowMs = Date.now();
    const dueCount = allRows.filter((r) => isCardDue(r.due_at, nowMs)).length;

    allRows.sort((a, b) => {
      if (sortBy === 'created_desc') {
        const ca = parseTimestampMs(a.created_at) ?? 0;
        const cb = parseTimestampMs(b.created_at) ?? 0;
        if (cb !== ca) return cb - ca;
        return b.id - a.id;
      }
      const da = parseTimestampMs(a.due_at) ?? 0;
      const dbTime = parseTimestampMs(b.due_at) ?? 0;
      if (da !== dbTime) return da - dbTime;
      return a.id - b.id;
    });

    const total = allRows.length;
    const paged = allRows.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      items: paged.map((r) => formatCard(r)),
      total,
      dueCount,
      page,
      pageSize,
    });
  });

  app.post('/api/cards', (req: Request, res: Response) => {
    const db = getDb();
    const question = String(req.body?.question ?? '').trim();
    const answer = String(req.body?.answer ?? '').trim();
    const context = String(req.body?.context ?? req.body?.excerpt ?? '').trim();
    if (!question || !answer) {
      res.status(400).json({ error: 'question and answer are required' });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const fsrsState = createInitialFsrsState(now);
    const result = db
      .prepare(
        `INSERT INTO cards (note_id, excerpt, context_override, source_text, start_offset, end_offset, anchor_valid, question, prompt, answer, due_at, fsrs_state, created_at, updated_at) VALUES (NULL, ?, '', '', 0, 0, 0, ?, '', ?, ?, ?, ?, ?)`,
      )
      .run(context, question, answer, nowIso, fsrsState, nowIso, nowIso);
    const created = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(Number(result.lastInsertRowid)) as unknown as CardRow;
    res.status(201).json(formatCard(created));
  });

  app.put('/api/cards/:id', (req: Request, res: Response) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db
      .prepare(
        `SELECT c.*, n.title AS note_title, n.content AS note_content, n.format AS note_format
         FROM cards c
         LEFT JOIN notes n ON n.id = c.note_id AND n.deleted_at IS NULL
         WHERE c.id = ? AND c.deleted_at IS NULL`,
      )
      .get(id) as unknown as CardRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'record not found' });
      return;
    }

    const nextQuestion = req.body?.question !== undefined ? String(req.body.question).trim() : existing.question;
    if (!nextQuestion) {
      res.status(400).json({ error: 'question is required' });
      return;
    }
    const nextAnswer = req.body?.answer !== undefined ? String(req.body.answer).trim() : existing.answer;
    if (!nextAnswer) {
      res.status(400).json({ error: 'answer is required' });
      return;
    }

    let nextExcerpt = existing.excerpt;
    let nextContextOverride = existing.context_override;
    if (req.body?.context !== undefined) {
      const ctx = String(req.body.context).trim();
      if (existing.note_id == null) {
        nextExcerpt = ctx;
      } else {
        nextContextOverride = ctx;
      }
    }

    const nowIso = new Date().toISOString();
    const contentByField: Record<string, string> = {
      question: nextQuestion,
      answer: nextAnswer,
      context:
        existing.note_id == null
          ? nextExcerpt
          : nextContextOverride || clozeExcerpt(existing.note_content ?? '', existing.start_offset, existing.end_offset),
    };

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `UPDATE cards SET question = ?, answer = ?, excerpt = ?, context_override = ?, updated_at = ? WHERE id = ?`,
      ).run(nextQuestion, nextAnswer, nextExcerpt, nextContextOverride, nowIso, id);

      const anns = db
        .prepare(`SELECT * FROM annotations WHERE card_id = ? AND deleted_at IS NULL`)
        .all(id) as unknown as AnnotationRow[];
      const updateAnn = db.prepare(
        `UPDATE annotations SET start_offset = ?, end_offset = ?, anchor_valid = ?, updated_at = ? WHERE id = ?`,
      );
      for (const ann of anns) {
        const fieldText = contentByField[ann.field] ?? '';
        const anchor = ann.source_text || ann.excerpt;
        const { start, end, found } = findAnchor(fieldText, anchor, ann.start_offset);
        updateAnn.run(start, end, found ? 1 : 0, nowIso, ann.id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: err instanceof Error ? err.message : '更新卡片失败' });
      return;
    }

    const updated = db
      .prepare(
        `SELECT c.*, n.title AS note_title, n.content AS note_content, n.format AS note_format
         FROM cards c
         LEFT JOIN notes n ON n.id = c.note_id AND n.deleted_at IS NULL
         WHERE c.id = ?`,
      )
      .get(id) as unknown as CardRow;
    res.json(formatCard(updated));
  });

  app.delete('/api/cards/:id', (req: Request, res: Response) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db
      .prepare(`SELECT id FROM cards WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as { id: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'record not found' });
      return;
    }
    const nowIso = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`UPDATE annotations SET deleted_at = ? WHERE card_id = ? AND deleted_at IS NULL`).run(nowIso, id);
      db.prepare(`UPDATE cards SET deleted_at = ? WHERE id = ?`).run(nowIso, id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: err instanceof Error ? err.message : '删除卡片失败' });
      return;
    }
    res.status(204).end();
  });

  app.get('/api/cards/due', (_req: Request, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT c.*, n.title AS note_title, n.content AS note_content, n.format AS note_format
         FROM cards c
         LEFT JOIN notes n ON n.id = c.note_id AND n.deleted_at IS NULL
         WHERE c.deleted_at IS NULL`,
      )
      .all() as unknown as CardRow[];

    const now = new Date();
    const nowMs = now.getTime();
    const retention = getDesiredRetention();

    const due = rows
      .filter((r) => isCardDue(r.due_at, nowMs))
      .sort((a, b) => (parseTimestampMs(a.due_at) ?? 0) - (parseTimestampMs(b.due_at) ?? 0) || a.id - b.id);

    res.json(due.map((r) => formatCard(r, retention, now)));
  });

  // Reviews
  app.post('/api/cards/:id/review', (req: Request, res: Response) => {
    const db = getDb();
    const id = Number(req.params.id);
    const rating = Number(req.body?.rating);
    const responseText = String(req.body?.response ?? '');
    if (![1, 2, 3, 4].includes(rating)) {
      res.status(400).json({ error: 'rating must be between 1 (Again) and 4 (Easy)' });
      return;
    }

    const card = db
      .prepare(
        `SELECT c.*, n.title AS note_title, n.content AS note_content, n.format AS note_format
         FROM cards c
         LEFT JOIN notes n ON n.id = c.note_id AND n.deleted_at IS NULL
         WHERE c.id = ? AND c.deleted_at IS NULL`,
      )
      .get(id) as unknown as CardRow | undefined;
    if (!card) {
      res.status(404).json({ error: 'record not found' });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const createdAt = new Date(toIsoOrNull(card.created_at) ?? nowIso);
    const retention = getDesiredRetention();

    const { nextStateJson, dueAt, fsrsLogJson } = scheduleReview(
      card.fsrs_state,
      createdAt,
      now,
      rating as 1 | 2 | 3 | 4,
      retention,
    );
    const dueBefore = toIsoOrNull(card.due_at);
    const dueAfterIso = dueAt.toISOString();

    let logId = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`UPDATE cards SET fsrs_state = ?, due_at = ?, updated_at = ? WHERE id = ?`).run(
        nextStateJson,
        dueAfterIso,
        nowIso,
        id,
      );
      const logRes = db
        .prepare(
          `INSERT INTO review_logs (card_id, rating, response, reviewed_at, due_before, due_after, fsrs_log, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, rating, responseText, nowIso, dueBefore, dueAfterIso, fsrsLogJson, nowIso);
      logId = Number(logRes.lastInsertRowid);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: err instanceof Error ? err.message : '提交复习失败' });
      return;
    }

    const updated = db
      .prepare(
        `SELECT c.*, n.title AS note_title, n.content AS note_content, n.format AS note_format
         FROM cards c
         LEFT JOIN notes n ON n.id = c.note_id AND n.deleted_at IS NULL
         WHERE c.id = ?`,
      )
      .get(id) as unknown as CardRow;

    res.json({
      card: formatCard(updated),
      review: {
        id: logId,
        cardId: id,
        rating,
        response: responseText,
        reviewedAt: nowIso,
        dueBefore,
        dueAfter: dueAfterIso,
      },
      dueAt: dueAfterIso,
    });
  });

  app.get('/api/reviews/stats', (_req: Request, res: Response) => {
    const db = getDb();
    const now = new Date();
    const nowMs = now.getTime();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();

    const notes = Number(
      (db.prepare(`SELECT COUNT(*) AS c FROM notes WHERE deleted_at IS NULL`).get() as { c: number }).c,
    );
    const cardRows = db
      .prepare(`SELECT due_at FROM cards WHERE deleted_at IS NULL`)
      .all() as Array<{ due_at: string | null }>;
    const cards = cardRows.length;
    const due = cardRows.filter((r) => isCardDue(r.due_at, nowMs)).length;

    const logRows = db
      .prepare(`SELECT reviewed_at FROM review_logs`)
      .all() as Array<{ reviewed_at: string }>;
    const reviewedToday = logRows.filter((l) => (parseTimestampMs(l.reviewed_at) ?? 0) >= startOfToday).length;

    res.json({ notes, cards, due, reviewedToday });
  });

  app.get('/api/reviews/history', (_req: Request, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT rl.id, rl.card_id, rl.rating, rl.response, rl.reviewed_at,
                c.question, c.prompt, c.excerpt, c.note_id, c.context_override, c.start_offset, c.end_offset,
                n.content AS note_content, n.title AS note_title
         FROM review_logs rl
         LEFT JOIN cards c ON c.id = rl.card_id
         LEFT JOIN notes n ON n.id = c.note_id
         ORDER BY rl.reviewed_at DESC, rl.id DESC
         LIMIT 500`,
      )
      .all() as Array<{
        id: number;
        card_id: number;
        rating: number;
        response: string;
        reviewed_at: string;
        question: string | null;
        prompt: string | null;
        excerpt: string | null;
        note_id: number | null;
        context_override: string | null;
        start_offset: number | null;
        end_offset: number | null;
        note_content: string | null;
        note_title: string | null;
      }>;

    const result = rows.map((r) => {
      const ctx = resolveCardContext(
        {
          note_id: r.note_id,
          excerpt: r.excerpt ?? '',
          context_override: r.context_override ?? '',
          start_offset: r.start_offset ?? 0,
          end_offset: r.end_offset ?? 0,
        },
        r.note_content,
      );
      return {
        id: r.id,
        cardId: r.card_id,
        rating: r.rating,
        response: r.response || '',
        reviewedAt: toIsoOrNull(r.reviewed_at) ?? r.reviewed_at,
        question: r.question || r.prompt || '',
        excerpt: ctx,
        noteTitle: r.note_id == null ? '独立卡片' : (r.note_title ?? ''),
      };
    });

    res.json(result);
  });

  app.get('/api/reviews/overview', (req: Request, res: Response) => {
    const db = getDb();
    const now = new Date();
    const currentYear = now.getFullYear();
    const requestedYear = Number.parseInt(String(req.query.year ?? currentYear), 10) || currentYear;
    const year = Math.min(currentYear, Math.max(1970, requestedYear));

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const firstDay = new Date(startOfToday);
    firstDay.setDate(firstDay.getDate() - 29);

    const notesRows = db
      .prepare(`SELECT created_at FROM notes WHERE deleted_at IS NULL`)
      .all() as Array<{ created_at: string }>;
    const cardRows = db
      .prepare(`SELECT due_at FROM cards WHERE deleted_at IS NULL`)
      .all() as Array<{ due_at: string | null }>;
    const logRows = db
      .prepare(`SELECT rating, reviewed_at FROM review_logs`)
      .all() as Array<{ rating: number; reviewed_at: string }>;

    const nowMs = now.getTime();
    const due = cardRows.filter((c) => isCardDue(c.due_at, nowMs)).length;
    const totalReviews = logRows.length;
    const reviewedToday = logRows.filter(
      (l) => (parseTimestampMs(l.reviewed_at) ?? 0) >= startOfToday.getTime(),
    ).length;

    const ratings: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
    let ratingSum = 0;
    for (const l of logRows) {
      const key = String(l.rating);
      if (ratings[key] !== undefined) ratings[key] += 1;
      ratingSum += l.rating;
    }
    const averageRating = totalReviews > 0 ? ratingSum / totalReviews : 0;

    // Last 30 days
    const days: Array<{ date: string; count: number; good: number }> = [];
    const dayIndexMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(firstDay);
      d.setDate(firstDay.getDate() + i);
      const dateStr = localDateString(d);
      dayIndexMap.set(dateStr, i);
      days.push({ date: dateStr, count: 0, good: 0 });
    }

    let reviewsLast30Days = 0;
    for (const l of logRows) {
      const ms = parseTimestampMs(l.reviewed_at);
      if (ms === null || ms < firstDay.getTime()) continue;
      const dateStr = localDateString(new Date(ms));
      const idx = dayIndexMap.get(dateStr);
      if (idx !== undefined) {
        days[idx].count += 1;
        if (l.rating >= 3) days[idx].good += 1;
        reviewsLast30Days += 1;
      }
    }

    // Note creation heatmap for selected year
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInYear = isLeap ? 366 : 365;
    const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
    const noteDays: Array<{ date: string; count: number }> = [];
    const noteDayMap = new Map<string, number>();
    for (let i = 0; i < daysInYear; i++) {
      const d = new Date(yearStart);
      d.setDate(yearStart.getDate() + i);
      const ds = localDateString(d);
      noteDayMap.set(ds, i);
      noteDays.push({ date: ds, count: 0 });
    }

    const yearsSet = new Set<number>([currentYear]);
    for (const n of notesRows) {
      const ms = parseTimestampMs(n.created_at);
      if (ms === null) continue;
      const d = new Date(ms);
      yearsSet.add(d.getFullYear());
      if (d.getFullYear() === year) {
        const idx = noteDayMap.get(localDateString(d));
        if (idx !== undefined) noteDays[idx].count += 1;
      }
    }
    const noteYears = [...yearsSet].sort((a, b) => b - a);

    // Recent 8 logs
    const recentRows = db
      .prepare(
        `SELECT rl.id, rl.card_id, rl.rating, rl.response, rl.reviewed_at,
                c.question, c.prompt, c.excerpt, c.note_id, c.context_override, c.start_offset, c.end_offset,
                n.content AS note_content, n.title AS note_title
         FROM review_logs rl
         LEFT JOIN cards c ON c.id = rl.card_id
         LEFT JOIN notes n ON n.id = c.note_id
         ORDER BY rl.reviewed_at DESC, rl.id DESC
         LIMIT 8`,
      )
      .all() as Array<{
        id: number;
        card_id: number;
        rating: number;
        response: string;
        reviewed_at: string;
        question: string | null;
        prompt: string | null;
        excerpt: string | null;
        note_id: number | null;
        context_override: string | null;
        start_offset: number | null;
        end_offset: number | null;
        note_content: string | null;
        note_title: string | null;
      }>;

    const recent = recentRows.map((r) => ({
      id: r.id,
      cardId: r.card_id,
      rating: r.rating,
      response: r.response || '',
      reviewedAt: toIsoOrNull(r.reviewed_at) ?? r.reviewed_at,
      question: r.question || r.prompt || '',
      excerpt: resolveCardContext(
        {
          note_id: r.note_id,
          excerpt: r.excerpt ?? '',
          context_override: r.context_override ?? '',
          start_offset: r.start_offset ?? 0,
          end_offset: r.end_offset ?? 0,
        },
        r.note_content,
      ),
      noteTitle: r.note_id == null ? '独立卡片' : (r.note_title ?? ''),
    }));

    res.json({
      summary: {
        notes: notesRows.length,
        cards: cardRows.length,
        due,
        totalReviews,
        reviewedToday,
        reviewsLast30Days,
        averageRating,
      },
      days,
      noteDays,
      noteYear: year,
      noteYears,
      ratings,
      recent,
    });
  });

  // Diaries
  app.get('/api/diaries', (req: Request, res: Response) => {
    const db = getDb();
    const month = String(req.query.month ?? '');
    let rows: DiaryRow[];
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        res.status(400).json({ error: 'month must use YYYY-MM format' });
        return;
      }
      rows = db
        .prepare(`SELECT * FROM diary_entries WHERE entry_date LIKE ? ORDER BY entry_date DESC`)
        .all(`${month}%`) as unknown as DiaryRow[];
    } else {
      rows = db
        .prepare(`SELECT * FROM diary_entries ORDER BY entry_date DESC LIMIT 120`)
        .all() as unknown as DiaryRow[];
    }

    res.json(
      rows.map((r) => ({
        id: r.id,
        date: String(r.entry_date).slice(0, 10),
        excerpt: diaryExcerpt(r.content || ''),
        updatedAt: toIsoOrNull(r.updated_at) ?? new Date().toISOString(),
      })),
    );
  });

  app.get('/api/diaries/:date', (req: Request, res: Response) => {
    const db = getDb();
    const date = String(req.params.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date must use YYYY-MM-DD format' });
      return;
    }
    const row = db
      .prepare(`SELECT * FROM diary_entries WHERE substr(entry_date, 1, 10) = ?`)
      .get(date) as unknown as DiaryRow | undefined;
    if (!row) {
      res.json({ id: 0, date, content: '', createdAt: '', updatedAt: '' });
      return;
    }
    res.json({
      id: row.id,
      date: String(row.entry_date).slice(0, 10),
      content: row.content || '',
      createdAt: toIsoOrNull(row.created_at) ?? '',
      updatedAt: toIsoOrNull(row.updated_at) ?? '',
    });
  });

  app.put('/api/diaries/:date', (req: Request, res: Response) => {
    const db = getDb();
    const date = String(req.params.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date must use YYYY-MM-DD format' });
      return;
    }
    const content = String(req.body?.content ?? '');
    const nowIso = new Date().toISOString();
    const existing = db
      .prepare(`SELECT * FROM diary_entries WHERE substr(entry_date, 1, 10) = ?`)
      .get(date) as unknown as DiaryRow | undefined;

    if (existing) {
      db.prepare(`UPDATE diary_entries SET content = ?, updated_at = ? WHERE id = ?`).run(
        content,
        nowIso,
        existing.id,
      );
    } else {
      db.prepare(
        `INSERT INTO diary_entries (entry_date, content, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ).run(date, content, nowIso, nowIso);
    }
    const saved = db
      .prepare(`SELECT * FROM diary_entries WHERE substr(entry_date, 1, 10) = ?`)
      .get(date) as unknown as DiaryRow;
    res.json({
      id: saved.id,
      date: String(saved.entry_date).slice(0, 10),
      content: saved.content || '',
      createdAt: toIsoOrNull(saved.created_at) ?? nowIso,
      updatedAt: toIsoOrNull(saved.updated_at) ?? nowIso,
    });
  });

  app.delete('/api/diaries/:date', (req: Request, res: Response) => {
    const db = getDb();
    const date = String(req.params.date ?? '');
    const result = db.prepare(`DELETE FROM diary_entries WHERE substr(entry_date, 1, 10) = ?`).run(date);
    if (result.changes === 0) {
      res.status(404).json({ error: 'diary entry not found' });
      return;
    }
    res.status(204).end();
  });

  // Settings
  app.get('/api/settings', (_req: Request, res: Response) => {
    res.json({ desiredRetention: getDesiredRetention() });
  });

  app.put('/api/settings', (req: Request, res: Response) => {
    const db = getDb();
    const retention = Number(req.body?.desiredRetention);
    if (Number.isNaN(retention) || !Number.isFinite(retention) || retention < 0.7 || retention > 0.97) {
      res.status(400).json({ error: 'desiredRetention must be between 0.70 and 0.97' });
      return;
    }
    const value = retention.toFixed(2);
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('desiredRetention', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(value, nowIso);
    res.json({ desiredRetention: Number.parseFloat(value) });
  });

  // Frontend middleware / static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Recall Box server running on http://0.0.0.0:${port}`);
  });
}

void startServer();
