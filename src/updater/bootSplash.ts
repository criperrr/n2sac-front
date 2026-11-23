import { shapePaths } from '../components/expressive/ShapeMorph';

/**
 * Boot splash shared by the old and the new page across an OTA reload. The splash itself lives
 * inline in `index.html` (no bundle needed, so it paints before the new JS even downloads); this
 * module only hands it the payload through sessionStorage and toggles it.
 */

const STORAGE_KEY = 'n2sac_boot_splash';

export interface BootSplashPayload {
  at: number;
  label: string;
  bg: string;
  container: string;
  onContainer: string;
  fg: string;
  paths: string[];
}

type BootWindow = Window & {
  __n2sacShowBoot?: (payload: BootSplashPayload) => void;
  __n2sacBootDone?: () => void;
};

const cssVar = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** Stores the payload for the next page load and shows the same splash on this page now. */
export function showBootSplashForReload(label: string): void {
  const payload: BootSplashPayload = {
    at: Date.now(),
    label,
    bg: cssVar('--m3-background', '#0d0d0d'),
    container: cssVar('--m3-primary-container', '#1f3b30'),
    onContainer: cssVar('--m3-on-primary-container', '#b8f0d2'),
    fg: cssVar('--m3-on-surface-variant', '#c4c7c5'),
    paths: shapePaths(33),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Without storage the new page simply boots without the splash.
  }
  (window as BootWindow).__n2sacShowBoot?.(payload);
}

/** Fades the splash out once the app has rendered (no-op when it is not showing). */
export function finishBootSplash(): void {
  (window as BootWindow).__n2sacBootDone?.();
}
