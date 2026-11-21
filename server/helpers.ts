export function findAnchor(
  content: string,
  excerpt: string,
  near: number,
): { start: number; end: number; found: boolean } {
  if (!excerpt || excerpt.length > content.length) {
    return { start: 0, end: 0, found: false };
  }
  let best = -1;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  let idx = content.indexOf(excerpt);
  while (idx !== -1) {
    const distance = Math.abs(idx - near);
    if (distance < bestDistance) {
      best = idx;
      bestDistance = distance;
    }
    idx = content.indexOf(excerpt, idx + 1);
  }
  if (best < 0) {
    return { start: 0, end: 0, found: false };
  }
  return { start: best, end: best + excerpt.length, found: true };
}

export function sliceUTF16(content: string, start: number, end: number): string {
  if (start < 0 || end < start || end > content.length) {
    return '';
  }
  return content.slice(start, end);
}

export function clozeExcerpt(content: string, start: number, end: number): string {
  if (start < 0 || end <= start || end > content.length) {
    return '[选中内容]';
  }
  let paragraphStart = 0;
  for (let i = start - 1; i >= 1; i--) {
    if (content[i - 1] === '\n' && content[i] === '\n') {
      paragraphStart = i + 1;
      break;
    }
  }
  let paragraphEnd = content.length;
  for (let i = end; i < content.length - 1; i++) {
    if (content[i] === '\n' && content[i + 1] === '\n') {
      paragraphEnd = i;
      break;
    }
  }
  const before = content.slice(paragraphStart, start).trim();
  const after = content.slice(end, paragraphEnd).trim();
  const context = `${before} […] ${after}`.trim();
  if (!context || context === '[…]') {
    return '[选中内容]';
  }
  return context;
}

export function resolveCardContext(
  card: {
    note_id: number | null;
    excerpt: string;
    context_override: string;
    start_offset: number;
    end_offset: number;
  },
  noteContent: string | null | undefined,
): string {
  if (card.note_id === null || card.note_id === undefined) {
    return card.excerpt || '';
  }
  if (card.context_override) {
    return card.context_override;
  }
  if (noteContent) {
    return clozeExcerpt(noteContent, card.start_offset, card.end_offset);
  }
  return card.excerpt || '[选中内容]';
}

export function formatIntervalLabel(due: Date, now: Date): string {
  const diffMs = Math.max(0, due.getTime() - now.getTime());
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return '< 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.round(diffMs / 86_400_000);
  if (days < 30) return `${days} 天`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} 个月`;
  const years = (days / 365).toFixed(1).replace(/\.0$/, '');
  return `${years} 年`;
}

export function toIsoOrNull(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  const str = String(val).trim();
  if (!str) return null;
  // Handle SQLite "YYYY-MM-DD HH:MM:SS" or Go RFC3339 timestamps
  const parsed = new Date(str.includes('T') || str.endsWith('Z') ? str : str.replace(' ', 'T') + 'Z');
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(str);
    return Number.isNaN(fallback.getTime()) ? str : fallback.toISOString();
  }
  return parsed.toISOString();
}

export function localDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
