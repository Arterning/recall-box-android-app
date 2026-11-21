package com.recallbox.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.recallbox.android.data.RecallBoxDbHelper
import java.time.LocalDate
import java.time.YearMonth

@Composable
fun DiaryScreen(db: RecallBoxDbHelper, onDataChanged: () -> Unit) {
    val today = remember { LocalDate.now() }
    var currentMonth by remember { mutableStateOf(YearMonth.from(today)) }
    var selectedDate by remember { mutableStateOf(today) }
    var entryDates by remember { mutableStateOf(db.listDiaryDatesForMonth(currentMonth.toString())) }
    var loadedEntry by remember { mutableStateOf(db.getDiary(selectedDate.toString())) }
    var contentDraft by remember { mutableStateOf(loadedEntry.content) }

    fun selectDay(date: LocalDate) {
        selectedDate = date
        currentMonth = YearMonth.from(date)
        entryDates = db.listDiaryDatesForMonth(currentMonth.toString())
        val e = db.getDiary(date.toString())
        loadedEntry = e
        contentDraft = e.content
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
                Text("日记", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text("每日学习记录 · ${selectedDate}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedButton(onClick = { selectDay(today) }) { Text("回到今天") }
        }

        // Monthly calendar card
        Surface(
            shape = RoundedCornerShape(18.dp),
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
                    IconButton(onClick = {
                        currentMonth = currentMonth.minusMonths(1)
                        entryDates = db.listDiaryDatesForMonth(currentMonth.toString())
                    }) { Icon(Icons.Default.ChevronLeft, contentDescription = "上个月") }
                    Text("${currentMonth.year} 年 ${currentMonth.monthValue} 月", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    IconButton(onClick = {
                        currentMonth = currentMonth.plusMonths(1)
                        entryDates = db.listDiaryDatesForMonth(currentMonth.toString())
                    }) { Icon(Icons.Default.ChevronRight, contentDescription = "下个月") }
                }

                Row(modifier = Modifier.fillMaxWidth()) {
                    listOf("日", "一", "二", "三", "四", "五", "六").forEach { d ->
                        Text(d, modifier = Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Spacer(Modifier.height(6.dp))

                val firstDayOffset = currentMonth.atDay(1).dayOfWeek.value % 7
                val daysInMonth = currentMonth.lengthOfMonth()
                val totalCells = ((firstDayOffset + daysInMonth + 6) / 7) * 7
                for (row in 0 until totalCells / 7) {
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        for (col in 0 until 7) {
                            val cellIdx = row * 7 + col
                            val dayNum = cellIdx - firstDayOffset + 1
                            if (dayNum in 1..daysInMonth) {
                                val cellDate = currentMonth.atDay(dayNum)
                                val iso = cellDate.toString()
                                val isSelected = cellDate == selectedDate
                                val hasEntry = entryDates.contains(iso)
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .padding(vertical = 2.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(
                                            when {
                                                isSelected -> MaterialTheme.colorScheme.primary
                                                cellDate == today -> MaterialTheme.colorScheme.primaryContainer
                                                else -> MaterialTheme.colorScheme.surface
                                            }
                                        )
                                        .clickable { selectDay(cellDate) }
                                        .padding(vertical = 6.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(
                                            dayNum.toString(),
                                            style = MaterialTheme.typography.labelMedium,
                                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                                        )
                                        if (hasEntry) {
                                            Box(
                                                modifier = Modifier
                                                    .size(5.dp)
                                                    .clip(CircleShape)
                                                    .background(if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.secondary)
                                            )
                                        }
                                    }
                                }
                            } else {
                                Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }

        // Daily editor
        OutlinedTextField(
            value = contentDraft,
            onValueChange = { contentDraft = it },
            label = { Text("${selectedDate} 学习日记（支持 Markdown）") },
            minLines = 8,
            modifier = Modifier.fillMaxWidth()
        )

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (loadedEntry.id > 0) {
                OutlinedButton(
                    onClick = {
                        db.deleteDiary(selectedDate.toString())
                        selectDay(selectedDate)
                        onDataChanged()
                    }
                ) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("删除")
                }
            }
            Button(
                onClick = {
                    db.saveDiary(selectedDate.toString(), contentDraft)
                    selectDay(selectedDate)
                    onDataChanged()
                },
                modifier = Modifier.weight(1f)
            ) {
                Text("保存日记")
            }
        }
    }
}
