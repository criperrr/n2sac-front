#!/usr/bin/env bash
# Image-only web OTA deploy for n²sac (zero source rsync to remote server).
# Stamps public/version.json, builds dist/ and n2sac-web:latest locally,
# streams the image via SSH, and restarts only the web container (--no-build).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_USER="${N2SAC_USER:-criper}"
REMOTE_HOST="${N2SAC_HOST:-100.69.91.121}"
REMOTE_DIR="${N2SAC_REMOTE_DIR:-/opt/n2sac}"
VERSION_JSON="${ROOT_DIR}/public/version.json"
DRY_RUN="false"

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN="true"
fi

if [ "${DRY_RUN}" = "true" ]; then
  echo "[deploy-web] DRY-RUN: verifying Dockerfile, package.json, and remote compose (${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR})..."
  test -f "${ROOT_DIR}/Dockerfile"
  test -f "${ROOT_DIR}/package.json"
  ssh -T -o BatchMode=yes -o LogLevel=ERROR "${REMOTE_USER}@${REMOTE_HOST}" \
    "cd '${REMOTE_DIR}' && docker compose --dry-run up -d --no-deps --no-build web"
  echo "[deploy-web] DRY-RUN OK (zero source rsync, image-only deploy)."
  exit 0
fi

APP_VERSION="${N2SAC_VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}"
BUILD_ID="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "[deploy-web] Stamping OTA version ${APP_VERSION} (${BUILD_ID}) in public/version.json (preserving optional metadata)..."
VERSION_JSON_PATH="${VERSION_JSON}" \
STAMP_VERSION="${APP_VERSION}" \
STAMP_BUILD_ID="${BUILD_ID}" \
node -e '
const fs = require("fs");
const p = process.env.VERSION_JSON_PATH;
let existing = {};
try {
  if (fs.existsSync(p)) {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed;
    }
  }
} catch {
  existing = {};
}

const next = {
  ...existing,
  version: process.env.STAMP_VERSION,
  buildId: process.env.STAMP_BUILD_ID,
  channel: process.env.N2SAC_CHANNEL || existing.channel || "ota",
};

if (process.env.N2SAC_APK_VERSION !== undefined) {
  if (process.env.N2SAC_APK_VERSION) next.apkVersion = process.env.N2SAC_APK_VERSION;
  else delete next.apkVersion;
}
if (process.env.N2SAC_APK_URL !== undefined) {
  if (process.env.N2SAC_APK_URL) next.apkUrl = process.env.N2SAC_APK_URL;
  else delete next.apkUrl;
}
if (process.env.N2SAC_IMPORTANT !== undefined) {
  if (process.env.N2SAC_IMPORTANT === "true" || process.env.N2SAC_IMPORTANT === "1") next.important = true;
  else if (process.env.N2SAC_IMPORTANT === "false" || process.env.N2SAC_IMPORTANT === "0") next.important = false;
  else delete next.important;
}
if (process.env.N2SAC_NOTES !== undefined) {
  if (process.env.N2SAC_NOTES) next.notes = process.env.N2SAC_NOTES;
  else delete next.notes;
}

fs.writeFileSync(p, JSON.stringify(next, null, 2) + "\n", "utf8");
'

echo "[deploy-web] Cleaning dist and running full local build (tsc -b && vite build)..."
rm -rf "${ROOT_DIR}/dist"
(cd "${ROOT_DIR}" && npm run build)

if [ ! -f "${ROOT_DIR}/dist/index.html" ]; then
  echo "[deploy-web] ERROR: dist/index.html missing after build." >&2
  exit 1
fi

echo "[deploy-web] Building n2sac-web:latest locally (fast BuildKit)..."
docker build -f "${ROOT_DIR}/Dockerfile" -t n2sac-web:latest "${ROOT_DIR}"

echo "[deploy-web] Streaming pre-built n2sac-web:latest to ${REMOTE_USER}@${REMOTE_HOST} (no source rsync)..."
docker save n2sac-web:latest | gzip | ssh -T -o LogLevel=ERROR "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  gunzip | docker load
  rm -rf /tmp/n2sac-downloads-backup /tmp/n2sac-prev-assets
  docker cp n2sac-web:/usr/share/nginx/html/downloads /tmp/n2sac-downloads-backup 2>/dev/null || true
  docker cp n2sac-web:/usr/share/nginx/html/assets /tmp/n2sac-prev-assets 2>/dev/null || true
  cd '${REMOTE_DIR}'
  docker compose up -d --no-deps --no-build web
  if [ -d /tmp/n2sac-prev-assets ]; then
    docker cp /tmp/n2sac-prev-assets/. n2sac-web:/usr/share/nginx/html/assets/ 2>/dev/null || true
    rm -rf /tmp/n2sac-prev-assets
  fi
  if [ -d /tmp/n2sac-downloads-backup ]; then
    docker cp /tmp/n2sac-downloads-backup n2sac-web:/usr/share/nginx/html/downloads
    rm -rf /tmp/n2sac-downloads-backup
  fi
"

echo "[deploy-web] Verifying /version.json..."
curl -fsS "http://${REMOTE_HOST}:8080/version.json" && echo ""
echo "[deploy-web] Done! Web live at http://${REMOTE_HOST}:8080"
