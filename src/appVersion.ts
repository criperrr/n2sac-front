/**
 * Single source of truth for the app version (keep in sync with `package.json`,
 * `android/app/build.gradle` versionName and the OTA `public/version.json`).
 *
 * Numbering restarted at 1.0.0 for the first stable release ("n²sac v1");
 * pre-release builds used 2.0.x.
 */
export const APP_VERSION = '1.6.4';

/** Human label: `n²sac v1` for x.0.0, otherwise the full number (`n²sac v1.0.3`). */
export function formatVersionLabel(version: string = APP_VERSION): string {
  if (!/^v?\d/i.test(version)) return `n²sac ${version}`;
  const [major = '0', minor = '0', patch = '0'] = version.replace(/^v/i, '').split('.');
  const short = minor === '0' && patch === '0' ? major : `${major}.${minor}.${patch}`;
  return `n²sac v${short}`;
}
