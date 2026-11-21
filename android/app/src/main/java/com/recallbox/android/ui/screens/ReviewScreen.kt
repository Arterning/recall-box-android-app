package com.recallbox.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.recallbox.android.data.RecallBoxDbHelper
import com.recallbox.android.fsrs.FsrsCardState
import com.recallbox.android.fsrs.FsrsScheduler
import java.time.Instant

@Composable
fun ReviewScreen(db: RecallBoxDbHelper, onDataChanged: () -> Unit) {
    var dueCards by remember { mutableStateOf(db.listDueCards()) }
    var currentIndex by remember { mutableIntStateOf(0) }
    var responseText by remember { mutableStateOf("") }
    var showAnswer by remember { mutableStateOf(false) }
    var showContext by remember { mutableStateOf(false) }

    val retention = remember(dueCards) { db.getDesiredRetention() }
    val scheduler = remember(retention) { FsrsScheduler(retention) }
    val card = dueCards.getOrNull(currentIndex)

    fun submitRating(rating: Int) {
        val current = card ?: return
        db.reviewCard(current.id, rating, responseText)
        responseText = ""
        showAnswer = false
        showContext = false
        dueCards = db.listDueCards()
        if (currentIndex >= dueCards.size) currentIndex = maxOf(0, dueCards.size - 1)
        onDataChanged()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("今日复习", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    if (dueCards.isEmpty()) "待复习队列已清空" else "剩余 ${dueCards.size} 张待复习卡片",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (dueCards.isNotEmpty()) {
                Text("${currentIndex + 1} / ${dueCards.size}", style = MaterialTheme.typography.labelLarge)
            }
        }

        if (card == null) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                modifier = Modifier.fillMaxWidth().padding(top = 24.dp)
            ) {
                Column(
                    modifier = Modifier.padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.size(56.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Text("今天的复习完成了", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(6.dp))
                    Text("新卡片和之后到期的卡片会出现在这里。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        card.noteTitle.ifBlank { "独立卡片" },
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.secondary
                    )
                    Text(card.question, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)

                    if (card.excerpt.isNotBlank()) {
                        TextButton(
                            onClick = { showContext = !showContext },
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text(if (showContext) "收起上下文" else "查看上下文")
                        }
                        if (showContext) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(card.excerpt, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }

                    OutlinedTextField(
                        value = responseText,
                        onValueChange = { responseText = it },
                        label = { Text("先尝试回忆并写下你的回答（可选）") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (!showAnswer) {
                        Button(
                            onClick = { showAnswer = true },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("查看参考答案")
                        }
                    } else {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text("参考答案", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                                Spacer(Modifier.height(4.dp))
                                Text(card.answer, style = MaterialTheme.typography.bodyMedium)
                            }
                        }

                        val now = remember(card.id) { Instant.now() }
                        val fsrsState = remember(card.id, card.fsrsState) { FsrsCardState.fromJson(card.fsrsState, now) }

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val options = listOf(
                                Triple(1, "忘了", Color(0xFFF6E7E1)),
                                Triple(2, "困难", Color(0xFFF3EEE0)),
                                Triple(3, "记得", Color(0xFFE9EEE3)),
                                Triple(4, "简单", Color(0xFFE2ECE8))
                            )
                            options.forEach { (rating, label, bg) ->
                                val interval = scheduler.previewIntervalText(fsrsState, now, rating)
                                Surface(
                                    onClick = { submitRating(rating) },
                                    shape = RoundedCornerShape(12.dp),
                                    color = bg,
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Column(
                                        modifier = Modifier.padding(vertical = 10.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text(label, style = MaterialTheme.typography.labelLarge, color = Color(0xFF262920))
                                        Text(interval, style = MaterialTheme.typography.labelSmall, color = Color(0xFF666C5D))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
