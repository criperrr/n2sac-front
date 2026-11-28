import { installKeyboardInsets } from './platform/keyboardInsets';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { ThemeProvider } from './theme/ThemeContext';
import { TelemetryErrorBoundary } from './components/TelemetryErrorBoundary';
import { TelemetryConsentModal } from './components/TelemetryConsentModal';
import { UpdateAvailableDialog } from './components/UpdateAvailableDialog';
import { AndroidWebApkPrompt } from './components/AndroidWebApkBanner';
import {
  getTelemetryConsent,
  setTelemetryConsent,
  startTelemetryEngine,
  type TelemetryConsentState,
} from './telemetry/telemetryEngine';
import {
  checkAllUpdates,
  initializeUpdateNotifications,
  syncBackgroundUpdateState,
  type NativeUpdateInfo,
} from './updater/autoUpdater';
import './index.css';
import { installMotionTokens } from './theme/motion';
import { installContentSizeMorph } from './theme/contentSizeMorph';
import { installDiagnostics } from './telemetry/diagnostics';
import { finishBootSplash } from './updater/bootSplash';
import { registerOfflineServiceWorker } from './offline/offlineStore';

installDiagnostics();
installMotionTokens();
installKeyboardInsets();
installContentSizeMorph();
registerOfflineServiceWorker();

// Tag low-end Android devices (<= 4 CPU cores or <= 3GB RAM) so expensive full-screen
// backdrop-filter blur passes are skipped automatically for smooth 60fps scrolling.
if (typeof document !== 'undefined' && typeof navigator !== 'undefined') {
  const cores = navigator.hardwareConcurrency || 8;
  const memGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 4 || memGb <= 3) {
    document.documentElement.classList.add('n2sac-low-end');
  }
}

// If a hot deployment replaces lazy screen chunks while a user has the app open,
// reload once cleanly into the new bundle instead of throwing a dynamic import crash.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    const key = 'n2sac_chunk_reload_ts';
    const last = Number(sessionStorage.getItem(key) || '0');
    if (Date.now() - last > 10_000) {
      event.preventDefault();
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  });
}

const TelemetryBootstrap: React.FC = () => {
  const [consent, setConsent] = useState<TelemetryConsentState>(() => getTelemetryConsent());
  const [nativeUpdate, setNativeUpdate] = useState<NativeUpdateInfo | null>(null);
  const dismissedUpdateKeyRef = useRef<string | null>(null);
  const updateCheckInFlight = useRef(false);
  const lastUpdateCheckAt = useRef(0);

  const checkForUpdates = useCallback(async () => {
    const now = Date.now();
    if (updateCheckInFlight.current || now - lastUpdateCheckAt.current < 3000) return;
    updateCheckInFlight.current = true;
    lastUpdateCheckAt.current = now;
    try {
      const next = await checkAllUpdates();
      const key = next ? `${next.source}:${next.version}:${next.buildId ?? ''}` : null;
      if (key && key === dismissedUpdateKeyRef.current) {
        setNativeUpdate(null);
      } else {
        setNativeUpdate(next);
      }
      await syncBackgroundUpdateState();
    } finally {
      updateCheckInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (consent === 'granted') {
      startTelemetryEngine();
    }
  }, [consent]);

  useEffect(() => {
    const forceWebViewRepaint = () => {
      if (document.visibilityState === 'hidden') return;
      const root = document.documentElement;
      root.style.transform = 'translateZ(0)';
      window.requestAnimationFrame(() => {
        root.style.transform = '';
      });
    };
    document.addEventListener('visibilitychange', forceWebViewRepaint);
    window.addEventListener('focus', forceWebViewRepaint);
    window.addEventListener('pageshow', forceWebViewRepaint);
    return () => {
      document.removeEventListener('visibilitychange', forceWebViewRepaint);
      window.removeEventListener('focus', forceWebViewRepaint);
      window.removeEventListener('pageshow', forceWebViewRepaint);
    };
  }, []);

  useEffect(() => {
    void initializeUpdateNotifications();
    void checkForUpdates();
    let disposed = false;
    let appStateListener: { remove: () => Promise<void> } | undefined;

    const onResume = () => {
      if (document.visibilityState === 'visible') void checkForUpdates();
    };
    const onAppStateChange = ({ isActive }: { isActive: boolean }) => {
      if (isActive) void checkForUpdates();
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('focus', onResume);
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', onAppStateChange).then((handle) => {
        if (disposed) void handle.remove();
        else appStateListener = handle;
      });
    }

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('focus', onResume);
      if (appStateListener) void appStateListener.remove();
    };
  }, [checkForUpdates]);

  return (
    <>
      {consent === 'undecided' && (
        <TelemetryConsentModal
          onDecide={(granted) => {
            const next: TelemetryConsentState = granted ? 'granted' : 'denied';
            setTelemetryConsent(next);
            setConsent(next);
          }}
        />
      )}
      {nativeUpdate && (
        <UpdateAvailableDialog
          update={nativeUpdate}
          onDismiss={() => {
            dismissedUpdateKeyRef.current = `${nativeUpdate.source}:${nativeUpdate.version}:${nativeUpdate.buildId ?? ''}`;
            setNativeUpdate(null);
          }}
        />
      )}
      <AndroidWebApkPrompt />
    </>
  );
};

/** Runs after the app's first commit: hands over from the boot splash (native Android + OTA reload). */
const BootSplashHandoff: React.FC = () => {
  useEffect(() => {
    let f2 = 0;
    const f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => {
        finishBootSplash();
        try {
          (window as unknown as { NsacAndroidSplash?: { onAppReady?: () => void } })
            .NsacAndroidSplash?.onAppReady?.();
        } catch {
          // ignore non-Android environments
        }
      });
    });
    return () => {
      cancelAnimationFrame(f1);
      if (f2) cancelAnimationFrame(f2);
    };
  }, []);
  return null;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TelemetryErrorBoundary>
      <ThemeProvider>
        <App />
        <TelemetryBootstrap />
        <BootSplashHandoff />
      </ThemeProvider>
    </TelemetryErrorBoundary>
  </React.StrictMode>
);
