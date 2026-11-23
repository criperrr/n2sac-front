#!/usr/bin/env bash
set -euo pipefail
set +x

# Installs and registers an official GitHub Actions self-hosted runner on the n²sac server
# (100.69.91.121) for criperrr/n2sac using a rootless systemd --user service, and builds
# the n2sac-android-builder:latest Docker image directly on the server.
# The runner connects outbound via HTTPS to GitHub (no inbound ports opened) and receives
# signing secrets ephemerally per job.

REPO="${N2SAC_REPO:-criperrr/n2sac}"
REMOTE_USER="${N2SAC_USER:-criper}"
REMOTE_HOST="${N2SAC_HOST:-100.69.91.121}"
RUNNER_DIR="${N2SAC_RUNNER_DIR:-\$HOME/actions-runner-n2sac}"
RUNNER_NAME="${N2SAC_RUNNER_NAME:-n2sac-notebook-server}"
RUNNER_LABELS="self-hosted,linux,x64,n2sac-builder"
SERVICE_NAME="n2sac-github-runner.service"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[setup-runner] 1/3 Building n2sac-android-builder:latest on ${REMOTE_USER}@${REMOTE_HOST}..."
ssh "${REMOTE_USER}@${REMOTE_HOST}" "rm -rf /tmp/n2sac-builder-ctx && mkdir -p /tmp/n2sac-builder-ctx"
scp -q "${ROOT_DIR}/Dockerfile.android-builder" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/n2sac-builder-ctx/Dockerfile"
ssh "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  docker build --network=host -t n2sac-android-builder:latest /tmp/n2sac-builder-ctx
  rm -rf /tmp/n2sac-builder-ctx
"

echo "[setup-runner] 2/3 Requesting ephemeral GitHub Actions registration token for ${REPO}..."
REG_TOKEN="$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "gh api -X POST 'repos/${REPO}/actions/runners/registration-token' --jq '.token'")"
if [ -z "${REG_TOKEN}" ]; then
  echo "[setup-runner] ERROR: Failed to obtain runner registration token." >&2
  exit 1
fi

RUNNER_VERSION="$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | node -e 'const d=JSON.parse(require(\"fs\").readFileSync(0,\"utf8\")); console.log((d.tag_name||\"\").replace(/^v/,\"\"))'")"
if [ -z "${RUNNER_VERSION}" ]; then
  echo "[setup-runner] ERROR: Could not resolve latest actions/runner version." >&2
  exit 1
fi

echo "[setup-runner] 3/3 Installing actions/runner v${RUNNER_VERSION} on ${REMOTE_USER}@${REMOTE_HOST}..."
# Pass the ephemeral registration token over stdin (never in process args or logs).
printf '%s\n' "${REG_TOKEN}" | ssh "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  IFS= read -r TOKEN
  TARGET_DIR=\"${RUNNER_DIR}\"
  mkdir -p \"\${TARGET_DIR}\" \"\$HOME/.config/systemd/user\"
  cd \"\${TARGET_DIR}\"

  systemctl --user stop '${SERVICE_NAME}' 2>/dev/null || true

  if [ ! -x ./config.sh ]; then
    TARBALL=\"actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz\"
    curl -fsSL -o \"\${TARBALL}\" \"https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/\${TARBALL}\"
    tar xzf \"\${TARBALL}\"
    rm -f \"\${TARBALL}\"
  fi

  if [ -f .runner ]; then
    ./config.sh remove --token \"\${TOKEN}\" || true
  fi

  ./config.sh --unattended \
    --url 'https://github.com/${REPO}' \
    --token \"\${TOKEN}\" \
    --name '${RUNNER_NAME}' \
    --labels '${RUNNER_LABELS}' \
    --replace
  unset TOKEN

  cat > \"\$HOME/.config/systemd/user/${SERVICE_NAME}\" <<UNIT
[Unit]
Description=GitHub Actions Self-Hosted Runner (${REPO})
After=network-online.target docker.service

[Service]
Type=simple
WorkingDirectory=\${TARGET_DIR}
ExecStart=\${TARGET_DIR}/run.sh
Restart=always
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=default.target
UNIT

  systemctl --user daemon-reload
  systemctl --user enable --now '${SERVICE_NAME}'
  sleep 3
  systemctl --user is-active '${SERVICE_NAME}'
  echo '=== GITHUB API RUNNERS ==='
  gh api 'repos/${REPO}/actions/runners' --jq '.runners[] | {name, status, busy, labels: [.labels[].name]}'
"
unset REG_TOKEN

echo "[setup-runner] Done! Runner '${RUNNER_NAME}' is online for ${REPO}."
