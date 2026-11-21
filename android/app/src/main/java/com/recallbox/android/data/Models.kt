package com.recallbox.android.data

data class Note(
    val id: Long = 0,
    val title: String = "",
    val content: String = "",
    val format: String = "markdown",
    val tags: String = "",
    val createdAt: String = "",
    val updatedAt: String = ""
)

data class Card(
    val id: Long = 0,
    val noteId: Long? = null,
    val excerpt: String = "",
    val contextOverride: String = "",
    val sourceText: String = "",
    val startOffset: Int = 0,
    val endOffset: Int = 0,
    val anchorValid: Boolean = true,
    val question: String = "",
    val answer: String = "",
    val dueAt: String? = null,
    val fsrsState: String = "",
    val createdAt: String = "",
    val noteTitle: String = ""
)

data class Annotation(
    val id: Long = 0,
    val noteId: Long? = null,
    val cardId: Long? = null,
    val field: String = "",
    val excerpt: String = "",
    val sourceText: String = "",
    val startOffset: Int = 0,
    val endOffset: Int = 0,
    val comment: String = "",
    val anchorValid: Boolean = true,
    val createdAt: String = ""
)

data class DiaryEntry(
    val id: Long = 0,
    val date: String = "",
    val content: String = "",
    val createdAt: String = "",
    val updatedAt: String = ""
)

data class ReviewLogItem(
    val id: Long = 0,
    val cardId: Long = 0,
    val rating: Int = 3,
    val response: String = "",
    val reviewedAt: String = "",
    val question: String = "",
    val excerpt: String = "",
    val noteTitle: String = ""
)

data class ReviewStats(
    val notes: Int = 0,
    val cards: Int = 0,
    val due: Int = 0,
    val reviewedToday: Int = 0,
    val totalReviews: Int = 0,
    val averageRating: Double = 0.0,
    val ratingCounts: Map<Int, Int> = emptyMap(),
    val last30Days: List<DayReviewSummary> = emptyList()
)

data class DayReviewSummary(
    val date: String,
    val count: Int,
    val good: Int
)
