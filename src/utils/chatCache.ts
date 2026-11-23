import type {
  ChatMessage,
  ClassroomChatMessage,
  ClassroomOverviewPayload,
} from '../api/types';

const STORAGE_PREFIX = 'n2sac:chat_cache:v1:';
const INDEX_KEY = 'n2sac:chat_cache:v1:__index';
const MAX_CACHED_MESSAGES = 80;
const MAX_CACHED_CHATS = 15;

export interface CachedDmChat {
  messages: ChatMessage[];
  nextRev: number;
  lastId: number;
  hasMoreBefore: boolean;
  isFriend: boolean;
  extras: boolean;
  peerLastRead: number;
  peerInfo?: { label: string; avatar: string | null; classCode: string };
  updatedAt: number;
}

export interface CachedClassroomChat {
  messages: ClassroomChatMessage[];
  nextRev: number;
  hasMoreBefore: boolean;
  amIRep: boolean;
  updatedAt: number;
}

const memoryCache = new Map<string, unknown>();

/** Non-reversible short scope hash derived from session token so accounts stay isolated. */
function tokenScope(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function fullKey(token: string, chatKey: string): string {
  return `${STORAGE_PREFIX}${tokenScope(token)}:${chatKey}`;
}

function touchLruIndex(storageKey: string): void {
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [storageKey, ...list.filter((k) => k !== storageKey)];
    while (next.length > MAX_CACHED_CHATS) {
      const evicted = next.pop();
      if (evicted) {
        memoryCache.delete(evicted);
        window.localStorage.removeItem(evicted);
      }
    }
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota or private-mode failures.
  }
}

function readRaw<T>(token: string, chatKey: string): T | null {
  const key = fullKey(token, chatKey);
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeRaw<T>(token: string, chatKey: string, value: T): void {
  const key = fullKey(token, chatKey);
  memoryCache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    touchLruIndex(key);
  } catch {
    // Storage full or unavailable; keep in-memory cache working.
  }
}

function removeRaw(token: string, chatKey: string): void {
  const key = fullKey(token, chatKey);
  memoryCache.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadCachedDmChat(token: string, peerAccountId: number): CachedDmChat | null {
  return readRaw<CachedDmChat>(token, `dm:${peerAccountId}`);
}

export function saveCachedDmChat(token: string, peerAccountId: number, data: CachedDmChat): void {
  const trimmed: CachedDmChat = {
    ...data,
    messages: data.messages.slice(-MAX_CACHED_MESSAGES),
    updatedAt: Date.now(),
  };
  writeRaw(token, `dm:${peerAccountId}`, trimmed);
}

export function removeCachedDmChat(token: string, peerAccountId: number): void {
  removeRaw(token, `dm:${peerAccountId}`);
}

export function loadCachedClassroomChat(
  token: string,
  classCode: string,
  channelKind: string
): CachedClassroomChat | null {
  return readRaw<CachedClassroomChat>(token, `classroom:${classCode}:${channelKind}`);
}

export function saveCachedClassroomChat(
  token: string,
  classCode: string,
  channelKind: string,
  data: CachedClassroomChat
): void {
  const trimmed: CachedClassroomChat = {
    ...data,
    messages: data.messages.slice(-MAX_CACHED_MESSAGES),
    updatedAt: Date.now(),
  };
  writeRaw(token, `classroom:${classCode}:${channelKind}`, trimmed);
}

export function loadCachedClassroomOverview(token: string): ClassroomOverviewPayload | null {
  return readRaw<ClassroomOverviewPayload>(token, 'classroom_overview');
}

export function saveCachedClassroomOverview(token: string, data: ClassroomOverviewPayload): void {
  writeRaw(token, 'classroom_overview', data);
}
