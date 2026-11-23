#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAVA17_HOME="${JAVA_HOME_17:-/usr/lib/jvm/java-17-openjdk}"
APK_OUT="${ROOT_DIR}/android/app/build/outputs/apk/release/app-release.apk"

echo "[build-apk] Building Vite web bundle..."
(cd "${ROOT_DIR}" && npm run build && unset N2SAC_DEV_SERVER_URL && npx cap sync android)

echo "[build-apk] Compiling signed Android Release APK (v2/v3 signature, debuggable=false) with Java 17..."
(cd "${ROOT_DIR}/android" && JAVA_HOME="${JAVA17_HOME}" ./gradlew assembleRelease)

if command -v adb >/dev/null 2>&1 && adb get-state >/dev/null 2>&1; then
  echo "[build-apk] Installing Release APK via adb..."
  adb install -r "${APK_OUT}"
  echo "[build-apk] Installed successfully!"
else
  echo "[build-apk] Release APK ready at ${APK_OUT} (no adb device connected)"
fi
