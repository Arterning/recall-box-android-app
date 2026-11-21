import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createInitialFsrsState } from './fsrs.ts';
import { clozeExcerpt, localDateString } from './helpers.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'recall-box.db');
const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');

let dbInstance: DatabaseSync | null = null;

function ensureDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

function ensureSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'markdown',
      tags TEXT NOT NULL DEFAULT '',
      created_at DATETIME,
      updated_at DATETIME,
      deleted_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);

    CREATE TABLE IF NOT EXISTS diary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date DATE NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at DATETIME,
      updated_at DATETIME
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_entries_entry_date ON diary_entries(entry_date);

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER,
      excerpt TEXT NOT NULL DEFAULT '',
      context_override TEXT NOT NULL DEFAULT '',
      source_text TEXT NOT NULL DEFAULT '',
      start_offset INTEGER NOT NULL DEFAULT 0,
      end_offset INTEGER NOT NULL DEFAULT 0,
      anchor_valid NUMERIC NOT NULL DEFAULT 1,
      question TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      due_at DATETIME,
      fsrs_state TEXT,
      created_at DATETIME,
      updated_at DATETIME,
      deleted_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_cards_note_id ON cards(note_id);
    CREATE INDEX IF NOT EXISTS idx_cards_due_at ON cards(due_at);
    CREATE INDEX IF NOT EXISTS idx_cards_deleted_at ON cards(deleted_at);

    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER,
      card_id INTEGER,
      field TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      source_text TEXT NOT NULL DEFAULT '',
      start_offset INTEGER NOT NULL DEFAULT 0,
      end_offset INTEGER NOT NULL DEFAULT 0,
      comment TEXT NOT NULL DEFAULT '',
      anchor_valid NUMERIC NOT NULL DEFAULT 1,
      created_at DATETIME,
      updated_at DATETIME,
      deleted_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_note_id ON annotations(note_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_card_id ON annotations(card_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_deleted_at ON annotations(deleted_at);

    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      response TEXT NOT NULL DEFAULT '',
      reviewed_at DATETIME,
      due_before DATETIME,
      due_after DATETIME,
      fsrs_log TEXT,
      created_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_review_logs_card_id ON review_logs(card_id);
    CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON review_logs(reviewed_at);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME
    );
  `);

  const nowIso = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('desiredRetention', '0.9', ?)`,
  ).run(nowIso);

  // Match Go store.Open migrations for legacy recall-box databases
  db.exec(`UPDATE cards SET question = prompt WHERE (question IS NULL OR question = '') AND prompt IS NOT NULL AND prompt <> ''`);
  db.exec(`UPDATE notes SET format = 'markdown' WHERE format IS NULL OR format <> 'markdown'`);
}

function seedStarterDataIfEmpty(db: DatabaseSync) {
  const noteCount = Number((db.prepare(`SELECT COUNT(*) AS cnt FROM notes`).get() as { cnt: number }).cnt);
  const cardCount = Number((db.prepare(`SELECT COUNT(*) AS cnt FROM cards`).get() as { cnt: number }).cnt);
  const diaryCount = Number((db.prepare(`SELECT COUNT(*) AS cnt FROM diary_entries`).get() as { cnt: number }).cnt);
  if (noteCount > 0 || cardCount > 0 || diaryCount > 0) return;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
  const nextWeek = new Date(now.getTime() + 7 * 86_400_000);

  const note1Content = `# Recall Box 学习工作流

Recall Box 把**笔记阅读**和**间隔重复记忆**连在一起，避免收集大量资料后从未真正消化。

## 1. 先用划线与批注做轻量复习

阅读 Markdown 笔记时，选中一段文字即可添加**划线**或**批注**。复习时点击工具栏的「隐藏高亮」按钮，就能把划重点的内容遮住进行自测，而不必为每句话都建一张卡片。

## 2. 难以记住的内容再转为复习卡

当某段概念反复忘记时，选中关键片段点击「创建复习卡」。系统会自动提取所在段落作为挖空上下文，把选中的片段设为参考答案，并交由 FSRS-6 算法安排复习时机。`;

  const note2Content = `# FSRS-6 间隔重复算法核心概念

FSRS（Free Spaced Repetition Scheduler）基于记忆的三变量模型：**稳定性（Stability）**、**难度（Difficulty）**与**可提取性（Retrievability）**。

其中，目标记忆保留率（Desired Retention）默认设置为 90%，代表希望卡片到期时仍有 90% 的概率被成功回忆。

## 与传统 SM-2 的区别

SM-2 使用固定的易度系数与区间乘数；FSRS 则根据每次自评（忘了 / 困难 / 记得 / 简单）动态拟合遗忘曲线，显著减少无效重复复习。`;

  const note3Content = `# Android 与桌面端 SQLite 数据互通

本应用使用标准的 SQLite 数据库文件（\`recall-box.db\`），表结构与 \`Arterning/recall-box\` 的 GORM 模型完全兼容：

- \`notes\`：存储原始 Markdown 笔记与标签（支持软删除 \`deleted_at\`）
- \`cards\`：存储挖空位置（UTF-16 偏移量）与 \`go-fsrs/v4\` JSON 状态
- \`annotations\`：支持笔记与卡片字段的局部划线与批注
- \`diary_entries\`：按本地日期 \`YYYY-MM-DD\` 记录每日学习日记
- \`review_logs\` & \`app_settings\`：保留完整复习历史与保留率设置

前往「设置 → SQLite 数据兼容」即可一键导入或导出 \`recall-box.db\`，也可下载完整 Android Kotlin 原生工程源码。`;

  const insertNote = db.prepare(
    `INSERT INTO notes (title, content, format, tags, created_at, updated_at) VALUES (?, ?, 'markdown', ?, ?, ?)`,
  );
  const n1 = Number(insertNote.run('Recall Box 学习工作流', note1Content, '方法论,记忆法', twoDaysAgo.toISOString(), twoDaysAgo.toISOString()).lastInsertRowid);
  const n2 = Number(insertNote.run('FSRS-6 间隔重复算法核心概念', note2Content, 'FSRS,算法', yesterday.toISOString(), yesterday.toISOString()).lastInsertRowid);
  const n3 = Number(insertNote.run('Android 与桌面端 SQLite 数据互通', note3Content, 'Android,SQLite', now.toISOString(), now.toISOString()).lastInsertRowid);

  // Add annotations on note 1 and note 2
  const ann1Target = '隐藏高亮';
  const ann1Start = note1Content.indexOf(ann1Target);
  const ann2Target = '稳定性（Stability）';
  const ann2Start = note2Content.indexOf(ann2Target);

  const insertAnn = db.prepare(
    `INSERT INTO annotations (note_id, card_id, field, excerpt, source_text, start_offset, end_offset, comment, anchor_valid, created_at, updated_at) VALUES (?, NULL, '', ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  if (ann1Start >= 0) {
    insertAnn.run(n1, ann1Target, ann1Target, ann1Start, ann1Start + ann1Target.length, '遮盖后悬停可偷看提示，适合轻度自测', yesterday.toISOString(), yesterday.toISOString());
  }
  if (ann2Start >= 0) {
    insertAnn.run(n2, ann2Target, ann2Target, ann2Start, ann2Start + ann2Target.length, '记忆衰减到 90% 所需天数', yesterday.toISOString(), yesterday.toISOString());
  }

  // Create due cards + scheduled card
  const card1Target = '目标记忆保留率（Desired Retention）默认设置为 90%';
  const card1Start = note2Content.indexOf(card1Target);
  const card2Target = 'UTF-16 偏移量';
  const card2Start = note3Content.indexOf(card2Target);

  const insertCard = db.prepare(
    `INSERT INTO cards (note_id, excerpt, context_override, source_text, start_offset, end_offset, anchor_valid, question, prompt, answer, due_at, fsrs_state, created_at, updated_at) VALUES (?, ?, '', ?, ?, ?, 1, ?, '', ?, ?, ?, ?, ?)`,
  );

  let dueCard1Id = 1;
  if (card1Start >= 0) {
    const cloze1 = clozeExcerpt(note2Content, card1Start, card1Start + card1Target.length);
    dueCard1Id = Number(
      insertCard.run(
        n2,
        cloze1,
        card1Target,
        card1Start,
        card1Start + card1Target.length,
        cloze1,
        card1Target,
        now.toISOString(),
        createInitialFsrsState(now),
        yesterday.toISOString(),
        yesterday.toISOString(),
      ).lastInsertRowid,
    );
  }

  if (card2Start >= 0) {
    const cloze2 = clozeExcerpt(note3Content, card2Start, card2Start + card2Target.length);
    insertCard.run(
      n3,
      cloze2,
      card2Target,
      card2Start,
      card2Start + card2Target.length,
      'Recall Box 在笔记和卡片中记录选区位置时采用哪种字符编码偏移量以兼容浏览器与桌面端？',
      'UTF-16 偏移量（与 JS string.slice 及 Go utf16.Encode 完全一致）',
      now.toISOString(),
      createInitialFsrsState(now),
      now.toISOString(),
      now.toISOString(),
    );
  }

  // Standalone scheduled card
  const scheduledState = JSON.stringify({
    Due: nextWeek.toISOString(),
    Stability: 7.4,
    Difficulty: 4.2,
    ElapsedDays: 1,
    ScheduledDays: 7,
    Reps: 2,
    Lapses: 0,
    State: 2,
    LastReview: yesterday.toISOString(),
  });
  const c3Id = Number(
    insertCard.run(
      null,
      '将难记知识点转成独立卡片时，仍可使用 Markdown 与图片补充上下文。',
      '',
      0,
      0,
      'Recall Box 支持哪四种 FSRS 复习自评等级？',
      '1 忘了（Again）、2 困难（Hard）、3 记得（Good）、4 简单（Easy）',
      nextWeek.toISOString(),
      scheduledState,
      twoDaysAgo.toISOString(),
      yesterday.toISOString(),
    ).lastInsertRowid,
  );

  // Sample review log for statistics preview
  db.prepare(
    `INSERT INTO review_logs (card_id, rating, response, reviewed_at, due_before, due_after, fsrs_log, created_at) VALUES (?, ?, ?, ?, ?, ?, '{}', ?)`,
  ).run(
    c3Id,
    3,
    '忘了、困难、记得、简单，对应 1-4 分',
    yesterday.toISOString(),
    twoDaysAgo.toISOString(),
    nextWeek.toISOString(),
    yesterday.toISOString(),
  );

  // Today's diary entry
  const todayStr = localDateString(now);
  db.prepare(
    `INSERT INTO diary_entries (entry_date, content, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run(
    todayStr,
    `### 今日学习记录\n\n- 熟悉了 Recall Box 的双层复习机制：先划线批注，再对难点制卡。\n- 确认了 \`recall-box.db\` 与桌面版及 Android 原生版的数据结构互通。`,
    now.toISOString(),
    now.toISOString(),
  );

  // Touch dueCard1Id variable so TS doesn't complain
  if (dueCard1Id < 0) return;
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    ensureDirectories();
    dbInstance = new DatabaseSync(DB_PATH);
    ensureSchema(dbInstance);
    seedStarterDataIfEmpty(dbInstance);
  }
  return dbInstance;
}

export function checkpointAndReadDb(): Buffer {
  const db = getDb();
  try {
    db.exec(`PRAGMA wal_checkpoint(TRUNCATE);`);
  } catch {
    // Ignore checkpoint errors if journal isn't WAL
  }
  return fs.readFileSync(DB_PATH);
}

export function replaceDatabaseFromBuffer(buffer: Buffer): { notes: number; cards: number; diaries: number } {
  if (buffer.length < 100 || buffer.subarray(0, 16).toString('utf8') !== 'SQLite format 3\0') {
    throw new Error('无效的 SQLite 数据库文件（文件头不是 SQLite format 3）');
  }
  ensureDirectories();
  const tempPath = path.join(DATA_DIR, `import-${Date.now()}.db`);
  fs.writeFileSync(tempPath, buffer);

  let probe: DatabaseSync | null = null;
  try {
    probe = new DatabaseSync(tempPath);
    const tables = probe
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));
    if (!tableNames.has('notes') && !tableNames.has('cards') && !tableNames.has('diary_entries')) {
      throw new Error('该 SQLite 文件不包含 Recall Box 所需的数据表（notes / cards / diary_entries）');
    }
    ensureSchema(probe);
    probe.exec(`PRAGMA wal_checkpoint(TRUNCATE);`);
    probe.close();
    probe = null;
  } catch (err) {
    if (probe) {
      try { probe.close(); } catch { /* ignore */ }
    }
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw err;
  }

  // Close current DB, swap file, remove stale WAL/SHM, reopen
  if (dbInstance) {
    try { dbInstance.close(); } catch { /* ignore */ }
    dbInstance = null;
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const target = DB_PATH + suffix;
    if (fs.existsSync(target) && suffix !== '') {
      fs.unlinkSync(target);
    }
  }
  fs.renameSync(tempPath, DB_PATH);

  const nextDb = getDb();
  const notes = Number((nextDb.prepare(`SELECT COUNT(*) AS c FROM notes WHERE deleted_at IS NULL`).get() as { c: number }).c);
  const cards = Number((nextDb.prepare(`SELECT COUNT(*) AS c FROM cards WHERE deleted_at IS NULL`).get() as { c: number }).c);
  const diaries = Number((nextDb.prepare(`SELECT COUNT(*) AS c FROM diary_entries`).get() as { c: number }).c);
  return { notes, cards, diaries };
}

export function getDataPaths() {
  ensureDirectories();
  const sizeBytes = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  return {
    dataDir: DATA_DIR,
    databasePath: DB_PATH,
    attachmentsDir: ATTACHMENTS_DIR,
    databaseSizeBytes: sizeBytes,
  };
}
