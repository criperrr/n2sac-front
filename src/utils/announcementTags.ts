import type { AnnouncementItem } from '../api/types';

export const MAX_TAG_WORDS = 2;
export const MAX_TAG_CHARS = 20;
export const MAX_VISIBLE_TAGS = 5;

export const DEFAULT_ANNOUNCEMENT_TAGS: string[] = [
  'Geral',
  'Prova',
  'Trabalho',
  'Horário',
  'Evento',
];

const LEGACY_TAG_MAP: Record<string, string> = {
  general: 'Geral',
  geral: 'Geral',
  exam: 'Prova',
  prova: 'Prova',
  assignment: 'Trabalho',
  trabalho: 'Trabalho',
  schedule: 'Horário',
  horario: 'Horário',
  horário: 'Horário',
  event: 'Evento',
  evento: 'Evento',
};

function formatTagWord(word: string): string {
  const hasAlpha = /\p{L}/u.test(word);
  const isShortAcronym =
    hasAlpha &&
    word.length >= 2 &&
    word.length <= 4 &&
    word === word.toUpperCase() &&
    !/\p{Ll}/u.test(word);
  if (isShortAcronym) return word;
  const first = word.charAt(0).toLocaleUpperCase('pt-BR');
  const rest = word.slice(1).toLocaleLowerCase('pt-BR');
  return `${first}${rest}`;
}

/** Strips invalid characters and collapses whitespace without truncating user input yet. */
export function cleanRawTag(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s\-/+&]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Formats a tag cleanly in Title Case (preserving short uppercase acronyms like TCC, P1, CTI). */
export function formatAnnouncementTag(raw: string): string {
  const cleaned = cleanRawTag(raw);
  if (!cleaned) return '';
  const mapped = LEGACY_TAG_MAP[cleaned.toLocaleLowerCase('pt-BR')];
  if (mapped) return mapped;
  return cleaned.split(' ').map(formatTagWord).join(' ');
}

/** Displays any stored announcement tag/legacy category slug cleanly. */
export function displayAnnouncementTag(raw: string | null | undefined): string {
  if (!raw) return 'Geral';
  return formatAnnouncementTag(raw) || 'Geral';
}

/** Validates and formats a custom tag (max 2 words, max 20 chars). */
export function validateAnnouncementTag(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const cleaned = cleanRawTag(raw);
  if (!cleaned) {
    return { ok: false, error: 'Digite um nome para a tag.' };
  }
  const words = cleaned.split(' ');
  if (words.length > MAX_TAG_WORDS) {
    return { ok: false, error: `A tag pode ter no máximo ${MAX_TAG_WORDS} palavras.` };
  }
  const formatted = formatAnnouncementTag(cleaned);
  if (formatted.length > MAX_TAG_CHARS) {
    return { ok: false, error: `A tag pode ter no máximo ${MAX_TAG_CHARS} caracteres.` };
  }
  return { ok: true, value: formatted };
}

/** Normalizes a tag key for case/accent-insensitive comparison and search. */
export function tagSearchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export interface DynamicTagEntry {
  tag: string;
  count: number;
}

/** Dynamically extracts all tags actually present in non-deleted announcements, sorted by usage. */
export function extractDynamicTags(announcements: AnnouncementItem[]): DynamicTagEntry[] {
  const map = new Map<string, DynamicTagEntry>();
  for (const ann of announcements) {
    if (ann.deleted) continue;
    const label = displayAnnouncementTag(ann.category);
    const key = tagSearchKey(label);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { tag: label, count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pt-BR'));
}
