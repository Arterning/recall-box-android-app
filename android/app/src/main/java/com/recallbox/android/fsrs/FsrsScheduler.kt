package com.recallbox.android.fsrs

import org.json.JSONObject
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToLong

data class FsrsCardState(
    val due: Instant = Instant.now(),
    val stability: Double = 0.0,
    val difficulty: Double = 0.0,
    val elapsedDays: Long = 0,
    val scheduledDays: Long = 0,
    val reps: Int = 0,
    val lapses: Int = 0,
    val state: Int = 0, // 0=New, 1=Learning, 2=Review, 3=Relearning
    val lastReview: Instant? = null
) {
    fun toGoFsrsJson(): String {
        val obj = JSONObject()
        obj.put("Due", due.toString())
        obj.put("Stability", stability)
        obj.put("Difficulty", difficulty)
        obj.put("ElapsedDays", elapsedDays)
        obj.put("ScheduledDays", scheduledDays)
        obj.put("Reps", reps)
        obj.put("Lapses", lapses)
        obj.put("State", state)
        obj.put("LastReview", lastReview?.toString() ?: "0001-01-01T00:00:00Z")
        return obj.toString()
    }

    companion object {
        fun fromJson(raw: String?, fallbackDue: Instant = Instant.now()): FsrsCardState {
            if (raw.isNullOrBlank()) return FsrsCardState(due = fallbackDue)
            return try {
                val obj = JSONObject(raw)
                val dueStr = obj.optString("Due", obj.optString("due", ""))
                val lastStr = obj.optString("LastReview", obj.optString("last_review", ""))
                val due = if (dueStr.isNotBlank()) runCatching { Instant.parse(dueStr) }.getOrDefault(fallbackDue) else fallbackDue
                val last = if (lastStr.isNotBlank() && !lastStr.startsWith("0001-")) {
                    runCatching { Instant.parse(lastStr) }.getOrNull()
                } else null
                FsrsCardState(
                    due = due,
                    stability = obj.optDouble("Stability", obj.optDouble("stability", 0.0)),
                    difficulty = obj.optDouble("Difficulty", obj.optDouble("difficulty", 0.0)),
                    elapsedDays = obj.optLong("ElapsedDays", obj.optLong("elapsed_days", 0L)),
                    scheduledDays = obj.optLong("ScheduledDays", obj.optLong("scheduled_days", 0L)),
                    reps = obj.optInt("Reps", obj.optInt("reps", 0)),
                    lapses = obj.optInt("Lapses", obj.optInt("lapses", 0)),
                    state = obj.optInt("State", obj.optInt("state", 0)),
                    lastReview = last
                )
            } catch (_: Exception) {
                FsrsCardState(due = fallbackDue)
            }
        }
    }
}

data class ScheduleOutcome(
    val nextState: FsrsCardState,
    val logJson: String
)

/**
 * FSRS scheduler compatible with go-fsrs/v4 JSON state format and desiredRetention (0.70..0.97).
 */
class FsrsScheduler(private val desiredRetention: Double = 0.9) {
    // Default FSRS-5/6 weights
    private val w = doubleArrayOf(
        0.40255, 1.18385, 3.173, 15.69105,
        7.1949, 0.5345, 1.4604, 0.0046,
        1.54575, 0.1192, 1.01925, 1.9395,
        0.11, 0.29605, 2.2698, 0.2315,
        2.9898, 0.51655, 0.6621
    )

    private val decay = -0.5
    private val factor = 19.0 / 81.0

    fun schedule(card: FsrsCardState, now: Instant, rating: Int): ScheduleOutcome {
        val clampedRating = rating.coerceIn(1, 4)
        val elapsedDays = if (card.lastReview != null) {
            max(0L, ChronoUnit.DAYS.between(card.lastReview, now))
        } else 0L

        val nextState: FsrsCardState = when (card.state) {
            0 -> scheduleNew(card, now, clampedRating)
            1, 3 -> scheduleLearning(card, now, clampedRating, elapsedDays)
            else -> scheduleReview(card, now, clampedRating, elapsedDays)
        }

        val logObj = JSONObject().apply {
            put("Rating", clampedRating)
            put("State", card.state)
            put("Due", nextState.due.toString())
            put("Stability", nextState.stability)
            put("Difficulty", nextState.difficulty)
            put("ElapsedDays", elapsedDays)
            put("LastElapsedDays", card.elapsedDays)
            put("ScheduledDays", nextState.scheduledDays)
            put("Review", now.toString())
        }
        return ScheduleOutcome(nextState, logObj.toString())
    }

    fun previewIntervalText(card: FsrsCardState, now: Instant, rating: Int): String {
        val next = schedule(card, now, rating).nextState
        val minutes = max(1L, ChronoUnit.MINUTES.between(now, next.due))
        if (minutes < 60) return "${minutes} 分钟"
        val hours = ChronoUnit.HOURS.between(now, next.due)
        if (hours < 24) return "${hours} 小时"
        val days = ChronoUnit.DAYS.between(now, next.due)
        if (days < 30) return "${days} 天"
        val months = max(1L, days / 30)
        if (months < 12) return "${months} 个月"
        return "${max(1L, days / 365)} 年"
    }

    private fun initStability(rating: Int): Double = max(0.1, w[rating - 1])

    private fun initDifficulty(rating: Int): Double {
        return clampDifficulty(w[4] - exp(w[5] * (rating - 1)) + 1.0)
    }

    private fun clampDifficulty(d: Double): Double = min(10.0, max(1.0, d))

    private fun nextIntervalDays(stability: Double): Long {
        val raw = (stability / factor) * (desiredRetention.pow(1.0 / decay) - 1.0)
        return max(1L, raw.roundToLong())
    }

    private fun forgettingCurve(elapsedDays: Long, stability: Double): Double {
        return (1.0 + factor * elapsedDays / max(0.1, stability)).pow(decay)
    }

    private fun nextDifficulty(d: Double, rating: Int): Double {
        val delta = -w[6] * (rating - 3)
        val next = d + delta * (10.0 - d) / 9.0
        val meanReversion = w[7] * initDifficulty(4) + (1.0 - w[7]) * next
        return clampDifficulty(meanReversion)
    }

    private fun nextRecallStability(d: Double, s: Double, r: Double, rating: Int): Double {
        val hardPenalty = if (rating == 2) w[15] else 1.0
        val easyBonus = if (rating == 4) w[16] else 1.0
        return s * (1.0 + exp(w[8]) * (11.0 - d) * s.pow(-w[9]) * (exp((1.0 - r) * w[10]) - 1.0) * hardPenalty * easyBonus)
    }

    private fun nextForgetStability(d: Double, s: Double, r: Double): Double {
        return max(0.1, w[11] * d.pow(-w[12]) * ((s + 1.0).pow(w[13]) - 1.0) * exp((1.0 - r) * w[14]))
    }

    private fun scheduleNew(card: FsrsCardState, now: Instant, rating: Int): FsrsCardState {
        val s = initStability(rating)
        val d = initDifficulty(rating)
        return when (rating) {
            1 -> FsrsCardState(now.plus(1, ChronoUnit.MINUTES), s, d, 0, 0, card.reps + 1, card.lapses, 1, now)
            2 -> FsrsCardState(now.plus(5, ChronoUnit.MINUTES), s, d, 0, 0, card.reps + 1, card.lapses, 1, now)
            3 -> FsrsCardState(now.plus(10, ChronoUnit.MINUTES), s, d, 0, 0, card.reps + 1, card.lapses, 1, now)
            else -> {
                val days = nextIntervalDays(s)
                FsrsCardState(now.plus(days, ChronoUnit.DAYS), s, d, 0, days, card.reps + 1, card.lapses, 2, now)
            }
        }
    }

    private fun scheduleLearning(card: FsrsCardState, now: Instant, rating: Int, elapsed: Long): FsrsCardState {
        val s = if (card.stability > 0) card.stability else initStability(rating)
        val d = if (card.difficulty > 0) nextDifficulty(card.difficulty, rating) else initDifficulty(rating)
        return when (rating) {
            1 -> FsrsCardState(now.plus(1, ChronoUnit.MINUTES), s, d, elapsed, 0, card.reps + 1, card.lapses, card.state, now)
            2 -> FsrsCardState(now.plus(6, ChronoUnit.MINUTES), s, d, elapsed, 0, card.reps + 1, card.lapses, card.state, now)
            else -> {
                val days = nextIntervalDays(s)
                val adjustedDays = if (rating == 4) max(days + 1, (days * 1.3).roundToLong()) else days
                FsrsCardState(now.plus(adjustedDays, ChronoUnit.DAYS), s, d, elapsed, adjustedDays, card.reps + 1, card.lapses, 2, now)
            }
        }
    }

    private fun scheduleReview(card: FsrsCardState, now: Instant, rating: Int, elapsed: Long): FsrsCardState {
        val r = forgettingCurve(elapsed, card.stability)
        val nextD = nextDifficulty(card.difficulty, rating)
        return if (rating == 1) {
            val nextS = nextForgetStability(nextD, card.stability, r)
            FsrsCardState(now.plus(5, ChronoUnit.MINUTES), nextS, nextD, elapsed, 0, card.reps + 1, card.lapses + 1, 3, now)
        } else {
            val nextS = nextRecallStability(nextD, card.stability, r, rating)
            val days = nextIntervalDays(nextS)
            FsrsCardState(now.plus(days, ChronoUnit.DAYS), nextS, nextD, elapsed, days, card.reps + 1, card.lapses, 2, now)
        }
    }
}
