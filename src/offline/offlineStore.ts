import { useEffect, useState } from 'react';

const DB_NAME = 'n2sac_offline_v1';
const DB_VERSION = 1;
const STORE_NAME = 'resources';
export const OFFLINE_SCHEMA_VERSION = 1;

export const OFFLINE_TTL_MS = {
  boletim: 30 * 24 * 60 * 60 * 1000, // 30 days
  auxiliary: 14 * 24 * 60 * 60 * 1000, // 14 days (home, atrasos, saidas, fichas)
  ranking: 7 * 24 * 60 * 60 * 1000, // 7 days (students & classrooms)
  default: 7 * 24 * 60 * 60 * 1000,
} as const;

export interface OfflineCacheEntry<T> {
  key: string;
  schemaVersion: number;
  accountId: number;
  routeKey: string;
  etag: string | null;
  data: T;
  fetchedAt: number;
  validatedAt: number;
  expiresAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('accountId', 'accountId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

function buildKey(accountId: number, routeKey: string): string {
  return `${accountId}:${routeKey}`;
}

export async function getOfflineEntry<T>(
  accountId: number,
  routeKey: string
): Promise<OfflineCacheEntry<T> | null> {
  const db = await openOfflineDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(buildKey(accountId, routeKey));
      req.onsuccess = () => {
        const entry = req.result as OfflineCacheEntry<T> | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        if (entry.schemaVersion !== OFFLINE_SCHEMA_VERSION || Date.now() > entry.expiresAt) {
          resolve(null);
          return;
        }
        resolve(entry);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putOfflineEntry<T>(params: {
  accountId: number;
  routeKey: string;
  data: T;
  etag?: string | null;
  fetchedAt?: number;
  validatedAt?: number;
  ttlMs?: number;
}): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;

  const now = Date.now();
  const entry: OfflineCacheEntry<T> = {
    key: buildKey(params.accountId, params.routeKey),
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    accountId: params.accountId,
    routeKey: params.routeKey,
    etag: params.etag ?? null,
    data: params.data,
    fetchedAt: params.fetchedAt ?? now,
    validatedAt: params.validatedAt ?? now,
    expiresAt: now + (params.ttlMs ?? OFFLINE_TTL_MS.default),
  };

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearAccountOfflineStore(accountId: number): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('accountId');
      const range = IDBKeyRange.only(accountId);
      const req = index.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// Reactive Online / Offline Signal (navigator.onLine + real fetch telemetry)
// ---------------------------------------------------------------------------

type OnlineListener = (online: boolean) => void;
const onlineListeners = new Set<OnlineListener>();
let currentOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let windowListenersInstalled = false;

function notifyOnlineListeners(next: boolean): void {
  if (next === currentOnline) return;
  currentOnline = next;
  onlineListeners.forEach((fn) => fn(next));
}

function ensureWindowOnlineListeners(): void {
  if (windowListenersInstalled || typeof window === 'undefined') return;
  windowListenersInstalled = true;
  window.addEventListener('online', () => notifyOnlineListeners(true));
  window.addEventListener('offline', () => notifyOnlineListeners(false));
}

export function isOnlineNow(): boolean {
  ensureWindowOnlineListeners();
  return currentOnline;
}

export function reportNetworkStatus(online: boolean): void {
  ensureWindowOnlineListeners();
  notifyOnlineListeners(online);
}

export function useOnlineStatus(): boolean {
  ensureWindowOnlineListeners();
  const [online, setOnline] = useState<boolean>(currentOnline);

  useEffect(() => {
    setOnline(currentOnline);
    onlineListeners.add(setOnline);
    return () => {
      onlineListeners.delete(setOnline);
    };
  }, []);

  return online;
}

export function formatOfflineAge(timestampMs: number | null | undefined): string {
  if (!timestampMs) return 'dados locais';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return 'há menos de 1 min';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

export function registerOfflineServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const isSecure =
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  if (!isSecure) return;

  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch(() => {
          // Non-fatal: app still works normally online.
        });
    },
    { once: true }
  );
}
