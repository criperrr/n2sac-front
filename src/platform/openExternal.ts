import { Capacitor } from '@capacitor/core';

type OpenBridge = { openExternal?: (url: string) => boolean };

/**
 * Opens a URL in the system browser (e.g. a ficha PDF to print).
 * - Android APK ≥ 1.2.0: native `NsacAndroidOpen` bridge (Capacitor would keep same-host URLs
 *   inside the WebView, which can't show PDFs).
 * - Older APKs: no safe way (navigating the WebView would leave the app) → `needs-apk-update`.
 * - Web: the tab opened synchronously by the click (`preopened`, avoids popup blockers).
 */
export function openExternalUrl(
  url: string,
  preopened: Window | null = null
): 'opened' | 'needs-apk-update' {
  const bridge = (window as unknown as { NsacAndroidOpen?: OpenBridge }).NsacAndroidOpen;
  if (bridge?.openExternal) {
    bridge.openExternal(url);
    return 'opened';
  }
  if (Capacitor.isNativePlatform()) return 'needs-apk-update';
  if (preopened && !preopened.closed) {
    preopened.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return 'opened';
}

/** On the web, open the tab during the click so the later (async) navigation isn't blocked. */
export function preopenTabForWeb(): Window | null {
  if (Capacitor.isNativePlatform()) return null;
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  return tab;
}
