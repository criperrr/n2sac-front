import type { ChatMessage } from '../../../api/types';

export const MAX_CHARS = 500;
/** Own messages can be edited for 15 minutes (server rule). */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
/** Same list the server accepts. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '💯'] as const;
/** Consecutive messages from the same person within this gap share one bubble group. */
const GROUP_GAP_MS = 5 * 60 * 1000;

/** A message in the list: server messages plus local optimistic ones (negative ids). */
export interface ChatItem extends ChatMessage {
  /** Optimistic message waiting for the server, or one that failed to send. */
  local?: 'sending' | 'failed';
  /** Client id kept across the optimistic → confirmed swap, so the bubble doesn't remount. */
  key: string;
}

/** Inserts or replaces messages by id, keeping ascending id order (local ones stay last). */
export function mergeMessages(prev: ChatItem[], incoming: ChatMessage[]): ChatItem[] {
  if (incoming.length === 0) return prev;
  const byId = new Map<number, ChatItem>();
  const local: ChatItem[] = [];
  for (const m of prev) {
    if (m.local) local.push(m);
    else byId.set(m.id, m);
  }
  for (const m of incoming) {
    const existing = byId.get(m.id);
    byId.set(m.id, { ...m, key: existing?.key ?? `m${m.id}` });
  }
  const confirmed = [...byId.values()].sort((a, b) => a.id - b.id);
  return [...confirmed, ...local];
}

export function canEdit(m: ChatItem, now = Date.now()): boolean {
  return m.is_me && !m.deleted && !m.local && !m.text.startsWith('giphy:') && now - new Date(m.created_at).getTime() < EDIT_WINDOW_MS;
}

export interface RenderRow {
  type: 'day' | 'message';
  key: string;
  label?: string;
  item?: ChatItem;
  /** Position inside a same-sender group, for the bubble corner shapes. */
  groupStart?: boolean;
  groupEnd?: boolean;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function dayLabel(d: Date, now = new Date()): string {
  if (sameDay(d, now)) return 'Hoje';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Ontem';
  const diffDays = (now.getTime() - d.getTime()) / 86_400_000;
  if (diffDays < 6) {
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Day separators + group boundaries. */
export function buildRows(items: ChatItem[]): RenderRow[] {
  const rows: RenderRow[] = [];
  let prev: ChatItem | null = null;
  for (let i = 0; i < items.length; i += 1) {
    const m = items[i]!;
    const at = new Date(m.created_at);
    if (!prev || !sameDay(new Date(prev.created_at), at)) {
      rows.push({ type: 'day', key: `d${at.toDateString()}`, label: dayLabel(at) });
      prev = null;
    }
    const next = items[i + 1];
    const joinsPrev =
      prev !== null && prev.is_me === m.is_me && at.getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
    const joinsNext =
      next !== undefined &&
      next.is_me === m.is_me &&
      sameDay(at, new Date(next.created_at)) &&
      new Date(next.created_at).getTime() - at.getTime() < GROUP_GAP_MS;
    rows.push({ type: 'message', key: m.key, item: m, groupStart: !joinsPrev, groupEnd: !joinsNext });
    prev = m;
  }
  return rows;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export type TextPart = { kind: 'text' | 'link' | 'match'; value: string };

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/gi;

/** Splits text into plain/link parts and highlights `query` matches inside plain text. */
export function splitText(text: string, query = ''): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(...highlight(text.slice(last, start), query));
    parts.push({ kind: 'link', value: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(...highlight(text.slice(last), query));
  return parts;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function highlight(text: string, query: string): TextPart[] {
  const q = fold(query.trim());
  if (!q) return [{ kind: 'text', value: text }];
  const folded = fold(text);
  const out: TextPart[] = [];
  let from = 0;
  let at = folded.indexOf(q);
  // NFD folding keeps one char per base letter for pt-BR text, so indexes line up.
  while (at >= 0 && folded.length === text.length) {
    if (at > from) out.push({ kind: 'text', value: text.slice(from, at) });
    out.push({ kind: 'match', value: text.slice(at, at + q.length) });
    from = at + q.length;
    at = folded.indexOf(q, from);
  }
  if (from < text.length) out.push({ kind: 'text', value: text.slice(from) });
  return out;
}

export function matchesQuery(m: ChatItem, query: string): boolean {
  const q = fold(query.trim());
  return q.length > 0 && !m.deleted && !m.text.startsWith('giphy:') && fold(m.text).includes(q);
}

/** A message made of 1–3 emoji and nothing else is shown large, without a bubble. */
export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 24) return false;
  const stripped = t.replace(/[\s‍️]/g, '').replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}/gu, '');
  if (stripped.length > 0) return false;
  const count = [...t.matchAll(/\p{Extended_Pictographic}/gu)].length;
  return count >= 1 && count <= 3;
}

export const QUICK_STARTERS = ['Oi! 👋', 'E aí, tudo bem?', 'Bora estudar junto?', 'Como foi na prova?'];

export const EMOJI_PALETTE: { label: string; emojis: string[] }[] = [
  { label: 'Carinhas', emojis: ['😀', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳', '😏', '🤔', '🫠', '😴', '😭', '😤', '😡', '🤯', '😱', '🥺', '😬', '🙃', '😅'] },
  { label: 'Gestos', emojis: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '✌️', '🤞', '👋', '💪', '🫶', '👀'] },
  { label: 'Escola', emojis: ['📚', '📖', '✏️', '📝', '📐', '🧪', '🧮', '💻', '🎓', '⏰', '📅', '✅', '❌', '💯', '🏆', '⭐'] },
  { label: 'Coisas', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🔥', '✨', '🎉', '☕', '🍕', '🍔', '⚽', '🎮', '🎧'] },
];

/**
 * Chat surface tones derived from the background. Some presets (light editorial, AMOLED) use the
 * same color for `background` and `surfaceContainerHigh`, which would make received bubbles vanish.
 */
export function chatTone(tokens: { onSurface: string; background: string }, percent: number): string {
  return `color-mix(in srgb, ${tokens.onSurface} ${percent}%, ${tokens.background})`;
}
