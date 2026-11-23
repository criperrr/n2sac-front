const SERVER_VERSION_URL = 'https://notebook-server.tailddd6bf.ts.net/version.json';
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/criperrr/n2sac/releases/latest';
const BUILD_ID_KEY = 'n2sac_update_build_id';
const OTA_VERSION_KEY = 'n2sac_update_ota_version_v2';
const NATIVE_VERSION_KEY = 'n2sac_update_native_version';
const LAST_NOTIFIED_KEY = 'n2sac_update_last_notified';

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
  const installedNativeVersion = getStored(NATIVE_VERSION_KEY) || '1.0.0';
  let available = null;

  try {
    const response = await fetch(`${SERVER_VERSION_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      const buildId = String(data.buildId || '').trim();
      const version = String(data.version || '').trim();
      const installedBuildId = getStored(BUILD_ID_KEY);
      const installedOtaVersion = getStored(OTA_VERSION_KEY);
      const hasNewBuild = buildId && installedBuildId && buildId !== installedBuildId;
      const hasNewVersion = version && compareSemver(version, installedOtaVersion || installedNativeVersion) > 0;

      if (hasNewBuild || hasNewVersion) {
        available = {
          key: `ota:${buildId || version}`,
          version: version || 'OTA',
          body: 'Uma atualização rápida do n²sac está pronta. Abra o app para atualizar.',
        };
      }
    }
  } catch {
    // Continue to check the native release feed while the OTA server is unreachable.
  }

  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (response.ok) {
      const release = await response.json();
      const version = String(release.tag_name || '').trim();
      if (version && compareSemver(version, installedNativeVersion) > 0) {
        const nativeUpdate = {
          key: `apk:${version}`,
          version,
          body: `A versão ${version} do app n²sac está disponível para download.`,
        };
        if (!available || compareSemver(nativeUpdate.version, available.version) > 0) {
          available = nativeUpdate;
        }
      }
    }
  } catch {
    // The next scheduled run retries if offline.
  }

  if (!available || getStored(LAST_NOTIFIED_KEY) === available.key) return;

  CapacitorNotifications.schedule([
    {
      id: 22002006,
      title: `Atualização ${available.version} disponível`,
      body: available.body,
      scheduleAt: new Date(Date.now() + 1000),
      group: 'n2sac-updates',
      channelId: 'n2sac-updates',
      autoCancel: true,
    },
  ]);
  setStored(LAST_NOTIFIED_KEY, available.key);
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
