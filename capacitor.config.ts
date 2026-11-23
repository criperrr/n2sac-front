import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.N2SAC_DEV_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.cti.n2sac',
  appName: 'n²sac',
  webDir: 'dist',
  // N2SAC_DEV_SERVER_URL (e.g. http://localhost:4173 + `adb reverse`) builds a test APK that loads
  // an unpublished local build. Release builds must be synced without it.
  server: devServerUrl
    ? { url: devServerUrl, androidScheme: 'https', cleartext: true }
    : {
        url: 'https://notebook-server.tailddd6bf.ts.net',
        androidScheme: 'https',
        cleartext: false,
      },
  // Test builds against a local dev server can be inspected with chrome://inspect.
  ...(devServerUrl ? { android: { webContentsDebuggingEnabled: true } } : {}),
  plugins: {
    // Back is owned by MainActivity's predictive back callback + the web back stack.
    // Capacitor's always-enabled handler would swallow every back gesture and block
    // the system back-to-home animation.
    App: {
      disableBackButtonHandler: true,
    },
    BackgroundRunner: {
      label: 'com.cti.n2sac.update-check',
      src: 'runners/update-check.js',
      event: 'checkForUpdates',
      repeat: true,
      interval: 60,
      autoStart: true,
    },
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0D0D0D',
      showSpinner: false,
    },
  },
};

export default config;
