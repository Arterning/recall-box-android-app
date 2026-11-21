import type { ClipboardEvent } from 'react';

export type Note = {
  id: number;
  title: string;
  content: string;
  format: 'markdown' | 'text';
  tags: string;
  createdAt?: string;
  updatedAt: string;
};

export type NoteListResult = {
  items: Note[];
  total: number;
  page: number;
  pageSize: number;
};

export type DiaryEntry = {
  id: number;
  date: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type DiarySummary = {
  id: number;
  date: string;
  excerpt: string;
  updatedAt: string;
};

export type Card = {
  id: number;
  noteId?: number | null;
  excerpt: string;
  startOffset: number;
  endOffset: number;
  anchorValid: boolean;
  question: string;
  answer: string;
  dueAt: string | null;
  createdAt: string;
  noteTitle?: string;
  noteFormat?: 'markdown' | 'text';
  intervalPreviews?: Record<1 | 2 | 3 | 4, string>;
};

export type CardListResult = {
  items: Card[];
  total: number;
  dueCount: number;
  page: number;
  pageSize: number;
};

export type Annotation = {
  id: number;
  noteId?: number;
  cardId?: number;
  field?: 'question' | 'answer' | 'context';
  excerpt: string;
  startOffset: number;
  endOffset: number;
  comment: string;
  anchorValid: boolean;
  createdAt: string;
};

export type Stats = {
  notes: number;
  cards: number;
  due: number;
  reviewedToday: number;
};

export type ReviewHistoryItem = {
  id: number;
  cardId: number;
  rating: number;
  response: string;
  reviewedAt: string;
  question: string;
  excerpt: string;
  noteTitle: string;
};

export type OverviewData = {
  summary: {
    notes: number;
    cards: number;
    due: number;
    totalReviews: number;
    reviewedToday: number;
    reviewsLast30Days: number;
    averageRating: number;
  };
  days: Array<{ date: string; count: number; good: number }>;
  noteDays: Array<{ date: string; count: number }>;
  noteYear: number;
  noteYears: number[];
  ratings: Record<string, number>;
  recent: ReviewHistoryItem[];
};

export type SystemDataInfo = {
  path: string;
  database: string;
  attachments: string;
  databaseSizeBytes: number;
  schemaCompatible: boolean;
  androidProjectAvailable: boolean;
  counts: {
    notes: number;
    cards: number;
    diaries: number;
    annotations: number;
    reviewLogs: number;
  };
};

export const emptyNote: Note = {
  id: 0,
  title: '',
  content: '',
  format: 'markdown',
  tags: '',
  updatedAt: '',
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `请求失败 (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function uploadImageFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/assets', { method: 'POST', body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `上传图片失败 (${res.status})`);
  }
  const json = (await res.json()) as { url: string };
  return `![image](${json.url})`;
}

export async function uploadClipboardImages(
  event: ClipboardEvent<HTMLTextAreaElement>,
): Promise<string[] | null> {
  const items = [...(event.clipboardData?.items ?? [])];
  const imageFiles = items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (imageFiles.length === 0) return null;
  event.preventDefault();
  return Promise.all(imageFiles.map(uploadImageFile));
}
