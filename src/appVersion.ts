/**
 * Single source of truth for the web/OTA bundle version: injected at build time
 * directly from `package.json` by `vite.config.ts` (`__APP_VERSION__`).
 *
 * Native Android APK version is tracked independently via `PackageManager`
 * (`getInstalledNativeVersion()` in `src/updater/autoUpdater.ts`).
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim() ? __APP_VERSION__.trim() : '0.0.0';

/** Human label: `n²sac v1` for x.0.0, otherwise the full number (`n²sac v1.0.3`). */
export function formatVersionLabel(version: string = APP_VERSION): string {
  if (!/^v?\d/i.test(version)) return `n²sac ${version}`;
  const [major = '0', minor = '0', patch = '0'] = version.replace(/^v/i, '').split('.');
  const short = minor === '0' && patch === '0' ? major : `${major}.${minor}.${patch}`;
  return `n²sac v${short}`;
}
