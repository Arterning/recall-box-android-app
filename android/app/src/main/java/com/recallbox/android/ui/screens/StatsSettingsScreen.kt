package com.recallbox.android.ui.screens

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.recallbox.android.data.RecallBoxDbHelper
import kotlin.math.roundToInt

@Composable
fun StatsSettingsScreen(db: RecallBoxDbHelper, onDataChanged: () -> Unit) {
    val ctx = LocalContext.current
    var stats by remember { mutableStateOf(db.getReviewStats()) }
    var retentionPercent by remember { mutableFloatStateOf((db.getDesiredRetention() * 100).roundToInt().toFloat()) }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream")
    ) { uri ->
        if (uri != null) {
            runCatching { db.exportDatabaseToUri(uri) }
                .onSuccess { Toast.makeText(ctx, "已导出兼容的 recall-box.db", Toast.LENGTH_SHORT).show() }
                .onFailure { Toast.makeText(ctx, "导出失败: ${it.message}", Toast.LENGTH_LONG).show() }
        }
    }

    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            val ok = runCatching { db.importDatabaseFromUri(uri) }.getOrDefault(false)
            if (ok) {
                stats = db.getReviewStats()
                retentionPercent = (db.getDesiredRetention() * 100).roundToInt().toFloat()
                onDataChanged()
                Toast.makeText(ctx, "导入成功，数据已切换为导入的 recall-box.db", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(ctx, "导入失败：不是有效的 Recall Box SQLite 文件", Toast.LENGTH_LONG).show()
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("统计与同步", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatCard("今日复习", stats.reviewedToday.toString(), "待复习 ${stats.due} 张", Modifier.weight(1f))
            StatCard("累计复习", stats.totalReviews.toString(), "${stats.cards} 张卡 · ${stats.notes} 篇笔记", Modifier.weight(1f))
        }

        // 30-day bar chart
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("近 30 天每日复习量", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(12.dp))
                val maxDay = maxOf(1, stats.last30Days.maxOfOrNull { it.count } ?: 1)
                Row(
                    modifier = Modifier.fillMaxWidth().height(90.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    stats.last30Days.forEach { day ->
                        val ratio = day.count.toFloat() / maxDay.toFloat()
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight(maxOf(0.05f, ratio))
                                .background(
                                    if (day.count > 0) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.outline,
                                    RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp)
                                )
                        )
                    }
                }
            }
        }

        // FSRS Desired Retention setting
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("FSRS 目标记忆保留率", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text("${retentionPercent.roundToInt()}%", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Slider(
                    value = retentionPercent,
                    onValueChange = { retentionPercent = it },
                    valueRange = 70f..97f,
                    steps = 26,
                    onValueChangeFinished = {
                        db.setDesiredRetention(retentionPercent.toDouble() / 100.0)
                    }
                )
                Text("默认 90%，调高会缩短间隔以减少遗忘，调低会减少每日复习量。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // SQLite Compatibility Import / Export
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("SQLite 数据文件互通", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    "Android 端直接使用与桌面版 Arterning/recall-box 完全一致的 recall-box.db 表结构（notes、cards、annotations、diary_entries、review_logs、app_settings）。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = { importLauncher.launch(arrayOf("*/*")) },
                        modifier = Modifier.weight(1f)
                    ) { Text("导入 .db") }
                    Button(
                        onClick = { exportLauncher.launch("recall-box.db") },
                        modifier = Modifier.weight(1f)
                    ) { Text("导出 .db") }
                }
            }
        }
    }
}

@Composable
private fun StatCard(title: String, value: String, subtitle: String, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(2.dp))
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
