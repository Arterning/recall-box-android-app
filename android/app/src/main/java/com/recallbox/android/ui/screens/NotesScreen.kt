package com.recallbox.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.recallbox.android.data.Annotation
import com.recallbox.android.data.Note
import com.recallbox.android.data.RecallBoxDbHelper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(db: RecallBoxDbHelper, onDataChanged: () -> Unit) {
    var query by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf(db.listNotes(query)) }
    var activeNote by remember { mutableStateOf<Note?>(null) }
    var isEditing by remember { mutableStateOf(false) }
    var hideHighlights by remember { mutableStateOf(false) }
    var titleDraft by remember { mutableStateOf("") }
    var tagsDraft by remember { mutableStateOf("") }
    var contentDraft by remember { mutableStateOf(TextFieldValue("")) }
    var annotations by remember { mutableStateOf<List<Annotation>>(emptyList()) }
    var showClozeDialog by remember { mutableStateOf(false) }
    var showAnnotationDialog by remember { mutableStateOf(false) }
    var selectionRange by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var commentDraft by remember { mutableStateOf("") }
    var clozeQuestion by remember { mutableStateOf("") }
    var clozeAnswer by remember { mutableStateOf("") }

    fun reloadNotes() {
        notes = db.listNotes(query)
        onDataChanged()
    }

    fun openNote(note: Note, editMode: Boolean = false) {
        activeNote = note
        titleDraft = note.title
        tagsDraft = note.tags
        contentDraft = TextFieldValue(note.content)
        annotations = if (note.id > 0) db.listNoteAnnotations(note.id) else emptyList()
        isEditing = editMode
    }

    val currentNote = activeNote
    if (currentNote == null) {
        Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("笔记", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    Text("${notes.size} 篇本地 Markdown 笔记", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                FilledTonalButton(onClick = { openNote(Note(), editMode = true) }) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("新建")
                }
            }

            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = query,
                onValueChange = {
                    query = it
                    notes = db.listNotes(it)
                },
                placeholder = { Text("搜索标题、正文或标签…") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))

            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(notes, key = { it.id }) { note ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surface,
                        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                        modifier = Modifier.fillMaxWidth().clickable { openNote(note) }
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                note.title.ifBlank { "未命名笔记" },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                note.content.replace("\n", " "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (note.tags.isNotBlank()) {
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    note.tags.split(",").joinToString(" · ") { it.trim() },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.secondary
                                )
                            }
                        }
                    }
                }
            }
        }
    } else {
        Column(modifier = Modifier.fillMaxSize()) {
            TopAppBar(
                title = {
                    Text(
                        titleDraft.ifBlank { "未命名笔记" },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.titleMedium
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { activeNote = null }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    IconButton(onClick = { hideHighlights = !hideHighlights }) {
                        Icon(
                            if (hideHighlights) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = "显示/隐藏高亮"
                        )
                    }
                    IconButton(onClick = { isEditing = !isEditing }) {
                        Icon(
                            if (isEditing) Icons.Default.MenuBook else Icons.Default.Edit,
                            contentDescription = "切换编辑/阅读"
                        )
                    }
                    if (currentNote.id > 0) {
                        IconButton(onClick = {
                            db.deleteNote(currentNote.id)
                            activeNote = null
                            reloadNotes()
                        }) {
                            Icon(Icons.Default.DeleteOutline, contentDescription = "删除笔记")
                        }
                    }
                    TextButton(onClick = {
                        val savedId = db.saveNote(
                            currentNote.copy(
                                title = titleDraft,
                                tags = tagsDraft,
                                content = contentDraft.text
                            )
                        )
                        val refreshed = db.listNotes("").firstOrNull { it.id == savedId }
                        if (refreshed != null) openNote(refreshed, editMode = false)
                        reloadNotes()
                    }) {
                        Text("保存")
                    }
                }
            )

            // Selection quick actions when text is highlighted in editor
            val sel = contentDraft.selection
            if (sel.length > 0) {
                val start = minOf(sel.start, sel.end)
                val end = maxOf(sel.start, sel.end)
                val selectedText = contentDraft.text.substring(start, end)
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("已选中 ${selectedText.length} 字", style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                        TextButton(onClick = {
                            if (currentNote.id == 0L) {
                                val id = db.saveNote(currentNote.copy(title = titleDraft, tags = tagsDraft, content = contentDraft.text))
                                activeNote = currentNote.copy(id = id)
                            }
                            val nid = activeNote?.id ?: 0L
                            if (nid > 0) {
                                db.createNoteAnnotation(nid, selectedText, start, end, "")
                                annotations = db.listNoteAnnotations(nid)
                                contentDraft = contentDraft.copy(selection = TextRange(end))
                            }
                        }) { Text("划线") }
                        TextButton(onClick = {
                            selectionRange = start to end
                            commentDraft = ""
                            showAnnotationDialog = true
                        }) { Text("批注") }
                        Button(onClick = {
                            selectionRange = start to end
                            clozeQuestion = RecallBoxDbHelper.clozeExcerpt(contentDraft.text, start, end)
                            clozeAnswer = selectedText
                            showClozeDialog = true
                        }) { Text("制卡") }
                    }
                }
            }

            if (isEditing) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = titleDraft,
                        onValueChange = { titleDraft = it },
                        label = { Text("标题") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = tagsDraft,
                        onValueChange = { tagsDraft = it },
                        label = { Text("标签（逗号分隔）") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = contentDraft,
                        onValueChange = { contentDraft = it },
                        label = { Text("Markdown 正文（选中文本可划线、批注或制卡）") },
                        minLines = 14,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            } else {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    val annotatedText = remember(contentDraft.text, annotations, hideHighlights) {
                        buildHighlightedContent(contentDraft.text, annotations, hideHighlights)
                    }
                    Text(annotatedText, style = MaterialTheme.typography.bodyLarge)
                    if (annotations.isNotEmpty()) {
                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                        Text("批注与划线 (${annotations.size})", style = MaterialTheme.typography.titleSmall)
                        annotations.forEach { ann ->
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(ann.excerpt, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                        if (ann.comment.isNotBlank()) {
                                            Spacer(Modifier.height(4.dp))
                                            Text(ann.comment, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                    IconButton(onClick = {
                                        db.deleteAnnotation(ann.id)
                                        annotations = db.listNoteAnnotations(currentNote.id)
                                    }) {
                                        Icon(Icons.Default.Close, contentDescription = "删除批注", modifier = Modifier.size(16.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (showAnnotationDialog && selectionRange != null) {
            val (s, e) = selectionRange!!
            val excerpt = contentDraft.text.substring(s, e)
            AlertDialog(
                onDismissRequest = { showAnnotationDialog = false },
                title = { Text("添加批注") },
                text = {
                    OutlinedTextField(
                        value = commentDraft,
                        onValueChange = { commentDraft = it },
                        label = { Text("批注内容") },
                        minLines = 3
                    )
                },
                confirmButton = {
                    Button(onClick = {
                        val nid = if (currentNote.id == 0L) {
                            db.saveNote(currentNote.copy(title = titleDraft, tags = tagsDraft, content = contentDraft.text))
                        } else currentNote.id
                        db.createNoteAnnotation(nid, excerpt, s, e, commentDraft)
                        annotations = db.listNoteAnnotations(nid)
                        activeNote = currentNote.copy(id = nid)
                        showAnnotationDialog = false
                        reloadNotes()
                    }) { Text("保存") }
                },
                dismissButton = {
                    TextButton(onClick = { showAnnotationDialog = false }) { Text("取消") }
                }
            )
        }

        if (showClozeDialog && selectionRange != null) {
            val (s, e) = selectionRange!!
            AlertDialog(
                onDismissRequest = { showClozeDialog = false },
                title = { Text("创建挖空复习卡") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = clozeQuestion,
                            onValueChange = { clozeQuestion = it },
                            label = { Text("复习问题（挖空上下文）") },
                            minLines = 3
                        )
                        OutlinedTextField(
                            value = clozeAnswer,
                            onValueChange = { clozeAnswer = it },
                            label = { Text("参考答案") },
                            minLines = 2
                        )
                    }
                },
                confirmButton = {
                    Button(onClick = {
                        val nid = if (currentNote.id == 0L) {
                            db.saveNote(currentNote.copy(title = titleDraft, tags = tagsDraft, content = contentDraft.text))
                        } else currentNote.id
                        db.createCardFromNote(nid, contentDraft.text, s, e, clozeQuestion, clozeAnswer)
                        activeNote = currentNote.copy(id = nid)
                        showClozeDialog = false
                        reloadNotes()
                    }) { Text("创建") }
                },
                dismissButton = {
                    TextButton(onClick = { showClozeDialog = false }) { Text("取消") }
                }
            )
        }
    }
}

private fun buildHighlightedContent(content: String, annotations: List<Annotation>, hideHighlights: Boolean): AnnotatedString {
    return buildAnnotatedString {
        append(content)
        annotations.filter { it.anchorValid && it.startOffset >= 0 && it.endOffset <= content.length && it.endOffset > it.startOffset }
            .forEach { ann ->
                addStyle(
                    style = SpanStyle(
                        background = if (hideHighlights) Color(0xFFDCE4D5) else Color(0xFFF8F0CF),
                        color = if (hideHighlights) Color.Transparent else Color.Unspecified,
                        textDecoration = if (hideHighlights) TextDecoration.None else TextDecoration.Underline
                    ),
                    start = ann.startOffset,
                    end = ann.endOffset
                )
            }
    }
}
