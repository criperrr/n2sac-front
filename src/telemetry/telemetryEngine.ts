import { getApiBaseUrl } from '../api/nsacClient';
import { APP_VERSION } from '../appVersion';

const CONSENT_STORAGE_KEY = 'n2sac_telemetry_consent_v1';
const FINGERPRINT_KEY = 'n2sac_device_fp_v1';

/** Bounded frame-time ring buffer (O(1) insert, zero array shifts). */
const FRAME_BUFFER_CAPACITY = 300;
/** Active rAF sampling burst duration (ms) per window. */
const SAMPLE_BURST_MS = 4_000;
/** Rest duration (ms) between bursts while page is visible. */
const SAMPLE_REST_MS = 26_000;
const INITIAL_FLUSH_DELAY_MS = 15_000;
const PERIODIC_FLUSH_MS = 60_000;

export type TelemetryConsentState = 'undecided' | 'granted' | 'denied';

interface StaticHardwareProfile {
  cpu_cores: number | null;
  device_memory_gb: number | null;
  gpu_renderer: string;
  gpu_vendor: string;
  screen_width: number | null;
  screen_height: number | null;
  dpr: number;
  user_agent: string;
}

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { effectiveType?: string; rtt?: number; downlink?: number };
};

let cachedStaticHardware: StaticHardwareProfile | null = null;

export function getTelemetryConsent(): TelemetryConsentState {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === 'granted' || raw === 'denied') return raw;
  } catch {
    // ignore
  }
  return 'undecided';
}

export function setTelemetryConsent(value: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // ignore
  }
  if (value === 'granted') {
    startTelemetryEngine();
  } else {
    stopTelemetryEngine();
  }
}

function getOrCreateDeviceFingerprint(): string {
  try {
    const existing = localStorage.getItem(FINGERPRINT_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(FINGERPRINT_KEY, generated);
    return generated;
  } catch {
    return 'ephemeral-device';
  }
}

function detectPlatform(): string {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'web';
}

/**
 * Probes static device capabilities (including WebGL GPU renderer/vendor) ONCE per session
 * and immediately releases the temporary WebGL context to prevent GPU context leaks.
 */
function getStaticHardwareProfile(): StaticHardwareProfile {
  if (cachedStaticHardware) return cachedStaticHardware;

  let gpuRenderer = 'unknown';
  let gpuVendor = 'unknown';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl && typeof gl.getExtension === 'function') {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        gpuRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? 'unknown');
        gpuVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? 'unknown');
      }
      const loseCtx = gl.getExtension('WEBGL_lose_context');
      loseCtx?.loseContext();
    }
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // ignore WebGL unavailability
  }

  const nav = navigator as NavigatorWithHints;
  cachedStaticHardware = {
    cpu_cores: nav.hardwareConcurrency ?? null,
    device_memory_gb: nav.deviceMemory ?? null,
    gpu_renderer: gpuRenderer,
    gpu_vendor: gpuVendor,
    screen_width: window.screen?.width ?? null,
    screen_height: window.screen?.height ?? null,
    dpr: window.devicePixelRatio ?? 1,
    user_agent: nav.userAgent.slice(0, 220),
  };
  return cachedStaticHardware;
}

export function collectHardwareProfile(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const staticHw = getStaticHardwareProfile();
  const nav = navigator as NavigatorWithHints;

  return {
    ...staticHw,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    network_type: nav.connection?.effectiveType ?? null,
    network_rtt_ms: nav.connection?.rtt ?? null,
    network_downlink_mbps: nav.connection?.downlink ?? null,
  };
}

let engineActive = false;
let rafId: number | null = null;
let burstStopTimer: number | null = null;
let burstNextTimer: number | null = null;
let initialFlushTimer: number | null = null;
let flushTimer: number | null = null;
let hasSentInitialFlush = false;

let lastFrameTs = 0;
const frameDurations = new Float32Array(FRAME_BUFFER_CAPACITY);
let frameWriteIdx = 0;
let frameSampleCount = 0;
let jankFrames = 0;
let severeJankFrames = 0;
let longTaskCount = 0;
let maxLongTaskMs = 0;
let longTaskObserver: PerformanceObserver | null = null;
let globalErrorHandlersAttached = false;
let visibilityHandlerAttached = false;

function sampleFrame(ts: number): void {
  if (!engineActive || document.hidden) {
    rafId = null;
    lastFrameTs = 0;
    return;
  }
  if (lastFrameTs > 0) {
    const dt = ts - lastFrameTs;
    if (dt > 0 && dt < 1000) {
      frameDurations[frameWriteIdx] = dt;
      frameWriteIdx = (frameWriteIdx + 1) % FRAME_BUFFER_CAPACITY;
      if (frameSampleCount < FRAME_BUFFER_CAPACITY) {
        frameSampleCount++;
      }
      if (dt > 18) jankFrames++;
      if (dt > 34) severeJankFrames++;
    }
  }
  lastFrameTs = ts;
  rafId = window.requestAnimationFrame(sampleFrame);
}

function stopFrameBurst(): void {
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (burstStopTimer !== null) {
    window.clearTimeout(burstStopTimer);
    burstStopTimer = null;
  }
  if (burstNextTimer !== null) {
    window.clearTimeout(burstNextTimer);
    burstNextTimer = null;
  }
  lastFrameTs = 0;
}

function startFrameBurst(): void {
  if (!engineActive || typeof document === 'undefined' || document.hidden) return;
  stopFrameBurst();
  lastFrameTs = 0;
  rafId = window.requestAnimationFrame(sampleFrame);

  burstStopTimer = window.setTimeout(() => {
    burstStopTimer = null;
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastFrameTs = 0;
    if (engineActive && !document.hidden) {
      burstNextTimer = window.setTimeout(() => {
        burstNextTimer = null;
        startFrameBurst();
      }, SAMPLE_REST_MS);
    }
  }, SAMPLE_BURST_MS);
}

function clearFlushTimers(): void {
  if (initialFlushTimer !== null) {
    window.clearTimeout(initialFlushTimer);
    initialFlushTimer = null;
  }
  if (flushTimer !== null) {
    window.clearInterval(flushTimer);
    flushTimer = null;
  }
}

function scheduleFlushTimers(): void {
  if (!engineActive || typeof document === 'undefined' || document.hidden) return;
  clearFlushTimers();

  if (!hasSentInitialFlush) {
    initialFlushTimer = window.setTimeout(() => {
      initialFlushTimer = null;
      hasSentInitialFlush = true;
      void sendTelemetryPayload('performance');
    }, INITIAL_FLUSH_DELAY_MS);
  }

  flushTimer = window.setInterval(() => {
    if (!document.hidden) {
      void sendTelemetryPayload('performance');
    }
  }, PERIODIC_FLUSH_MS);
}

function handleVisibilityChange(): void {
  if (!engineActive) return;
  if (document.hidden) {
    stopFrameBurst();
    clearFlushTimers();
  } else if (getTelemetryConsent() === 'granted') {
    startFrameBurst();
    scheduleFlushTimers();
  }
}

function collectRuntimeMetrics(): Record<string, unknown> {
  const count = frameSampleCount;
  let sumDt = 0;
  let maxDt = 16.67;
  if (count > 0) {
    maxDt = 0;
    for (let i = 0; i < count; i++) {
      const dt = frameDurations[i]!;
      sumDt += dt;
      if (dt > maxDt) maxDt = dt;
    }
  }
  const avgDt = count > 0 ? sumDt / count : 16.67;
  const fpsAvg = Math.min(120, Math.round((1000 / avgDt) * 10) / 10);
  const fpsMin = Math.max(1, Math.round((1000 / maxDt) * 10) / 10);

  const perfMem = (performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;

  const metrics: Record<string, unknown> = {
    fps_avg: fpsAvg,
    fps_min: fpsMin,
    frame_samples: count,
    jank_frames: jankFrames,
    severe_jank_frames: severeJankFrames,
    long_tasks: longTaskCount,
    max_long_task_ms: Math.round(maxLongTaskMs * 10) / 10,
    dom_nodes: typeof document !== 'undefined' ? document.getElementsByTagName('*').length : 0,
    js_heap_used_mb: perfMem ? Math.round((perfMem.usedJSHeapSize / 1048576) * 10) / 10 : null,
    js_heap_total_mb: perfMem ? Math.round((perfMem.totalJSHeapSize / 1048576) * 10) / 10 : null,
    route: typeof window !== 'undefined' ? window.location.pathname : '/',
  };

  // Reset window counters after snapshot (ring buffer pointers reset in O(1))
  frameWriteIdx = 0;
  frameSampleCount = 0;
  jankFrames = 0;
  severeJankFrames = 0;
  longTaskCount = 0;
  maxLongTaskMs = 0;

  return metrics;
}

async function sendTelemetryPayload(
  eventType: 'performance' | 'crash',
  crash?: Record<string, unknown>
): Promise<void> {
  if (getTelemetryConsent() !== 'granted') return;
  try {
    const base = getApiBaseUrl();
    const url = `${base}/api/v1/telemetry`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_type: eventType,
        app_version: APP_VERSION,
        platform: detectPlatform(),
        device_fingerprint: getOrCreateDeviceFingerprint(),
        hardware: collectHardwareProfile(),
        metrics: collectRuntimeMetrics(),
        crash: crash ?? null,
      }),
    });
  } catch {
    // never interrupt user experience if telemetry server is unreachable
  }
}

export interface LastUiErrorSummary {
  name: string;
  message: string;
  at: string;
}

let lastUiError: LastUiErrorSummary | null = null;

export function getLastUiError(): LastUiErrorSummary | null {
  return lastUiError;
}

export function reportUiCrash(error: Error | unknown, componentStack?: string): void {
  const errObj = error instanceof Error ? error : new Error(String(error));
  const at = new Date().toISOString();
  lastUiError = {
    name: (errObj.name || 'Error').slice(0, 60),
    message: (errObj.message || 'Unknown UI crash').slice(0, 240),
    at,
  };
  void sendTelemetryPayload('crash', {
    name: errObj.name || 'Error',
    message: errObj.message || 'Unknown UI crash',
    stack: (errObj.stack || '').slice(0, 4000),
    component_stack: (componentStack || '').slice(0, 2000),
    route: typeof window !== 'undefined' ? window.location.pathname : '/',
    timestamp: at,
  });
}

export function startTelemetryEngine(): void {
  if (typeof window === 'undefined') return;
  if (getTelemetryConsent() !== 'granted') return;

  engineActive = true;

  if (!longTaskObserver && typeof PerformanceObserver !== 'undefined') {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskCount++;
          if (entry.duration > maxLongTaskMs) maxLongTaskMs = entry.duration;
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      // browser may not support longtask
    }
  }

  if (!globalErrorHandlersAttached) {
    globalErrorHandlersAttached = true;
    window.addEventListener('error', (event) => {
      reportUiCrash(event.error ?? new Error(event.message || 'Uncaught window error'));
    });
    window.addEventListener('unhandledrejection', (event) => {
      reportUiCrash(event.reason ?? new Error('Unhandled promise rejection'));
    });
  }

  if (!visibilityHandlerAttached && typeof document !== 'undefined') {
    visibilityHandlerAttached = true;
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  if (typeof document === 'undefined' || !document.hidden) {
    if (rafId === null && burstStopTimer === null && burstNextTimer === null) {
      startFrameBurst();
    }
    if (flushTimer === null && initialFlushTimer === null) {
      scheduleFlushTimers();
    }
  }
}

export function stopTelemetryEngine(): void {
  engineActive = false;
  stopFrameBurst();
  clearFlushTimers();
  if (visibilityHandlerAttached && typeof document !== 'undefined') {
    visibilityHandlerAttached = false;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
  if (longTaskObserver) {
    longTaskObserver.disconnect();
    longTaskObserver = null;
  }
}
