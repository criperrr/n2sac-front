import { Capacitor } from '@capacitor/core';
import { getEffectiveAppVersion, getInstalledNativeVersion } from '../updater/autoUpdater';
import { getKeyboardInset } from '../platform/keyboardInsets';
import { collectHardwareProfile, getLastUiError } from './telemetryEngine';

export interface DiagnosticLogEntry {
  t: string;
  level: 'warn' | 'error' | 'crash' | 'event';
  msg: string;
}

export interface DiagnosticApiEntry {
  t: string;
  method: string;
  path: string;
  status: number | 'network_err';
  ms: number;
}

const MAX_LOGS = 25;
const MAX_API_ENTRIES = 12;
const MAX_MSG_LEN = 220;

const startedAt = Date.now();
const logRing: DiagnosticLogEntry[] = [];
const apiRing: DiagnosticApiEntry[] = [];
let installed = false;

function shortTime(): string {
  const d = new Date();
  return d.toISOString().slice(11, 23);
}

/** Strips bearer tokens, cookies, base64 data URLs, and credentials before buffering. */
function redactSecrets(raw: string): string {
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/nsac_(?:usr|srv)_[a-f0-9]+/gi, '[REDACTED_TOKEN]')
    .replace(/(?:PHPSESSID|XSRF-TOKEN|laravel_session)=[^;\s]+/gi, '[REDACTED_COOKIE]')
    .replace(/data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi, '[DATA_IMAGE]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MSG_LEN);
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export function pushDiagnosticLog(level: DiagnosticLogEntry['level'], message: string): void {
  const msg = redactSecrets(message);
  if (!msg) return;
  if (logRing.length >= MAX_LOGS) logRing.shift();
  logRing.push({ t: shortTime(), level, msg });
}

function pushApiEntry(entry: DiagnosticApiEntry): void {
  if (apiRing.length >= MAX_API_ENTRIES) apiRing.shift();
  apiRing.push(entry);
}

/**
 * Installs lightweight, in-memory-only diagnostic hooks at app boot (zero network overhead,
 * bounded ring buffers, automatic secret redaction) for bug reports.
 */
export function installDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // 1) Console warn / error capture
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: unknown[]) => {
    pushDiagnosticLog('warn', formatArgs(args));
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    pushDiagnosticLog('error', formatArgs(args));
    origError(...args);
  };

  // 2) Global uncaught error & rejection capture (works even without telemetry consent)
  window.addEventListener('error', (ev) => {
    const detail = ev.error instanceof Error
      ? `${ev.error.name}: ${ev.error.message}`
      : ev.message || 'Uncaught error';
    pushDiagnosticLog('crash', detail);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    const detail = r instanceof Error ? `${r.name}: ${r.message}` : String(r ?? 'Unhandled rejection');
    pushDiagnosticLog('crash', `rejection: ${detail}`);
  });

  // 3) Connectivity & visibility breadcrumbs
  window.addEventListener('online', () => pushDiagnosticLog('event', 'network online'));
  window.addEventListener('offline', () => pushDiagnosticLog('event', 'network offline'));
  document.addEventListener('visibilitychange', () => {
    pushDiagnosticLog('event', `visibility: ${document.visibilityState}`);
  });

  // 4) Lightweight /api/v1/* metadata observer (method + path + status + latency only; never bodies/headers)
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let apiPath: string | null = null;
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      if (parsed.pathname.startsWith('/api/v1/') && parsed.pathname !== '/api/v1/telemetry') {
        apiPath = parsed.pathname;
      }
    } catch {
      // ignore non-standard URLs
    }

    if (!apiPath) {
      return origFetch(input, init);
    }

    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET') ?? 'GET').toUpperCase();
    const t0 = performance.now();
    try {
      const res = await origFetch(input, init);
      const ms = Math.round(performance.now() - t0);
      pushApiEntry({ t: shortTime(), method, path: apiPath, status: res.status, ms });
      if (res.status >= 400 && res.status !== 404) {
        pushDiagnosticLog('warn', `API ${method} ${apiPath} -> ${res.status} (${ms}ms)`);
      }
      return res;
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      pushApiEntry({ t: shortTime(), method, path: apiPath, status: 'network_err', ms });
      pushDiagnosticLog('error', `API ${method} ${apiPath} failed (${ms}ms): ${err instanceof Error ? err.message : 'network'}`);
      throw err;
    }
  };
}

export interface FeedbackThemeSnapshot {
  design_system: string;
  mode: string;
  dark: boolean;
  preset: string;
  dynamic_color: boolean;
}

export interface FeedbackDiagnosticsPayload {
  app_version: string;
  native_apk_version: string | null;
  platform: string;
  online: boolean;
  language: string;
  timezone: string;
  uptime_secs: number;
  route: string;
  viewport: { width: number; height: number; dpr: number } | null;
  hardware: Record<string, unknown>;
  runtime: {
    dom_nodes: number;
    js_heap_used_mb: number | null;
    js_heap_total_mb: number | null;
    ime_height_px: number;
  };
  theme: FeedbackThemeSnapshot;
  last_ui_error: ReturnType<typeof getLastUiError>;
  recent_api: DiagnosticApiEntry[];
  logs: DiagnosticLogEntry[];
}

export function collectFeedbackDiagnostics(theme: FeedbackThemeSnapshot): FeedbackDiagnosticsPayload {
  const isNative = Capacitor.isNativePlatform();
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
  const perfMem = (performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
  }).memory;

  let timezone = 'unknown';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    // ignore
  }

  return {
    app_version: getEffectiveAppVersion(),
    native_apk_version: isNative ? getInstalledNativeVersion() : null,
    platform: isNative ? 'android_apk' : isAndroid ? 'android_web' : 'web',
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    language: typeof navigator !== 'undefined' ? navigator.language : 'pt-BR',
    timezone,
    uptime_secs: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    route: typeof window !== 'undefined' ? window.location.pathname : '/',
    viewport:
      typeof window !== 'undefined'
        ? { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 }
        : null,
    hardware: collectHardwareProfile(),
    runtime: {
      dom_nodes: typeof document !== 'undefined' ? document.getElementsByTagName('*').length : 0,
      js_heap_used_mb: perfMem ? Math.round((perfMem.usedJSHeapSize / 1048576) * 10) / 10 : null,
      js_heap_total_mb: perfMem ? Math.round((perfMem.totalJSHeapSize / 1048576) * 10) / 10 : null,
      ime_height_px: getKeyboardInset(),
    },
    theme,
    last_ui_error: getLastUiError(),
    recent_api: [...apiRing],
    logs: [...logRing],
  };
}
