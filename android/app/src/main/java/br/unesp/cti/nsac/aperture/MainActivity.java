package br.unesp.cti.nsac.aperture;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.BackEventCompat;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;

public class MainActivity extends BridgeActivity {

    /**
     * Predictive back bridge. Enabled by the web app only while its back stack is non-empty
     * (open popup, pushed page, non-start tab...). While disabled, the system handles back and
     * plays its own back-to-home animation. While enabled, every gesture phase is forwarded to
     * the WebView as an `nsac:back` event so the page can run the in-app preview animation.
     */
    private OnBackPressedCallback predictiveBackCallback;
    /** Pending notification tap payload JSON captured on cold/warm start until WebView consumes it. */
    private volatile String pendingPushIntentJson = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_NOSENSOR);
        ensureHighPriorityNotificationChannels();
        attachPredictiveBackBridge();
        attachThemeBridge();
        attachApkUpdaterBridge();
        attachExternalOpenBridge();
        attachKeyboardInsetsBridge();
        attachPushIntentBridge();
        extractPushIntentData(getIntent(), false);
        syncAospDynamicColorsToWebView();
        ApkPreloadJobService.schedule(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        extractPushIntentData(intent, true);
    }

    /**
     * Creates Android 8+ NotificationChannels natively at app startup with valid system sound URIs
     * and IMPORTANCE_HIGH for grades & class announcements, and removes legacy channels that had
     * an unresolvable Capacitor res/raw/default sound URI.
     */
    private void ensureHighPriorityNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        String[] legacyIds = new String[] {
            "n2sac-grades",
            "n2sac-social-messages",
            "n2sac-social-friends",
            "n2sac-social-follows"
        };
        for (String legacy : legacyIds) {
            try {
                nm.deleteNotificationChannel(legacy);
            } catch (Exception ignored) {
                // ignore
            }
        }

        Uri defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audioAttrs = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();

        createNativeChannel(
            nm, "n2sac-grades-v2", "Notas do NSAC",
            "Avisos de alta prioridade quando novas notas são lançadas",
            NotificationManager.IMPORTANCE_HIGH, true, defaultSound, audioAttrs
        );
        createNativeChannel(
            nm, "n2sac-announcements-v1", "Anúncios da Turma",
            "Avisos oficiais de alta prioridade dos representantes de classe",
            NotificationManager.IMPORTANCE_HIGH, true, defaultSound, audioAttrs
        );
        createNativeChannel(
            nm, "n2sac-social-messages-v2", "Mensagens de amigos",
            "Avisos de novas mensagens recebidas no chat privado",
            NotificationManager.IMPORTANCE_HIGH, true, defaultSound, audioAttrs
        );
        createNativeChannel(
            nm, "n2sac-social-friends-v2", "Amizades conquistadas",
            "Avisos quando uma nova amizade mútua é formada",
            NotificationManager.IMPORTANCE_HIGH, true, defaultSound, audioAttrs
        );
        createNativeChannel(
            nm, "n2sac-social-follows-v2", "Novos seguidores",
            "Avisos quando alguém segue você ou envia solicitação",
            NotificationManager.IMPORTANCE_HIGH, true, defaultSound, audioAttrs
        );
        createNativeChannel(
            nm, "n2sac-room-chat-v1", "Chat da Turma",
            "Mensagens e respostas no chat da sua turma",
            NotificationManager.IMPORTANCE_DEFAULT, true, defaultSound, audioAttrs
        );
        createNativeChannel(
            nm, "n2sac-room-offtopic-v1", "Chat Off-Topic",
            "Conversas livres no canal off-topic da turma",
            NotificationManager.IMPORTANCE_LOW, false, null, null
        );
    }

    private void createNativeChannel(
        NotificationManager nm,
        String id,
        String name,
        String description,
        int importance,
        boolean vibrate,
        Uri soundUri,
        AudioAttributes audioAttrs
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(id, name, importance);
        ch.setDescription(description);
        ch.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        ch.enableVibration(vibrate);
        ch.enableLights(importance >= NotificationManager.IMPORTANCE_HIGH);
        if (soundUri != null && audioAttrs != null) {
            ch.setSound(soundUri, audioAttrs);
        }
        nm.createNotificationChannel(ch);
    }

    @Override
    public void onResume() {
        super.onResume();
        syncAospDynamicColorsToWebView();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        syncAospDynamicColorsToWebView();
    }

    private void attachPredictiveBackBridge() {
        predictiveBackCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackStarted(@NonNull BackEventCompat backEvent) {
                dispatchBackEvent("start", backEvent);
            }

            @Override
            public void handleOnBackProgressed(@NonNull BackEventCompat backEvent) {
                dispatchBackEvent("progress", backEvent);
            }

            @Override
            public void handleOnBackCancelled() {
                dispatchBackEvent("cancel", null);
            }

            @Override
            public void handleOnBackPressed() {
                dispatchBackEvent("commit", null);
            }
        };
        // Registered after the bridge plugins, so it takes precedence whenever it is enabled.
        getOnBackPressedDispatcher().addCallback(this, predictiveBackCallback);

        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setEnabled(final boolean enabled) {
                runOnUiThread(() -> predictiveBackCallback.setEnabled(enabled));
            }
        }, "NsacAndroidBack");
    }

    private void dispatchBackEvent(String phase, BackEventCompat backEvent) {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;

        float density = getResources().getDisplayMetrics().density;
        String detail = backEvent == null
            ? String.format(java.util.Locale.ROOT, "{\"phase\":\"%s\",\"density\":%f}", phase, density)
            : String.format(
                java.util.Locale.ROOT,
                "{\"phase\":\"%s\",\"progress\":%f,\"touchX\":%f,\"touchY\":%f,\"edge\":%d,\"density\":%f}",
                phase,
                backEvent.getProgress(),
                backEvent.getTouchX(),
                backEvent.getTouchY(),
                backEvent.getSwipeEdge(),
                density
            );
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('nsac:back',{detail:" + detail + "}));",
            null
        );
    }

    /** Last keyboard overlap sent to the page (CSS px), to skip duplicate dispatches. */
    private float lastImeOverlapPx = -1f;

    /**
     * Keyboard bridge. The window never pans (the default adjustPan pushed the whole app up and
     * hid the top of the chat). Instead, the page receives how many CSS px of the WebView the
     * keyboard covers, frame by frame while it animates, as `--nsac-ime-height` on `<html>` plus
     * an `nsac:ime` event, and lays itself out above the keyboard.
     *
     * With adjustResize, edge-to-edge windows (Android 15+) are not resized, so the overlap is the
     * keyboard height; older non edge-to-edge windows are resized and the overlap stays 0.
     */
    private void attachKeyboardInsetsBridge() {
        if (this.bridge == null) return;
        final WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        getWindow().setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
        );
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public boolean isAvailable() {
                return true;
            }
        }, "NsacAndroidKeyboard");

        View animationHost = webView.getParent() instanceof View ? (View) webView.getParent() : webView;
        ViewCompat.setWindowInsetsAnimationCallback(
            animationHost,
            new WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                @NonNull
                @Override
                public WindowInsetsCompat onProgress(
                    @NonNull WindowInsetsCompat insets,
                    @NonNull List<WindowInsetsAnimationCompat> runningAnimations
                ) {
                    for (WindowInsetsAnimationCompat animation : runningAnimations) {
                        if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) {
                            dispatchImeOverlap(webView, insets, true);
                            break;
                        }
                    }
                    return insets;
                }

                @Override
                public void onEnd(@NonNull WindowInsetsAnimationCompat animation) {
                    if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) == 0) return;
                    WindowInsetsCompat root = ViewCompat.getRootWindowInsets(webView);
                    if (root != null) dispatchImeOverlap(webView, root, false);
                }
            }
        );
        // Changes without an animation (rotation, hardware keyboard, IME switch).
        webView.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override
            public void onGlobalLayout() {
                WindowInsetsCompat root = ViewCompat.getRootWindowInsets(webView);
                if (root != null) dispatchImeOverlap(webView, root, false);
            }
        });
    }

    private void dispatchImeOverlap(WebView webView, WindowInsetsCompat insets, boolean animating) {
        int imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
        int[] location = new int[2];
        webView.getLocationOnScreen(location);
        int webViewBottom = location[1] + webView.getHeight();
        int imeTop = webView.getRootView().getHeight() - imeBottom;
        int overlapDevicePx = imeBottom > 0 ? Math.max(0, webViewBottom - imeTop) : 0;
        float density = getResources().getDisplayMetrics().density;
        float overlap = Math.round(overlapDevicePx / density * 10f) / 10f;
        if (!animating && overlap == lastImeOverlapPx) return;
        lastImeOverlapPx = overlap;
        String js = String.format(
            java.util.Locale.ROOT,
            "(function(h,a){window.__nsacImeHeight=h;if(!a)document.documentElement.style.setProperty('--nsac-ime-height',h+'px');"
                + "window.dispatchEvent(new CustomEvent('nsac:ime',{detail:{height:h,animating:a}}));})(%.1f,%b);",
            overlap,
            animating
        );
        webView.evaluateJavascript(js, null);
    }

    private void attachThemeBridge() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setLightSystemBars(final boolean isLight) {
                runOnUiThread(() -> {
                    WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                    if (controller != null) {
                        controller.setAppearanceLightStatusBars(isLight);
                        controller.setAppearanceLightNavigationBars(isLight);
                    }
                });
            }
        }, "NsacAndroidTheme");
    }

    /**
     * `NsacAndroidOpen.openExternal(url)`: opens an http(s) URL in the system browser. Capacitor
     * keeps same-host URLs inside the WebView, which can't show PDFs (e.g. the ficha to print).
     */
    private void attachExternalOpenBridge() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public boolean openExternal(final String rawUrl) {
                final Uri uri;
                try {
                    uri = Uri.parse(rawUrl);
                } catch (Exception e) {
                    return false;
                }
                String scheme = uri.getScheme();
                if (scheme == null || !(scheme.equals("https") || scheme.equals("http"))) return false;
                runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        intent.addCategory(Intent.CATEGORY_BROWSABLE);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception ignored) {
                        // No browser available: nothing to open it with.
                    }
                });
                return true;
            }
        }, "NsacAndroidOpen");
    }

    private void attachApkUpdaterBridge() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String getInstalledVersion() {
                try {
                    PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                    return info.versionName != null ? info.versionName : "1.0.0";
                } catch (Exception e) {
                    return "1.0.0";
                }
            }

            @JavascriptInterface
            public String getCachedApkInfo() {
                try {
                    String installed = getInstalledVersion();
                    org.json.JSONObject meta = ApkUpdateCache.getVerifiedCachedMeta(MainActivity.this, installed);
                    return meta != null ? meta.toString() : "";
                } catch (Exception e) {
                    return "";
                }
            }

            @JavascriptInterface
            public void downloadApk(final String apkUrl) {
                downloadApkWithChecksum(apkUrl, "", "");
            }

            @JavascriptInterface
            public void downloadApkWithChecksum(
                final String apkUrl,
                final String expectedSha256,
                final String version
            ) {
                new Thread(() -> {
                    try {
                        dispatchApkDownloadEvent("downloading", 0, null);
                        ApkUpdateCache.downloadAndVerify(
                            MainActivity.this,
                            apkUrl,
                            expectedSha256,
                            version,
                            pct -> dispatchApkDownloadEvent("downloading", pct, null)
                        );
                        dispatchApkDownloadEvent("done", 100, null);
                    } catch (Exception e) {
                        dispatchApkDownloadEvent("error", 0, e.getMessage());
                    }
                }).start();
            }

            @JavascriptInterface
            public void installDownloadedApk() {
                runOnUiThread(() -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                                && !getPackageManager().canRequestPackageInstalls()) {
                            Intent permIntent = new Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getPackageName())
                            );
                            permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(permIntent);
                            return;
                        }
                        File apkFile = ApkUpdateCache.getVerifiedApkFileForInstall(MainActivity.this);
                        Uri uri = FileProvider.getUriForFile(
                            MainActivity.this,
                            getPackageName() + ".fileprovider",
                            apkFile
                        );
                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(uri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        dispatchApkDownloadEvent("error", 0, "Falha ao abrir instalador: " + e.getMessage());
                    }
                });
            }
        }, "NsacAndroidUpdater");
    }

    private void dispatchApkDownloadEvent(String state, int progress, String error) {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        String safeError = error == null ? "null" : ("\"" + error.replace("\\", "\\\\").replace("\"", "\\\"") + "\"");
        String detail = String.format(
            java.util.Locale.ROOT,
            "{\"state\":\"%s\",\"progress\":%d,\"error\":%s}",
            state,
            progress,
            safeError
        );
        runOnUiThread(() ->
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('nsac:apk-download',{detail:" + detail + "}));",
                null
            )
        );
    }

    private String colorIntToHex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }

    private void syncAospDynamicColorsToWebView() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;

        int nightMask = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        boolean isSystemDark = (nightMask == Configuration.UI_MODE_NIGHT_YES);

        String seedHex = "#10A37F";
        String secondaryHex = "#0D0D0D";
        String tertiaryHex = "#F5F5F5";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int accent1 = ContextCompat.getColor(this, android.R.color.system_accent1_500);
            int accent2 = ContextCompat.getColor(this, android.R.color.system_accent2_500);
            int accent3 = ContextCompat.getColor(this, android.R.color.system_accent3_500);
            seedHex = colorIntToHex(accent1);
            secondaryHex = colorIntToHex(accent2);
            tertiaryHex = colorIntToHex(accent3);
        }

        final String payloadJson = String.format(
            "{\"seedHex\":\"%s\",\"secondaryHex\":\"%s\",\"tertiaryHex\":\"%s\",\"isSystemDark\":%b,\"source\":\"android-aosp\"}",
            seedHex, secondaryHex, tertiaryHex, isSystemDark
        );

        final String js = "(function(){"
            + "window.__NSAC_ANDROID_DYNAMIC_COLOR__ = " + payloadJson + ";"
            + "window.dispatchEvent(new CustomEvent('nsac:android-dynamic-color', { detail: " + payloadJson + " }));"
            + "})();";

        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    /**
     * Bridges cold-start and warm-start notification taps (FCM system tray & LocalNotifications)
     * directly from Android Activity Intents into JS so tapping a notification NEVER gets lost
     * before React mounts its listeners.
     */
    private void attachPushIntentBridge() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String consumePendingPushIntent() {
                String json = pendingPushIntentJson;
                pendingPushIntentJson = null;
                return json;
            }

            @JavascriptInterface
            public void postAccumulatedGradeNotification(final String payloadJson) {
                GradeNotificationAccumulator.accumulateFromJson(MainActivity.this, payloadJson);
            }

            @JavascriptInterface
            public void clearAccumulatedGradeNotifications() {
                GradeNotificationAccumulator.clearPending(MainActivity.this, true);
            }

            @JavascriptInterface
            public String consumePendingAccumulatedGrades() {
                return GradeNotificationAccumulator.consumePendingJson(MainActivity.this, true);
            }
        }, "NsacAndroidPush");
    }

    private void extractPushIntentData(Intent intent, boolean dispatchImmediately) {
        if (intent == null) return;
        Bundle extras = intent.getExtras();
        if (extras == null || extras.isEmpty()) return;

        String[] keys = new String[] {
            "kind",
            "class_code",
            "subjects",
            "bimesters",
            "primary_subject",
            "primary_bimester",
            "primary_year",
            "primary_grade",
            "primary_class_avg",
            "highlights_json",
            "accumulated_count",
            "announcement_id",
            "channel_kind",
            "actor_id",
            "actor_label",
            "title",
            "body",
            "google.message_id"
        };

        boolean hasPushSignal = extras.containsKey("kind")
            || extras.containsKey("subjects")
            || extras.containsKey("primary_subject")
            || extras.containsKey("announcement_id")
            || extras.containsKey("actor_id")
            || extras.containsKey("google.message_id");
        if (!hasPushSignal) return;

        try {
            JSONObject obj = new JSONObject();
            for (String key : keys) {
                if (!extras.containsKey(key)) continue;
                Object val = extras.get(key);
                if (val != null) {
                    obj.put(key, String.valueOf(val));
                }
            }
            // Clear consumed push extras from intent so resume/rotation never replays them.
            for (String key : keys) {
                intent.removeExtra(key);
            }
            if (obj.length() == 0) return;

            // Tapping an accumulated grade notification resets the pending tray accumulator.
            if ("grade_update".equals(obj.optString("kind", ""))
                || obj.has("highlights_json")
                || obj.has("primary_subject")) {
                GradeNotificationAccumulator.clearPending(this, true);
            }

            final String json = obj.toString();
            pendingPushIntentJson = json;

            if (dispatchImmediately && this.bridge != null) {
                WebView webView = this.bridge.getWebView();
                if (webView != null) {
                    final String js = "(function(d){"
                        + "window.__NSAC_PENDING_PUSH__=d;"
                        + "window.dispatchEvent(new CustomEvent('nsac:native-push-open',{detail:d}));"
                        + "})(" + json + ");";
                    webView.post(() -> webView.evaluateJavascript(js, null));
                }
            }
        } catch (Exception ignored) {
            // Non-fatal: Capacitor's own PushNotifications listener remains active as fallback.
        }
    }
}
