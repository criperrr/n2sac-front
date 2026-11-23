#!/usr/bin/env bash
set -euo pipefail
set +x

# Safely instantiates all GitHub Actions secrets required by .github/workflows/build-apk.yml
# on criperrr/n2sac using `gh secret set` without ever printing secret values to stdout/stderr.

REPO="${N2SAC_REPO:-criperrr/n2sac}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE_FILE="${N2SAC_KEYSTORE_PATH:-${ROOT_DIR}/secrets/n2sac-production-release.jks}"
KEYSTORE_PROPS="${N2SAC_KEYSTORE_PROPS:-${ROOT_DIR}/secrets/keystore.properties}"
GOOGLE_SERVICES_FILE="${N2SAC_GOOGLE_SERVICES_JSON:-${ROOT_DIR}/android/app/google-services.json}"

if ! command -v gh >/dev/null 2>&1; then
  echo "[setup-secrets] ERROR: gh CLI not found." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "[setup-secrets] ERROR: gh CLI is not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

if [ ! -f "${KEYSTORE_FILE}" ]; then
  echo "[setup-secrets] ERROR: Production keystore not found at ${KEYSTORE_FILE}" >&2
  exit 1
fi

if [ ! -f "${GOOGLE_SERVICES_FILE}" ]; then
  echo "[setup-secrets] ERROR: google-services.json not found at ${GOOGLE_SERVICES_FILE}" >&2
  exit 1
fi

read_prop() {
  local key="$1"
  if [ -f "${KEYSTORE_PROPS}" ]; then
    awk -F= -v k="${key}" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "${KEYSTORE_PROPS}"
  fi
}

KEYSTORE_PASS="${N2SAC_KEYSTORE_PASSWORD:-$(read_prop storePassword)}"
KEY_ALIAS="${N2SAC_KEY_ALIAS:-$(read_prop keyAlias)}"
KEY_PASS="${N2SAC_KEY_PASSWORD:-$(read_prop keyPassword)}"

if [ -z "${KEY_ALIAS}" ]; then
  KEY_ALIAS="n2sac_release"
fi

if [ -z "${KEYSTORE_PASS}" ]; then
  read -r -s -p "Keystore password (hidden): " KEYSTORE_PASS
  echo ""
fi

if [ -z "${KEY_PASS}" ]; then
  read -r -s -p "Key password (hidden, Enter = same as keystore): " KEY_PASS
  echo ""
  KEY_PASS="${KEY_PASS:-${KEYSTORE_PASS}}"
fi

if [ -z "${KEYSTORE_PASS}" ] || [ -z "${KEY_PASS}" ]; then
  echo "[setup-secrets] ERROR: Keystore/key passwords cannot be empty." >&2
  exit 1
fi

echo "[setup-secrets] Uploading ANDROID_KEYSTORE_BASE64 to ${REPO}..."
base64 -w 0 < "${KEYSTORE_FILE}" | gh secret set ANDROID_KEYSTORE_BASE64 --repo "${REPO}"

echo "[setup-secrets] Uploading ANDROID_GOOGLE_SERVICES_JSON_BASE64 to ${REPO}..."
base64 -w 0 < "${GOOGLE_SERVICES_FILE}" | gh secret set ANDROID_GOOGLE_SERVICES_JSON_BASE64 --repo "${REPO}"

echo "[setup-secrets] Uploading ANDROID_KEY_ALIAS, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_PASSWORD to ${REPO}..."
printf '%s' "${KEY_ALIAS}" | gh secret set ANDROID_KEY_ALIAS --repo "${REPO}"
printf '%s' "${KEYSTORE_PASS}" | gh secret set ANDROID_KEYSTORE_PASSWORD --repo "${REPO}"
printf '%s' "${KEY_PASS}" | gh secret set ANDROID_KEY_PASSWORD --repo "${REPO}"

unset KEYSTORE_PASS KEY_PASS

echo ""
echo "[setup-secrets] Active secrets in ${REPO} (names only):"
gh secret list --repo "${REPO}"
