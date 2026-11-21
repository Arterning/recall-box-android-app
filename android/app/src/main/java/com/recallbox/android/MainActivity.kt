package com.recallbox.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.recallbox.android.data.RecallBoxDbHelper
import com.recallbox.android.ui.screens.*
import com.recallbox.android.ui.theme.RecallBoxTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val db = RecallBoxDbHelper(applicationContext)
        setContent {
            RecallBoxTheme {
                RecallBoxApp(db)
            }
        }
    }
}

@Composable
fun RecallBoxApp(db: RecallBoxDbHelper) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var dueCount by remember { mutableIntStateOf(db.listDueCards().size) }
    val refreshDue = { dueCount = db.listDueCards().size }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Book, contentDescription = "笔记") },
                    label = { Text("笔记") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = {
                        BadgedBox(badge = { if (dueCount > 0) Badge { Text(dueCount.toString()) } }) {
                            Icon(Icons.Default.Psychology, contentDescription = "复习")
                        }
                    },
                    label = { Text("复习") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Layers, contentDescription = "卡片") },
                    label = { Text("卡片") }
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.CalendarToday, contentDescription = "日记") },
                    label = { Text("日记") }
                )
                NavigationBarItem(
                    selected = selectedTab == 4,
                    onClick = { selectedTab = 4 },
                    icon = { Icon(Icons.Default.BarChart, contentDescription = "统计") },
                    label = { Text("统计") }
                )
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> NotesScreen(db, onDataChanged = refreshDue)
                1 -> ReviewScreen(db, onDataChanged = refreshDue)
                2 -> CardsScreen(db, onDataChanged = refreshDue)
                3 -> DiaryScreen(db, onDataChanged = refreshDue)
                4 -> StatsSettingsScreen(db, onDataChanged = refreshDue)
            }
        }
    }
}
