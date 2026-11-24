#!/usr/bin/env bash
# =============================================================================
# dev-android-install.sh — AI-Agent-Friendly Android Debug Build & ADB Installer
# =============================================================================
# Auto-detects USB or Wi-Fi (mDNS / IP:port) ADB devices, builds the Android
# debug APK (and optionally web bundle / Capacitor sync), restores dev-local
# reverse ports (4173 & 18080), installs via ADB, and launches com.cti.n2sac.
#
# Usage:
#   ./scripts/dev-android-install.sh [options]
#
# Options:
#   --web             Run `npx tsc -b && npm run build` before Gradle
#   --sync            Run `npx cap sync android` before Gradle
#   --no-build        Skip Gradle build (install existing app-debug.apk)
#   --no-reverse      Skip `adb reverse` for ports 4173 and 18080
#   --no-launch       Skip force-stop and app launch after install
#   --serial <id>     Pin a specific ADB device serial (or set ADB_SERIAL)
#   -h, --help        Show this help
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$FRONT_DIR/android"
APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
APP_ID="com.cti.n2sac"

DO_WEB=0
DO_SYNC=0
DO_BUILD=1
DO_REVERSE=1
DO_LAUNCH=1
SERIAL="${ADB_SERIAL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web)        DO_WEB=1; shift ;;
    --sync)       DO_SYNC=1; shift ;;
    --no-build)   DO_BUILD=0; shift ;;
    --no-reverse) DO_REVERSE=0; shift ;;
    --no-launch)  DO_LAUNCH=0; shift ;;
    --serial)     SERIAL="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

# 1. Locate ADB binary
find_adb() {
  if command -v adb >/dev/null 2>&1; then
    command -v adb
  elif [[ -n "${ANDROID_HOME:-}" && -x "$ANDROID_HOME/platform-tools/adb" ]]; then
    echo "$ANDROID_HOME/platform-tools/adb"
  elif [[ -x "$HOME/.android/sdk/platform-tools/adb" ]]; then
    echo "$HOME/.android/sdk/platform-tools/adb"
  else
    echo "[ERROR] adb binary not found in PATH, ANDROID_HOME, or ~/.android/sdk/platform-tools" >&2
    exit 1
  fi
}

ADB="$(find_adb)"

# 2. Pick best responsive online ADB device (USB > mDNS TLS Wi-Fi > IP:port Wi-Fi > Emulator)
pick_device() {
  if [[ -n "$SERIAL" ]]; then
    echo "$SERIAL"
    return 0
  fi

  local online
  online="$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}')"
  if [[ -z "$online" ]]; then
    echo "[ERROR] No online ADB device found. Connect via USB or enable Wireless Debugging." >&2
    "$ADB" devices >&2
    exit 1
  fi

  # Build priority-ordered candidate list
  local candidates=()
  local line
  while IFS= read -r line; do [[ -n "$line" ]] && candidates+=("$line"); done < <(echo "$online" | grep -vE '(:|emulator-|\._adb-tls-connect\._tcp)' || true)
  while IFS= read -r line; do [[ -n "$line" ]] && candidates+=("$line"); done < <(echo "$online" | grep '\._adb-tls-connect\._tcp' || true)
  while IFS= read -r line; do [[ -n "$line" ]] && candidates+=("$line"); done < <(echo "$online" | grep ':' || true)
  while IFS= read -r line; do [[ -n "$line" ]] && candidates+=("$line"); done < <(echo "$online" | grep '^emulator-' || true)

  # Probe each candidate with a 3s timeout so stale Wi-Fi transports are skipped automatically
  local d
  for d in "${candidates[@]}"; do
    if timeout 3 "$ADB" -s "$d" shell echo ok >/dev/null 2>&1; then
      echo "$d"
      return 0
    fi
  done

  echo "[ERROR] Found ADB devices but none responded to shell probe within 3s:" >&2
  "$ADB" devices >&2
  exit 1
}

DEV="$(pick_device)"
echo "[ADB] Target device: $DEV"

# 3. Optional web build & Capacitor sync
if [[ "$DO_WEB" -eq 1 ]]; then
  echo "[WEB] Running tsc + vite build..."
  (cd "$FRONT_DIR" && npx tsc -b && npm run build)
fi

if [[ "$DO_SYNC" -eq 1 ]]; then
  echo "[CAP] Syncing Android project..."
  (cd "$FRONT_DIR" && npx cap sync android)
fi

# 4. Build debug APK with JDK 17 if available (avoids JDK 25 Gradle failure)
if [[ "$DO_BUILD" -eq 1 ]]; then
  if [[ -d /usr/lib/jvm/java-17-openjdk ]]; then
    export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
  fi
  echo "[GRADLE] Building assembleDebug (JAVA_HOME=${JAVA_HOME:-default})..."
  (cd "$ANDROID_DIR" && ./gradlew assembleDebug --console=plain --quiet)
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "[ERROR] APK not found at $APK_PATH" >&2
  exit 1
fi

# 5. Restore dev-local reverse ports (non-fatal if device doesn't need them)
if [[ "$DO_REVERSE" -eq 1 ]]; then
  "$ADB" -s "$DEV" reverse tcp:4173 tcp:4173 >/dev/null && \
  "$ADB" -s "$DEV" reverse tcp:18080 tcp:18080 >/dev/null && \
  echo "[ADB] Reverse ports active: 4173, 18080" || \
  echo "[WARN] Failed to set adb reverse ports" >&2
fi

# 6. Install APK
echo "[ADB] Installing $APK_PATH..."
"$ADB" -s "$DEV" install -r "$APK_PATH"

# 7. Force-stop and launch
if [[ "$DO_LAUNCH" -eq 1 ]]; then
  "$ADB" -s "$DEV" shell am force-stop "$APP_ID"
  "$ADB" -s "$DEV" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  echo "[OK] Installed and launched $APP_ID on $DEV"
else
  echo "[OK] Installed $APP_ID on $DEV (launch skipped)"
fi
