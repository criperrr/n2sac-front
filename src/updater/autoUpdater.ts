import { Capacitor } from '@capacitor/core';
import { BackgroundRunner } from '@capacitor/background-runner';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getApiBaseUrl } from '../api/nsacClient';
import { APP_VERSION, formatVersionLabel } from '../appVersion';
import { showBootSplashForReload } from './bootSplash';

export const CURRENT_APP_VERSION = APP_VERSION;
const GITHUB_REPO = 'criperrr/n2sac';
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const GITHUB_RELEASES_BASE = `https://github.com/${GITHUB_REPO}/releases`;

export function githubApkDownloadUrl(version: string): string {
  const clean = version.trim().replace(/^v/i, '') || CURRENT_APP_VERSION;
  return `${GITHUB_RELEASES_BASE}/download/v${clean}/n2sac-${clean}.apk`;
}

function resolveApkUrlToGitHub(rawUrl: string | undefined, version: string): string {
  const trimmed = (rawUrl ?? '').trim();
  if (trimmed.startsWith('https://github.com/') || trimmed.startsWith('https://objects.githubusercontent.com/')) {
    return trimmed;
  }
  return githubApkDownloadUrl(version);
}
const LAST_BUILD_ID_KEY = 'n2sac_ota_build_id_v1';
// v2 key: versions stored under v1 belong to the pre-release 2.0.x numbering and must not
// outrank the restarted 1.x line.
const INSTALLED_OTA_VERSION_KEY = 'n2sac_ota_version_v2';
const BACKGROUND_RUNNER_LABEL = 'com.cti.n2sac.update-check';

export async function syncBackgroundUpdateState(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await BackgroundRunner.dispatchEvent({
      label: BACKGROUND_RUNNER_LABEL,
      event: 'syncUpdateState',
      details: {
        buildId: localStorage.getItem(LAST_BUILD_ID_KEY) ?? '',
        otaVersion: localStorage.getItem(INSTALLED_OTA_VERSION_KEY) ?? '',
        nativeVersion: getInstalledNativeVersion(),
      },
    });
  } catch {
    // Runner state is refreshed on the next app resume if background work is unavailable.
  }
}

export function getEffectiveAppVersion(): string {
  try {
    const otaVer = localStorage.getItem(INSTALLED_OTA_VERSION_KEY);
    if (otaVer && compareSemver(otaVer, CURRENT_APP_VERSION) > 0) {
      return otaVer;
    }
  } catch {
    // ignore
  }
  return CURRENT_APP_VERSION;
}

export async function initializeUpdateNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    let localPermission = await LocalNotifications.checkPermissions();
    if (localPermission.display === 'prompt') {
      localPermission = await LocalNotifications.requestPermissions();
    }
    if (localPermission.display === 'granted') {
      await LocalNotifications.createChannel({
        id: 'n2sac-updates',
        name: 'Atualizações do n²sac',
        description: 'Avisos de novas versões do aplicativo',
        importance: 3,
      });
    }

    let runnerPermission = await BackgroundRunner.checkPermissions();
    if (runnerPermission.notifications === 'prompt') {
      runnerPermission = await BackgroundRunner.requestPermissions({ apis: ['notifications'] });
    }

    await syncBackgroundUpdateState();
  } catch {
    // Notifications and background work are optional when unsupported or denied.
  }
}

export interface NativeUpdateInfo {
  version: string;
  source: 'server-ota' | 'server-apk' | 'github-release';
  downloadUrl: string;
  releaseUrl: string;
  buildId?: string;
  important?: boolean;
  apkSha256?: string;
  cachedReady?: boolean;
  notes: string;
}

export interface CachedNativeApkMeta {
  version: string;
  sha256: string;
  apkUrl?: string;
  ready: boolean;
}

interface AndroidUpdaterBridge {
  getInstalledVersion?: () => string;
  getCachedApkInfo?: () => string;
  downloadApk?: (url: string) => void;
  downloadApkWithChecksum?: (url: string, expectedSha256: string, version: string) => void;
  installDownloadedApk?: () => void;
}

function getAndroidUpdaterBridge(): AndroidUpdaterBridge | null {
  const win = window as unknown as { NsacAndroidUpdater?: AndroidUpdaterBridge };
  return win.NsacAndroidUpdater ?? null;
}

export function hasNativeApkUpdater(): boolean {
  const bridge = getAndroidUpdaterBridge();
  return Boolean(bridge?.downloadApk && bridge?.installDownloadedApk);
}

export function getInstalledNativeVersion(): string {
  const bridge = getAndroidUpdaterBridge();
  if (bridge?.getInstalledVersion) {
    try {
      const v = bridge.getInstalledVersion().trim();
      if (v) return v;
    } catch {
      // ignore
    }
  }
  // APKs released before 1.1.0 do not expose NsacAndroidUpdater.
  return Capacitor.isNativePlatform() ? '1.0.0' : CURRENT_APP_VERSION;
}

export interface ServerVersionSnapshot {
  version: string | null;
  apkVersion: string | null;
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

function isValidSha256(value: string | undefined | null): boolean {
  return Boolean(value && SHA256_HEX_RE.test(value.trim()));
}

export async function fetchLatestServerVersion(): Promise<ServerVersionSnapshot> {
  try {
    const base = getApiBaseUrl();
    const versionBase = window.location.hostname === 'localhost' ? '' : base;
    const res = await fetch(`${versionBase}/version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return { version: null, apkVersion: null };
    const data = (await res.json()) as {
      version?: string;
      apkVersion?: string;
      apkSha256?: string;
    };
    const version = (data.version ?? '').trim() || null;
    // Only report apkVersion when backed by a real published SHA-256 checksum
    // so OTA-only releases never advertise a non-existent phantom APK.
    const rawApkVersion = (data.apkVersion ?? '').trim() || null;
    const apkVersion = rawApkVersion && isValidSha256(data.apkSha256) ? rawApkVersion : null;
    return { version, apkVersion };
  } catch {
    return { version: null, apkVersion: null };
  }
}

export function getCachedNativeApkInfo(): CachedNativeApkMeta | null {
  const bridge = getAndroidUpdaterBridge();
  if (!bridge?.getCachedApkInfo) return null;
  try {
    const raw = bridge.getCachedApkInfo().trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedNativeApkMeta>;
    if (!parsed.ready || !parsed.version || !parsed.sha256) return null;
    return {
      version: parsed.version,
      sha256: parsed.sha256,
      apkUrl: parsed.apkUrl,
      ready: true,
    };
  } catch {
    return null;
  }
}

export function startNativeApkDownload(url: string, expectedSha256 = '', version = ''): boolean {
  const bridge = getAndroidUpdaterBridge();
  if (bridge?.downloadApkWithChecksum) {
    bridge.downloadApkWithChecksum(url, expectedSha256, version);
    return true;
  }
  if (!bridge?.downloadApk) return false;
  bridge.downloadApk(url);
  return true;
}

export function installNativeDownloadedApk(): boolean {
  const bridge = getAndroidUpdaterBridge();
  if (!bridge?.installDownloadedApk) return false;
  bridge.installDownloadedApk();
  return true;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function applyOtaUpdate(buildId?: string, version?: string): Promise<void> {
  try {
    if (buildId) localStorage.setItem(LAST_BUILD_ID_KEY, buildId);
    if (version) localStorage.setItem(INSTALLED_OTA_VERSION_KEY, version);
  } catch {
    // ignore
  }
  await syncBackgroundUpdateState();
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  // Download the new build while the indicator keeps running, so the reload itself is instant
  // (served from the HTTP cache) instead of a frozen screen while ~600KB of JS arrive.
  await Promise.all([prefetchNewBuild(), new Promise((resolve) => window.setTimeout(resolve, 900))]);
  // Same splash on both sides of the reload: the old page shows it now, the new one boots into it
  // (inline in index.html) and fades it out once React has rendered.
  showBootSplashForReload(version ? `Atualizando para ${formatVersionLabel(version)}` : 'Atualizando');
  await new Promise((resolve) => window.setTimeout(resolve, 280));
  window.location.reload();
}

/** Fetches the new index.html and every asset it references into the HTTP cache (best effort). */
async function prefetchNewBuild(timeoutMs = 10000): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/index.html?ota=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return;
    const html = await res.text();
    const assets = new Set<string>();
    for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) assets.add(m[1]!);
    await Promise.all([...assets].map((url) => fetch(url, { signal: controller.signal }).then((r) => r.blob()).catch(() => null)));
  } catch {
    // Offline or slow: the reload just downloads the build itself.
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Checks our own server's `/version.json` for OTA updates.
 */
export async function checkServerOtaUpdate(): Promise<NativeUpdateInfo | null> {
  try {
    const base = getApiBaseUrl();
    const versionBase = window.location.hostname === 'localhost' ? '' : base;
    const res = await fetch(`${versionBase}/version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      version?: string;
      buildId?: string;
      important?: boolean;
      apkUrl?: string;
      apkVersion?: string;
      apkSha256?: string;
      notes?: string;
    };
    const remoteVersion = (data.version ?? '').trim();
    const remoteBuildId = (data.buildId ?? '').trim();
    const prevBuildId = localStorage.getItem(LAST_BUILD_ID_KEY);

    // 1) Published native APK update distributed via GitHub Releases (Android only).
    //    Strictly requires a real 64-hex SHA-256 checksum so OTA-only deploys can never
    //    trigger a broken 404 APK download.
    if (Capacitor.isNativePlatform()) {
      const targetApkVersion = (data.apkVersion ?? '').trim();
      const apkSha256 = (data.apkSha256 ?? '').trim().toLowerCase();
      const installedNative = getInstalledNativeVersion();
      if (
        targetApkVersion &&
        isValidSha256(apkSha256) &&
        compareSemver(targetApkVersion, installedNative) > 0
      ) {
        const resolvedUrl = resolveApkUrlToGitHub(data.apkUrl, targetApkVersion);
        const releaseTag = targetApkVersion.replace(/^v/i, '');
        const cached = getCachedNativeApkInfo();
        const cachedReady = Boolean(
          cached &&
            compareSemver(cached.version, targetApkVersion) >= 0 &&
            cached.sha256.toLowerCase() === apkSha256
        );
        return {
          version: targetApkVersion,
          source: 'github-release',
          downloadUrl: resolvedUrl,
          releaseUrl: `${GITHUB_RELEASES_BASE}/tag/v${releaseTag}`,
          buildId: remoteBuildId || undefined,
          important: Boolean(data.important),
          apkSha256,
          cachedReady,
          notes:
            (data.notes ?? '').trim() ||
            'Esta atualização traz melhorias nativas importantes no aplicativo Android.',
        };
      }
    }

    // If the currently executing JS bundle is already at (or ahead of) remoteVersion,
    // silently sync LAST_BUILD_ID_KEY / INSTALLED_OTA_VERSION_KEY and never prompt again
    // for the same version (prevents infinite OTA prompts after installing a new native APK).
    if (remoteVersion.length > 0 && compareSemver(remoteVersion, CURRENT_APP_VERSION) <= 0) {
      try {
        if (remoteBuildId.length > 0) localStorage.setItem(LAST_BUILD_ID_KEY, remoteBuildId);
        localStorage.setItem(INSTALLED_OTA_VERSION_KEY, CURRENT_APP_VERSION);
      } catch {
        // ignore
      }
      return null;
    }

    // If this exact buildId was already applied/seen, sync its version and do not prompt again!
    if (remoteBuildId.length > 0 && prevBuildId === remoteBuildId) {
      if (remoteVersion.length > 0) {
        try {
          localStorage.setItem(INSTALLED_OTA_VERSION_KEY, remoteVersion);
        } catch {
          // ignore
        }
      }
      return null;
    }

    const hasNewerVersion =
      remoteVersion.length > 0 && compareSemver(remoteVersion, getEffectiveAppVersion()) > 0;

    if (hasNewerVersion) {
      return {
        version: remoteVersion || 'OTA',
        source: 'server-ota',
        downloadUrl: `${base}/`,
        releaseUrl: `${base}/`,
        buildId: remoteBuildId || undefined,
        notes: (data.notes ?? '').trim() || 'Atualização rápida disponível no servidor n²sac.',
      };
    }

    if (remoteBuildId && !prevBuildId) {
      localStorage.setItem(LAST_BUILD_ID_KEY, remoteBuildId);
    }
  } catch {
    // ignore offline / unreachable server
  }
  return null;
}

/**
 * Checks GitHub Releases for a newer native APK version (> CURRENT_APP_VERSION).
 */
export async function checkGitHubNativeRelease(): Promise<NativeUpdateInfo | null> {
  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };
    const latestTag = (data.tag_name ?? '').trim();
    const installedBaseline = Capacitor.isNativePlatform()
      ? getInstalledNativeVersion()
      : CURRENT_APP_VERSION;
    if (!latestTag || compareSemver(latestTag, installedBaseline) <= 0) {
      return null;
    }
    const apkAsset = data.assets?.find((a) => a.name?.toLowerCase().endsWith('.apk'));
    return {
      version: latestTag,
      source: 'github-release',
      downloadUrl: apkAsset?.browser_download_url ?? data.html_url ?? '',
      releaseUrl: data.html_url ?? '',
      notes: (data.body ?? '').slice(0, 200),
    };
  } catch {
    return null;
  }
}

/**
 * Checks both GitHub Releases (native APK) and Server OTA (`/version.json`).
 */
export async function checkAllUpdates(): Promise<NativeUpdateInfo | null> {
  const [ota, gh] = await Promise.all([checkServerOtaUpdate(), checkGitHubNativeRelease()]);
  const chosen = ota?.source === 'github-release' ? ota : gh ?? ota;
  const cached = getCachedNativeApkInfo();
  if (chosen) {
    if (
      chosen.source !== 'server-ota' &&
      cached &&
      compareSemver(cached.version, chosen.version) >= 0
    ) {
      return {
        ...chosen,
        apkSha256: chosen.apkSha256 ?? cached.sha256,
        cachedReady: true,
      };
    }
    return chosen;
  }
  if (cached && compareSemver(cached.version, getInstalledNativeVersion()) > 0) {
    const clean = cached.version.replace(/^v/i, '');
    return {
      version: cached.version,
      source: 'github-release',
      downloadUrl: cached.apkUrl || githubApkDownloadUrl(cached.version),
      releaseUrl: `${GITHUB_RELEASES_BASE}/tag/v${clean}`,
      important: true,
      apkSha256: cached.sha256,
      cachedReady: true,
      notes: 'A nova versão já foi baixada e verificada em segundo plano. Toque em Instalar agora.',
    };
  }
  return null;
}

export interface AndroidWebApkOffer {
  version: string;
  apkUrl: string;
  notes: string;
}

/**
 * Detects if the client is visiting from an Android mobile web browser (NOT inside the
 * installed Capacitor Android WebView APK) and returns the latest APK download offer from `/version.json`.
 */
export function isAndroidWebBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return false;
  if ('NsacAndroidUpdater' in window || 'NsacAndroidBack' in window) return false;
  const ua = navigator.userAgent || '';
  if (!/android/i.test(ua)) return false;
  // Android WebView inside an APK includes "; wv)" or "Version/4.0 Chrome/..."
  if (/;\s*wv\)/i.test(ua)) return false;
  return true;
}

export async function fetchAndroidWebApkOffer(): Promise<AndroidWebApkOffer | null> {
  if (!isAndroidWebBrowser()) return null;
  try {
    const base = getApiBaseUrl();
    const versionBase = window.location.hostname === 'localhost' ? '' : base;
    const res = await fetch(`${versionBase}/version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      version?: string;
      apkVersion?: string;
      apkUrl?: string;
      notes?: string;
    };
    const version = (data.apkVersion ?? data.version ?? CURRENT_APP_VERSION).trim() || CURRENT_APP_VERSION;
    const apkUrl = resolveApkUrlToGitHub(data.apkUrl, version);
    return {
      version,
      apkUrl,
      notes: (data.notes ?? '').trim(),
    };
  } catch {
    return {
      version: CURRENT_APP_VERSION,
      apkUrl: githubApkDownloadUrl(CURRENT_APP_VERSION),
      notes: '',
    };
  }
}
