const SERVER_VERSION_URL = 'https://notebook-server.tailddd6bf.ts.net/version.json';
const BUILD_ID_KEY = 'n2sac_update_build_id';
const OTA_VERSION_KEY = 'n2sac_update_ota_version_v2';
const NATIVE_VERSION_KEY = 'n2sac_update_native_version';
const LAST_NOTIFIED_KEY = 'n2sac_update_last_notified';
const SHA256_RE = /^[0-9a-f]{64}$/i;

function compareSemver(a, b) {
  const left = String(a || '').replace(/^v/i, '').split('.').map((part) => parseInt(part, 10) || 0);
  const right = String(b || '').replace(/^v/i, '').split('.').map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function getStored(key) {
  try {
    return CapacitorKV.get(key).value || '';
  } catch {
    return '';
  }
}

function setStored(key, value) {
  try {
    CapacitorKV.set(key, String(value || ''));
  } catch {
    // Ignore storage errors and retry on the next background run.
  }
}

async function checkForUpdates() {
  const installedNativeVersion = getStored(NATIVE_VERSION_KEY);
  // Invariant B2: never default to '1.0.0' before foreground sync populates CapacitorKV.
  if (!installedNativeVersion) return;

  const installedBuildId = getStored(BUILD_ID_KEY);
  const installedOtaVersion = getStored(OTA_VERSION_KEY) || installedNativeVersion;

  try {
    const response = await fetch(`${SERVER_VERSION_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const data = await response.json();
    const remoteVersion = String(data.version || '').trim();
    const remoteBuildId = String(data.buildId || '').trim();
    const remoteApkVersion = String(data.apkVersion || '').trim();
    const remoteApkSha256 = String(data.apkSha256 || '').trim();

    const semverCmp = remoteVersion ? compareSemver(remoteVersion, installedOtaVersion) : -1;
    const hasWebOta =
      semverCmp > 0 ||
      (semverCmp === 0 &&
        installedBuildId &&
        installedBuildId !== 'dev' &&
        remoteBuildId &&
        remoteBuildId !== installedBuildId);

    const hasApkUpdate =
      Boolean(remoteApkVersion) &&
      SHA256_RE.test(remoteApkSha256) &&
      compareSemver(remoteApkVersion, installedNativeVersion) > 0;

    if (!hasWebOta && !hasApkUpdate) return;

    const dedupKey = `${remoteVersion}:${remoteBuildId}:${remoteApkVersion}`;
    if (getStored(LAST_NOTIFIED_KEY) === dedupKey) return;

    const displayVersion = hasApkUpdate ? remoteApkVersion : (remoteVersion || 'OTA');
    const body = hasApkUpdate
      ? `A versão ${remoteApkVersion} do app n²sac está disponível para atualização.`
      : 'Uma atualização rápida do n²sac está pronta. Abra o app para atualizar.';

    CapacitorNotifications.schedule([
      {
        id: 22002006,
        title: `Atualização ${displayVersion} disponível`,
        body,
        scheduleAt: new Date(Date.now() + 1000),
        group: 'n2sac-updates',
        channelId: 'n2sac-updates',
        autoCancel: true,
      },
    ]);
    setStored(LAST_NOTIFIED_KEY, dedupKey);
  } catch {
    // Offline or unreachable: retry on next scheduled run.
  }
}

addEventListener('syncUpdateState', (_resolve, _reject, args) => {
  try {
    const details = args || {};
    if (details.buildId) setStored(BUILD_ID_KEY, details.buildId);
    if (details.otaVersion) setStored(OTA_VERSION_KEY, details.otaVersion);
    if (details.nativeVersion) setStored(NATIVE_VERSION_KEY, details.nativeVersion);
    _resolve();
  } catch (error) {
    _reject(error);
  }
});

addEventListener('checkForUpdates', (resolve, reject) => {
  void checkForUpdates().then(resolve).catch(reject);
});
