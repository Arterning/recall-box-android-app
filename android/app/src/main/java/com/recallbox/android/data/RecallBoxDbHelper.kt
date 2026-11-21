package com.recallbox.android.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import com.recallbox.android.fsrs.FsrsCardState
import com.recallbox.android.fsrs.FsrsScheduler
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs

class RecallBoxDbHelper(private val context: Context) :
    SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    companion object {
        const val DB_NAME = "recall-box.db"
        const val DB_VERSION = 1

        fun findAnchor(content: String, excerpt: String, near: Int): Triple<Int, Int, Boolean> {
            if (excerpt.isEmpty() || excerpt.length > content.length) return Triple(0, 0, false)
            var best = -1
            var bestDist = Int.MAX_VALUE
            var idx = content.indexOf(excerpt)
            while (idx != -1) {
                val dist = abs(idx - near)
                if (dist < bestDist) {
                    best = idx
                    bestDist = dist
                }
                idx = content.indexOf(excerpt, idx + 1)
            }
            return if (best < 0) Triple(0, 0, false) else Triple(best, best + excerpt.length, true)
        }

        fun clozeExcerpt(content: String, start: Int, end: Int): String {
            if (start < 0 || end <= start || end > content.length) return "[选中内容]"
            val prevBreak = content.lastIndexOf("\n\n", maxOf(0, start - 1))
            val nextBreak = content.indexOf("\n\n", end)
            val pStart = if (prevBreak < 0) 0 else prevBreak + 2
            val pEnd = if (nextBreak < 0) content.length else nextBreak
            val before = content.substring(pStart, start).trim()
            val after = content.substring(end, pEnd).trim()
            val ctx = "$before […] $after".trim()
            return if (ctx.isEmpty() || ctx == "[…]") "[选中内容]" else ctx
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        ensureSchema(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        ensureSchema(db)
    }

    fun ensureSchema(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                format TEXT NOT NULL DEFAULT 'markdown',
                tags TEXT NOT NULL DEFAULT '',
                created_at DATETIME,
                updated_at DATETIME,
                deleted_at DATETIME
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at)")

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS diary_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_date DATE NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                created_at DATETIME,
                updated_at DATETIME
            )
        """.trimIndent())
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_entries_entry_date ON diary_entries(entry_date)")

        db.execSQL("""
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
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_cards_note_id ON cards(note_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_cards_due_at ON cards(due_at)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_cards_deleted_at ON cards(deleted_at)")

        db.execSQL("""
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
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_annotations_note_id ON annotations(note_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_annotations_card_id ON annotations(card_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_annotations_deleted_at ON annotations(deleted_at)")

        db.execSQL("""
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
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_review_logs_card_id ON review_logs(card_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON review_logs(reviewed_at)")

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME
            )
        """.trimIndent())
        db.execSQL(
            "INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('desiredRetention', '0.9', ?)",
            arrayOf(Instant.now().toString())
        )
    }

    // --- Notes ---
    fun listNotes(query: String = ""): List<Note> {
        val db = readableDatabase
        val list = mutableListOf<Note>()
        val sql = if (query.isBlank()) {
            "SELECT id, title, content, format, tags, created_at, updated_at FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC"
        } else {
            "SELECT id, title, content, format, tags, created_at, updated_at FROM notes WHERE deleted_at IS NULL AND (title LIKE ? OR content LIKE ? OR tags LIKE ?) ORDER BY updated_at DESC, id DESC"
        }
        val args = if (query.isBlank()) null else arrayOf("%$query%", "%$query%", "%$query%")
        db.rawQuery(sql, args).use { c ->
            while (c.moveToNext()) {
                list.add(
                    Note(
                        id = c.getLong(0),
                        title = c.getString(1) ?: "",
                        content = c.getString(2) ?: "",
                        format = c.getString(3) ?: "markdown",
                        tags = c.getString(4) ?: "",
                        createdAt = c.getString(5) ?: "",
                        updatedAt = c.getString(6) ?: ""
                    )
                )
            }
        }
        return list
    }

    fun saveNote(note: Note): Long {
        val db = writableDatabase
        val now = Instant.now().toString()
        val cv = ContentValues().apply {
            put("title", note.title.ifBlank { "未命名笔记" })
            put("content", note.content)
            put("format", "markdown")
            put("tags", note.tags)
            put("updated_at", now)
        }
        return if (note.id == 0L) {
            cv.put("created_at", now)
            db.insert("notes", null, cv)
        } else {
            db.beginTransaction()
            try {
                reanchorNoteChildren(db, note.id, note.content, now)
                db.update("notes", cv, "id = ?", arrayOf(note.id.toString()))
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
            note.id
        }
    }

    private fun reanchorNoteChildren(db: SQLiteDatabase, noteId: Long, newContent: String, now: String) {
        db.rawQuery(
            "SELECT id, source_text, excerpt, start_offset FROM cards WHERE note_id = ? AND deleted_at IS NULL",
            arrayOf(noteId.toString())
        ).use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val anchor = (c.getString(1) ?: "").ifEmpty { c.getString(2) ?: "" }
                val near = c.getInt(3)
                val (s, e, found) = findAnchor(newContent, anchor, near)
                val u = ContentValues().apply {
                    put("start_offset", s)
                    put("end_offset", e)
                    put("anchor_valid", if (found) 1 else 0)
                    put("updated_at", now)
                }
                db.update("cards", u, "id = ?", arrayOf(id.toString()))
            }
        }
        db.rawQuery(
            "SELECT id, source_text, excerpt, start_offset FROM annotations WHERE note_id = ? AND deleted_at IS NULL",
            arrayOf(noteId.toString())
        ).use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val anchor = (c.getString(1) ?: "").ifEmpty { c.getString(2) ?: "" }
                val near = c.getInt(3)
                val (s, e, found) = findAnchor(newContent, anchor, near)
                val u = ContentValues().apply {
                    put("start_offset", s)
                    put("end_offset", e)
                    put("anchor_valid", if (found) 1 else 0)
                    put("updated_at", now)
                }
                db.update("annotations", u, "id = ?", arrayOf(id.toString()))
            }
        }
    }

    fun deleteNote(noteId: Long) {
        val db = writableDatabase
        val now = Instant.now().toString()
        db.beginTransaction()
        try {
            db.execSQL(
                "UPDATE annotations SET deleted_at = ? WHERE card_id IN (SELECT id FROM cards WHERE note_id = ?) AND deleted_at IS NULL",
                arrayOf(now, noteId.toString())
            )
            db.execSQL("UPDATE cards SET deleted_at = ? WHERE note_id = ? AND deleted_at IS NULL", arrayOf(now, noteId.toString()))
            db.execSQL("UPDATE annotations SET deleted_at = ? WHERE note_id = ? AND deleted_at IS NULL", arrayOf(now, noteId.toString()))
            db.execSQL("UPDATE notes SET deleted_at = ? WHERE id = ?", arrayOf(now, noteId.toString()))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    // --- Annotations ---
    fun listNoteAnnotations(noteId: Long): List<Annotation> {
        val list = mutableListOf<Annotation>()
        readableDatabase.rawQuery(
            "SELECT id, note_id, card_id, field, excerpt, source_text, start_offset, end_offset, comment, anchor_valid, created_at FROM annotations WHERE note_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
            arrayOf(noteId.toString())
        ).use { c ->
            while (c.moveToNext()) {
                list.add(
                    Annotation(
                        id = c.getLong(0),
                        noteId = if (c.isNull(1)) null else c.getLong(1),
                        cardId = if (c.isNull(2)) null else c.getLong(2),
                        field = c.getString(3) ?: "",
                        excerpt = c.getString(4) ?: "",
                        sourceText = c.getString(5) ?: "",
                        startOffset = c.getInt(6),
                        endOffset = c.getInt(7),
                        comment = c.getString(8) ?: "",
                        anchorValid = c.getInt(9) != 0,
                        createdAt = c.getString(10) ?: ""
                    )
                )
            }
        }
        return list
    }

    fun createNoteAnnotation(noteId: Long, excerpt: String, startOffset: Int, endOffset: Int, comment: String): Long {
        val now = Instant.now().toString()
        val cv = ContentValues().apply {
            put("note_id", noteId)
            put("field", "")
            put("excerpt", excerpt)
            put("source_text", excerpt)
            put("start_offset", startOffset)
            put("end_offset", endOffset)
            put("comment", comment.trim())
            put("anchor_valid", 1)
            put("created_at", now)
            put("updated_at", now)
        }
        return writableDatabase.insert("annotations", null, cv)
    }

    fun updateAnnotationComment(annotationId: Long, comment: String) {
        val cv = ContentValues().apply {
            put("comment", comment.trim())
            put("updated_at", Instant.now().toString())
        }
        writableDatabase.update("annotations", cv, "id = ?", arrayOf(annotationId.toString()))
    }

    fun deleteAnnotation(annotationId: Long) {
        val cv = ContentValues().apply { put("deleted_at", Instant.now().toString()) }
        writableDatabase.update("annotations", cv, "id = ?", arrayOf(annotationId.toString()))
    }

    // --- Cards & FSRS ---
    fun listCards(query: String = "", sortByDue: Boolean = true): List<Card> {
        val list = mutableListOf<Card>()
        val order = if (sortByDue) "c.due_at ASC, c.id ASC" else "c.created_at DESC, c.id DESC"
        val sql = """
            SELECT c.id, c.note_id, c.excerpt, c.context_override, c.source_text, c.start_offset, c.end_offset,
                   c.anchor_valid, c.question, c.prompt, c.answer, c.due_at, c.fsrs_state, c.created_at,
                   n.title, n.content
            FROM cards c
            LEFT JOIN notes n ON n.id = c.note_id AND n.deleted_at IS NULL
            WHERE c.deleted_at IS NULL
            ${if (query.isBlank()) "" else "AND (c.question LIKE ? OR c.answer LIKE ? OR c.excerpt LIKE ? OR n.title LIKE ?)"}
            ORDER BY $order
        """.trimIndent()
        val args = if (query.isBlank()) null else arrayOf("%$query%", "%$query%", "%$query%", "%$query%")
        readableDatabase.rawQuery(sql, args).use { c ->
            while (c.moveToNext()) {
                val noteId = if (c.isNull(1)) null else c.getLong(1)
                val noteContent = c.getString(15)
                val startOffset = c.getInt(5)
                val endOffset = c.getInt(6)
                val contextOverride = c.getString(3) ?: ""
                val rawExcerpt = c.getString(2) ?: ""
                val resolvedContext = when {
                    noteId == null -> rawExcerpt
                    contextOverride.isNotEmpty() -> contextOverride
                    !noteContent.isNullOrEmpty() -> clozeExcerpt(noteContent, startOffset, endOffset)
                    else -> rawExcerpt
                }
                val q = (c.getString(8) ?: "").ifEmpty { c.getString(9) ?: "" }
                list.add(
                    Card(
                        id = c.getLong(0),
                        noteId = noteId,
                        excerpt = resolvedContext,
                        contextOverride = contextOverride,
                        sourceText = c.getString(4) ?: "",
                        startOffset = startOffset,
                        endOffset = endOffset,
                        anchorValid = c.getInt(7) != 0,
                        question = q,
                        answer = c.getString(10) ?: "",
                        dueAt = c.getString(11),
                        fsrsState = c.getString(12) ?: "",
                        createdAt = c.getString(13) ?: "",
                        noteTitle = if (noteId == null) "独立卡片" else (c.getString(14) ?: "")
                    )
                )
            }
        }
        return list
    }

    fun listDueCards(): List<Card> {
        val now = Instant.now()
        return listCards(sortByDue = true).filter { card ->
            val due = card.dueAt
            if (due.isNullOrBlank()) true
            else runCatching { Instant.parse(due) }.getOrNull()?.let { !it.isAfter(now) } ?: true
        }
    }

    fun createCardFromNote(noteId: Long, noteContent: String, start: Int, end: Int, question: String, answer: String): Long {
        val now = Instant.now()
        val nowIso = now.toString()
        val selected = noteContent.substring(start, end)
        val cloze = clozeExcerpt(noteContent, start, end)
        val cv = ContentValues().apply {
            put("note_id", noteId)
            put("excerpt", cloze)
            put("context_override", "")
            put("source_text", selected)
            put("start_offset", start)
            put("end_offset", end)
            put("anchor_valid", 1)
            put("question", question.trim())
            put("prompt", "")
            put("answer", answer.trim().ifEmpty { selected })
            put("due_at", nowIso)
            put("fsrs_state", FsrsCardState(due = now).toGoFsrsJson())
            put("created_at", nowIso)
            put("updated_at", nowIso)
        }
        return writableDatabase.insert("cards", null, cv)
    }

    fun createStandaloneCard(question: String, answer: String, context: String): Long {
        val now = Instant.now()
        val nowIso = now.toString()
        val cv = ContentValues().apply {
            putNull("note_id")
            put("excerpt", context.trim())
            put("context_override", "")
            put("source_text", "")
            put("start_offset", 0)
            put("end_offset", 0)
            put("anchor_valid", 0)
            put("question", question.trim())
            put("prompt", "")
            put("answer", answer.trim())
            put("due_at", nowIso)
            put("fsrs_state", FsrsCardState(due = now).toGoFsrsJson())
            put("created_at", nowIso)
            put("updated_at", nowIso)
        }
        return writableDatabase.insert("cards", null, cv)
    }

    fun deleteCard(cardId: Long) {
        val now = Instant.now().toString()
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.execSQL("UPDATE annotations SET deleted_at = ? WHERE card_id = ? AND deleted_at IS NULL", arrayOf(now, cardId.toString()))
            db.execSQL("UPDATE cards SET deleted_at = ? WHERE id = ?", arrayOf(now, cardId.toString()))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun reviewCard(cardId: Long, rating: Int, response: String) {
        val db = writableDatabase
        val now = Instant.now()
        val nowIso = now.toString()
        val retention = getDesiredRetention()
        val scheduler = FsrsScheduler(retention)

        var fsrsStateRaw = ""
        var dueBefore: String? = null
        db.rawQuery("SELECT fsrs_state, due_at FROM cards WHERE id = ?", arrayOf(cardId.toString())).use { c ->
            if (c.moveToFirst()) {
                fsrsStateRaw = c.getString(0) ?: ""
                dueBefore = c.getString(1)
            }
        }
        val currentFsrs = FsrsCardState.fromJson(fsrsStateRaw, now)
        val outcome = scheduler.schedule(currentFsrs, now, rating)
        val dueAfter = outcome.nextState.due.toString()

        db.beginTransaction()
        try {
            val cardCv = ContentValues().apply {
                put("fsrs_state", outcome.nextState.toGoFsrsJson())
                put("due_at", dueAfter)
                put("updated_at", nowIso)
            }
            db.update("cards", cardCv, "id = ?", arrayOf(cardId.toString()))

            val logCv = ContentValues().apply {
                put("card_id", cardId)
                put("rating", rating)
                put("response", response)
                put("reviewed_at", nowIso)
                put("due_before", dueBefore)
                put("due_after", dueAfter)
                put("fsrs_log", outcome.logJson)
                put("created_at", nowIso)
            }
            db.insert("review_logs", null, logCv)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    // --- Diaries ---
    fun listDiaryDatesForMonth(yearMonth: String): Set<String> {
        val dates = mutableSetOf<String>()
        readableDatabase.rawQuery(
            "SELECT substr(entry_date, 1, 10) FROM diary_entries WHERE entry_date LIKE ?",
            arrayOf("$yearMonth%")
        ).use { c ->
            while (c.moveToNext()) dates.add(c.getString(0))
        }
        return dates
    }

    fun getDiary(date: String): DiaryEntry {
        readableDatabase.rawQuery(
            "SELECT id, substr(entry_date, 1, 10), content, created_at, updated_at FROM diary_entries WHERE substr(entry_date, 1, 10) = ?",
            arrayOf(date)
        ).use { c ->
            if (c.moveToFirst()) {
                return DiaryEntry(
                    id = c.getLong(0),
                    date = c.getString(1),
                    content = c.getString(2) ?: "",
                    createdAt = c.getString(3) ?: "",
                    updatedAt = c.getString(4) ?: ""
                )
            }
        }
        return DiaryEntry(date = date)
    }

    fun saveDiary(date: String, content: String) {
        val now = Instant.now().toString()
        val db = writableDatabase
        val existing = getDiary(date)
        val cv = ContentValues().apply {
            put("entry_date", date)
            put("content", content)
            put("updated_at", now)
        }
        if (existing.id == 0L) {
            cv.put("created_at", now)
            db.insert("diary_entries", null, cv)
        } else {
            db.update("diary_entries", cv, "id = ?", arrayOf(existing.id.toString()))
        }
    }

    fun deleteDiary(date: String) {
        writableDatabase.delete("diary_entries", "substr(entry_date, 1, 10) = ?", arrayOf(date))
    }

    // --- Statistics & Settings ---
    fun getDesiredRetention(): Double {
        readableDatabase.rawQuery("SELECT value FROM app_settings WHERE key = 'desiredRetention'", null).use { c ->
            if (c.moveToFirst()) {
                return c.getString(0).toDoubleOrNull()?.coerceIn(0.70, 0.97) ?: 0.90
            }
        }
        return 0.90
    }

    fun setDesiredRetention(value: Double) {
        val clamped = value.coerceIn(0.70, 0.97)
        val cv = ContentValues().apply {
            put("key", "desiredRetention")
            put("value", String.format("%.2f", clamped))
            put("updated_at", Instant.now().toString())
        }
        writableDatabase.insertWithOnConflict("app_settings", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getReviewStats(): ReviewStats {
        val notes = listNotes().size
        val cards = listCards()
        val due = listDueCards().size
        val today = LocalDate.now().toString()
        val ratingCounts = mutableMapOf(1 to 0, 2 to 0, 3 to 0, 4 to 0)
        var total = 0
        var sum = 0
        var reviewedToday = 0
        val zone = ZoneId.systemDefault()
        val dayCounts = mutableMapOf<String, Pair<Int, Int>>()

        readableDatabase.rawQuery("SELECT rating, reviewed_at FROM review_logs", null).use { c ->
            while (c.moveToNext()) {
                val r = c.getInt(0)
                val ts = c.getString(1) ?: ""
                total++
                sum += r
                ratingCounts[r] = (ratingCounts[r] ?: 0) + 1
                val localDate = runCatching { Instant.parse(ts).atZone(zone).toLocalDate().toString() }.getOrDefault(ts.take(10))
                if (localDate == today) reviewedToday++
                val prev = dayCounts[localDate] ?: (0 to 0)
                dayCounts[localDate] = (prev.first + 1) to (prev.second + if (r >= 3) 1 else 0)
            }
        }

        val last30 = (29 downTo 0).map { offset ->
            val d = LocalDate.now().minusDays(offset.toLong()).toString()
            val pair = dayCounts[d] ?: (0 to 0)
            DayReviewSummary(d, pair.first, pair.second)
        }

        return ReviewStats(
            notes = notes,
            cards = cards.size,
            due = due,
            reviewedToday = reviewedToday,
            totalReviews = total,
            averageRating = if (total > 0) sum.toDouble() / total else 0.0,
            ratingCounts = ratingCounts,
            last30Days = last30
        )
    }

    // --- SQLite .db Import / Export (100% compatible with Arterning/recall-box) ---
    fun exportDatabaseToUri(uri: Uri) {
        writableDatabase.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).close()
        close()
        val dbFile = context.getDatabasePath(DB_NAME)
        context.contentResolver.openOutputStream(uri)?.use { out ->
            FileInputStream(dbFile).use { input -> input.copyTo(out) }
        }
    }

    fun importDatabaseFromUri(uri: Uri): Boolean {
        val tempFile = File(context.cacheDir, "import-recall-box.db")
        context.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(tempFile).use { out -> input.copyTo(out) }
        } ?: return false

        val header = ByteArray(16)
        FileInputStream(tempFile).use { it.read(header) }
        if (String(header, Charsets.UTF_8) != "SQLite format 3\u0000") {
            tempFile.delete()
            return false
        }

        close()
        val dbFile = context.getDatabasePath(DB_NAME)
        dbFile.parentFile?.mkdirs()
        File(dbFile.absolutePath + "-wal").delete()
        File(dbFile.absolutePath + "-shm").delete()
        tempFile.copyTo(dbFile, overwrite = true)
        tempFile.delete()

        ensureSchema(writableDatabase)
        return true
    }
}
