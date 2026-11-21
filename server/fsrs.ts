import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card as TsFsrsCard,
  type Grade,
  Rating,
  State,
} from 'ts-fsrs';
import { formatIntervalLabel } from './helpers.ts';

type GoFsrsCard = {
  Due: string;
  Stability: number;
  Difficulty: number;
  ElapsedDays: number;
  ScheduledDays: number;
  Reps: number;
  Lapses: number;
  State: number;
  LastReview?: string;
};

function normalizeState(raw: unknown): State {
  const num = Number(raw);
  if (num === 1) return State.Learning;
  if (num === 2) return State.Review;
  if (num === 3) return State.Relearning;
  return State.New;
}

export function parseFsrsState(stateJson: string | null | undefined, fallbackDate: Date): TsFsrsCard {
  const empty = createEmptyCard(fallbackDate);
  if (!stateJson) return empty;
  try {
    const raw = JSON.parse(stateJson) as Record<string, unknown>;
    const dueRaw = raw.Due ?? raw.due;
    const lastReviewRaw = raw.LastReview ?? raw.last_review;
    const due = dueRaw ? new Date(String(dueRaw)) : fallbackDate;
    let lastReview: Date | undefined = undefined;
    if (lastReviewRaw) {
      const parsedLast = new Date(String(lastReviewRaw));
      if (!Number.isNaN(parsedLast.getTime()) && parsedLast.getFullYear() > 1) {
        lastReview = parsedLast;
      }
    }
    return {
      due: Number.isNaN(due.getTime()) ? fallbackDate : due,
      stability: Number(raw.Stability ?? raw.stability ?? 0),
      difficulty: Number(raw.Difficulty ?? raw.difficulty ?? 0),
      elapsed_days: Number(raw.ElapsedDays ?? raw.elapsed_days ?? 0),
      scheduled_days: Number(raw.ScheduledDays ?? raw.scheduled_days ?? 0),
      learning_steps: Number(raw.LearningSteps ?? raw.learning_steps ?? 0),
      reps: Number(raw.Reps ?? raw.reps ?? 0),
      lapses: Number(raw.Lapses ?? raw.lapses ?? 0),
      state: normalizeState(raw.State ?? raw.state ?? 0),
      last_review: lastReview,
    } as TsFsrsCard;
  } catch {
    return empty;
  }
}

export function serializeGoFsrsState(card: TsFsrsCard, elapsedDays = 0): string {
  const goCard: GoFsrsCard = {
    Due: card.due.toISOString(),
    Stability: card.stability,
    Difficulty: card.difficulty,
    ElapsedDays: elapsedDays,
    ScheduledDays: card.scheduled_days,
    Reps: card.reps,
    Lapses: card.lapses,
    State: Number(card.state),
    LastReview: card.last_review ? card.last_review.toISOString() : '0001-01-01T00:00:00Z',
  };
  return JSON.stringify(goCard);
}

export function createInitialFsrsState(now: Date): string {
  const empty = createEmptyCard(now);
  return serializeGoFsrsState(empty, 0);
}

function getScheduler(desiredRetention: number) {
  const clamped = Math.min(0.97, Math.max(0.7, desiredRetention || 0.9));
  const params = generatorParameters({
    request_retention: clamped,
    enable_fuzz: false,
    enable_short_term: true,
  });
  return fsrs(params);
}

export function scheduleReview(
  stateJson: string | null | undefined,
  createdAt: Date,
  now: Date,
  rating: 1 | 2 | 3 | 4,
  desiredRetention: number,
): {
  nextStateJson: string;
  dueAt: Date;
  fsrsLogJson: string;
} {
  const card = parseFsrsState(stateJson, createdAt);
  const scheduler = getScheduler(desiredRetention);
  const grade = rating as Grade;
  const result = scheduler.next(card, now, grade);

  const elapsedDays = card.last_review
    ? Math.max(0, Math.round((now.getTime() - card.last_review.getTime()) / 86_400_000))
    : 0;

  const goLog = {
    Rating: rating,
    State: Number(result.log.state),
    Due: result.log.due.toISOString(),
    Stability: result.log.stability,
    Difficulty: result.log.difficulty,
    ElapsedDays: elapsedDays,
    LastElapsedDays: elapsedDays,
    ScheduledDays: result.log.scheduled_days,
    Review: result.log.review.toISOString(),
  };

  return {
    nextStateJson: serializeGoFsrsState(result.card, elapsedDays),
    dueAt: result.card.due,
    fsrsLogJson: JSON.stringify(goLog),
  };
}

export function previewIntervals(
  stateJson: string | null | undefined,
  createdAt: Date,
  now: Date,
  desiredRetention: number,
): Record<1 | 2 | 3 | 4, string> {
  const card = parseFsrsState(stateJson, createdAt);
  const scheduler = getScheduler(desiredRetention);
  const record = scheduler.repeat(card, now);
  return {
    1: formatIntervalLabel(record[Rating.Again].card.due, now),
    2: formatIntervalLabel(record[Rating.Hard].card.due, now),
    3: formatIntervalLabel(record[Rating.Good].card.due, now),
    4: formatIntervalLabel(record[Rating.Easy].card.due, now),
  };
}
