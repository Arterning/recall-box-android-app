package com.recallbox.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.recallbox.android.data.RecallBoxDbHelper

@Composable
fun CardsScreen(db: RecallBoxDbHelper, onDataChanged: () -> Unit) {
    var query by remember { mutableStateOf("") }
    var sortByDue by remember { mutableStateOf(true) }
    var cards by remember { mutableStateOf(db.listCards(query, sortByDue)) }
    var showCreate by remember { mutableStateOf(false) }
    var question by remember { mutableStateOf("") }
    var context by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf("") }

    fun refresh() {
        cards = db.listCards(query, sortByDue)
        onDataChanged()
    }

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("卡片库", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text("共 ${cards.size} 张复习卡", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            FilledTonalButton(onClick = { showCreate = true }) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("新建卡片")
            }
        }

        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = query,
            onValueChange = {
                query = it
                cards = db.listCards(it, sortByDue)
            },
            placeholder = { Text("搜索问题、答案或笔记标题…") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = sortByDue, onClick = { sortByDue = true; refresh() }, label = { Text("按到期时间") })
            FilterChip(selected = !sortByDue, onClick = { sortByDue = false; refresh() }, label = { Text("按创建时间") })
        }
        Spacer(Modifier.height(8.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(cards, key = { it.id }) { card ->
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                card.noteTitle.ifBlank { "独立卡片" },
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.secondary
                            )
                            IconButton(
                                onClick = { db.deleteCard(card.id); refresh() },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(Icons.Default.DeleteOutline, contentDescription = "删除卡片", modifier = Modifier.size(18.dp))
                            }
                        }
                        Text(card.question, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(6.dp))
                        Text("答：${card.answer}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }

    if (showCreate) {
        AlertDialog(
            onDismissRequest = { showCreate = false },
            title = { Text("新建独立记忆卡片") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = question, onValueChange = { question = it }, label = { Text("复习问题") }, minLines = 2)
                    OutlinedTextField(value = context, onValueChange = { context = it }, label = { Text("上下文（可选）") }, minLines = 2)
                    OutlinedTextField(value = answer, onValueChange = { answer = it }, label = { Text("参考答案") }, minLines = 3)
                }
            },
            confirmButton = {
                Button(
                    enabled = question.isNotBlank() && answer.isNotBlank(),
                    onClick = {
                        db.createStandaloneCard(question, answer, context)
                        question = ""; context = ""; answer = ""
                        showCreate = false
                        refresh()
                    }
                ) { Text("创建") }
            },
            dismissButton = {
                TextButton(onClick = { showCreate = false }) { Text("取消") }
            }
        )
    }
}
