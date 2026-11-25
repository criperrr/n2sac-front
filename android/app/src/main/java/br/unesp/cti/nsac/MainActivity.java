package br.unesp.cti.nsac;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
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
import android.view.animation.AccelerateInterpolator;
import android.webkit.WebView;
import androidx.activity.BackEventCompat;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.splashscreen.SplashScreen;
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

    private volatile boolean webAppReady = false;
    private static final long SPLASH_MAX_WAIT_MS = 4500L;
    private static final long SPLASH_EXPLODE_MS = 200L;
    private static final long SPLASH_FADE_MS = 50L;

    /**
     * Native shockwave + 24 radial sparks overlay matching the /inicio hero explosion,
     * tuned slightly faster for the Android splash exit.
     */
    private static final class SplashExplosionView extends View {
        private final android.graphics.Paint ringPaint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        private final android.graphics.Paint sparkPaint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        private final float[] angles = new float[24];
        private final float[] dists = new float[24];
        private final float[] sizes = new float[24];
        private final float[] rotSpeeds = new float[24];
        private final int[] colors;
        private float progress = 0f;

        SplashExplosionView(android.content.Context ctx) {
            super(ctx);
            float dp = ctx.getResources().getDisplayMetrics().density;
            colors = new int[] {
                0xFFFF6B6B, // danger coral
                0xFFFBBF24, // amber spark
                0xFF60A5FA, // blue
                0xFFA78BFA, // purple
                0xFF34D399  // emerald
            };
            ringPaint.setStyle(android.graphics.Paint.Style.STROKE);
            ringPaint.setColor(0xFFFF6B6B);
            sparkPaint.setStyle(android.graphics.Paint.Style.FILL);
            java.util.Random rng = new java.util.Random(42L);
            for (int i = 0; i < 24; i++) {
                angles[i] = (float) ((Math.PI * 2.0 * i) / 24.0 + (rng.nextFloat() - 0.5f) * 0.25f);
                dists[i] = (110f + rng.nextFloat() * 125f) * dp;
                sizes[i] = (6f + rng.nextFloat() * 9f) * dp;
                rotSpeeds[i] = rng.nextFloat() * 360f;
            }
        }

        void setProgress(float p) {
            this.progress = p;
            invalidate();
        }

        @Override
        protected void onDraw(android.graphics.Canvas canvas) {
            super.onDraw(canvas);
            float cx = getWidth() * 0.5f;
            float cy = getHeight() * 0.5f;
            float dp = getResources().getDisplayMetrics().density;

            // Ease-out cubic (matches cubic-bezier(0.16, 1, 0.3, 1))
            float ease = 1f - (float) Math.pow(1f - progress, 3.0);

            // 1. Expanding shockwave ring
            float ringRadius = (24f + ease * 195f) * dp;
            ringPaint.setStrokeWidth(Math.max(1f, (8f * (1f - ease)) * dp));
            ringPaint.setAlpha((int) (240 * Math.max(0f, 1f - progress)));
            canvas.drawCircle(cx, cy, ringRadius, ringPaint);

            // 2. 24 radial sparks (alternating circles & rotated squares)
            float alpha = Math.max(0f, 1f - progress);
            float scale = 1.2f - 1.1f * ease;
            for (int i = 0; i < 24; i++) {
                float px = cx + (float) Math.cos(angles[i]) * dists[i] * ease;
                float py = cy + (float) Math.sin(angles[i]) * dists[i] * ease;
                float r = sizes[i] * 0.5f * scale;
                sparkPaint.setColor(colors[i % colors.length]);
                sparkPaint.setAlpha((int) (255 * alpha));
                if (i % 2 == 0) {
                    canvas.drawCircle(px, py, r, sparkPaint);
                } else {
                    canvas.save();
                    canvas.translate(px, py);
                    canvas.rotate(rotSpeeds[i] * ease);
                    canvas.drawRoundRect(-r, -r, r, r, 2f * dp, 2f * dp, sparkPaint);
                    canvas.restore();
                }
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        final long onCreateMs = android.os.SystemClock.uptimeMillis();
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() ->
            !webAppReady && (android.os.SystemClock.uptimeMillis() - onCreateMs) < SPLASH_MAX_WAIT_MS
        );
        splashScreen.setOnExitAnimationListener(splashViewProvider -> {
            View splashView = splashViewProvider.getView();
            View iconView = splashViewProvider.getIconView();

            android.animation.AnimatorSet exitSeq = new android.animation.AnimatorSet();
            ObjectAnimator fadeOut = ObjectAnimator.ofFloat(splashView, View.ALPHA, 1f, 0f);
            fadeOut.setDuration(SPLASH_FADE_MS);
            fadeOut.setInterpolator(new AccelerateInterpolator());

            if (iconView != null) {
                android.animation.AnimatorSet explodeSet = new android.animation.AnimatorSet();
                java.util.ArrayList<Animator> anims = new java.util.ArrayList<>();

                // Shockwave + 24 radial sparks overlay on the splash container
                if (splashView instanceof android.view.ViewGroup) {
                    SplashExplosionView fx = new SplashExplosionView(this);
                    ((android.view.ViewGroup) splashView).addView(
                        fx,
                        new android.view.ViewGroup.LayoutParams(
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    );
                    android.animation.ValueAnimator fxAnim = android.animation.ValueAnimator.ofFloat(0f, 1f);
                    fxAnim.setDuration(SPLASH_EXPLODE_MS);
                    fxAnim.addUpdateListener(a -> fx.setProgress((float) a.getAnimatedValue()));
                    anims.add(fxAnim);
                }

                // Recoil shake (like /inicio stageShake) + explosive pop + viscous spin brake
                float dp = getResources().getDisplayMetrics().density;
                ObjectAnimator shakeX = ObjectAnimator.ofFloat(iconView, View.TRANSLATION_X, 0f, -6f * dp, 7f * dp, -5f * dp, 4f * dp, 0f);
                ObjectAnimator shakeY = ObjectAnimator.ofFloat(iconView, View.TRANSLATION_Y, 0f, 3f * dp, -3f * dp, 2f * dp, -2f * dp, 0f);
                ObjectAnimator sx = ObjectAnimator.ofFloat(iconView, View.SCALE_X, 1f, 1.32f, 0.94f, 1f);
                ObjectAnimator sy = ObjectAnimator.ofFloat(iconView, View.SCALE_Y, 1f, 1.32f, 0.94f, 1f);
                ObjectAnimator rot = ObjectAnimator.ofFloat(iconView, View.ROTATION, iconView.getRotation(), iconView.getRotation() + 360f);

                shakeX.setDuration(160L);
                shakeY.setDuration(160L);
                sx.setDuration(SPLASH_EXPLODE_MS);
                sy.setDuration(SPLASH_EXPLODE_MS);
                rot.setDuration(SPLASH_EXPLODE_MS);
                sx.setInterpolator(new android.view.animation.DecelerateInterpolator(2.2f));
                sy.setInterpolator(new android.view.animation.DecelerateInterpolator(2.2f));
                rot.setInterpolator(new android.view.animation.DecelerateInterpolator(3.0f));

                anims.add(shakeX);
                anims.add(shakeY);
                anims.add(sx);
                anims.add(sy);
                anims.add(rot);

                explodeSet.playTogether(anims);
                exitSeq.playSequentially(explodeSet, fadeOut);
            } else {
                exitSeq.play(fadeOut);
            }

            exitSeq.addListener(new AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(Animator animation) {
                    splashViewProvider.remove();
                }
            });
            exitSeq.start();
        });
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_NOSENSOR);
        ensureHighPriorityNotificationChannels();
        attachSplashBridge();
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
    public void onStop() {
        super.onStop();
        // NEVER disable the active <activity-alias> on screen-off / lock (onStop while !isFinishing),
        // because Android immediately kills the live task when its root alias is disabled.
        if (isFinishing()) {
            applyPendingLauncherAlias();
        }
    }

    @Override
    public void onDestroy() {
        applyPendingLauncherAlias();
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        syncAospDynamicColorsToWebView();
    }

    private void attachSplashBridge() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void onAppReady() {
                webAppReady = true;
            }
        }, "NsacAndroidSplash");
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

    private static final String LAUNCHER_PREFS = "n2sac_launcher_prefs";
    private static final String LAUNCHER_PREF_KEY = "active_alias_key";
    private static final String LAUNCHER_PENDING_KEY = "pending_alias_key";
    private static final String[][] LAUNCHER_ALIASES = new String[][] {
        { "system",    "br.unesp.cti.nsac.LauncherSystem" },
        { "editorial", "br.unesp.cti.nsac.LauncherEditorial" },
        { "blue",      "br.unesp.cti.nsac.LauncherBlue" },
        { "green",     "br.unesp.cti.nsac.LauncherGreen" },
        { "purple",    "br.unesp.cti.nsac.LauncherPurple" },
        { "teal",      "br.unesp.cti.nsac.LauncherTeal" },
        { "amber",     "br.unesp.cti.nsac.LauncherAmber" },
        { "coral",     "br.unesp.cti.nsac.LauncherCoral" },
        { "rose",      "br.unesp.cti.nsac.LauncherRose" },
    };

    private String normalizeThemeKey(String rawKey) {
        if (rawKey != null) {
            String normalized = rawKey.trim().toLowerCase(java.util.Locale.ROOT);
            for (String[] entry : LAUNCHER_ALIASES) {
                if (entry[0].equals(normalized)) {
                    return entry[0];
                }
            }
        }
        return "system";
    }

    private int resolveSplashStyleRes(String key) {
        switch (key) {
            case "editorial": return R.style.AppTheme_NoActionBarLaunch_Editorial;
            case "blue":      return R.style.AppTheme_NoActionBarLaunch_Blue;
            case "green":     return R.style.AppTheme_NoActionBarLaunch_Green;
            case "purple":    return R.style.AppTheme_NoActionBarLaunch_Purple;
            case "teal":      return R.style.AppTheme_NoActionBarLaunch_Teal;
            case "amber":     return R.style.AppTheme_NoActionBarLaunch_Amber;
            case "coral":     return R.style.AppTheme_NoActionBarLaunch_Coral;
            case "rose":      return R.style.AppTheme_NoActionBarLaunch_Rose;
            case "system":
            default:
                return android.content.res.Resources.ID_NULL;
        }
    }

    private void scheduleAppThemeIconAndSplash(String rawKey) {
        String targetKey = normalizeThemeKey(rawKey);

        // 1. Official Android 12+ API: immediately persist the SplashScreen theme in system_server
        //    (zero restart, zero kill; takes effect on the very next cold start, following system Day/Night!).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                getSplashScreen().setSplashScreenTheme(resolveSplashStyleRes(targetKey));
            } catch (Exception ignored) {
                // ignore if splash screen service is unavailable
            }
        }

        // 2. Queue the launcher icon <activity-alias> swap for onStop() so we NEVER kill the app mid-session.
        SharedPreferences prefs = getSharedPreferences(LAUNCHER_PREFS, MODE_PRIVATE);
        String currentKey = prefs.getString(LAUNCHER_PREF_KEY, "system");
        if (targetKey.equals(currentKey)) {
            prefs.edit().remove(LAUNCHER_PENDING_KEY).apply();
        } else {
            prefs.edit().putString(LAUNCHER_PENDING_KEY, targetKey).apply();
        }
    }

    private void applyPendingLauncherAlias() {
        SharedPreferences prefs = getSharedPreferences(LAUNCHER_PREFS, MODE_PRIVATE);
        String targetKey = prefs.getString(LAUNCHER_PENDING_KEY, null);
        if (targetKey == null) return;
        String currentKey = prefs.getString(LAUNCHER_PREF_KEY, "system");
        if (targetKey.equals(currentKey)) {
            prefs.edit().remove(LAUNCHER_PENDING_KEY).apply();
            return;
        }

        String targetClass = LAUNCHER_ALIASES[0][1];
        for (String[] entry : LAUNCHER_ALIASES) {
            if (entry[0].equals(targetKey)) {
                targetClass = entry[1];
                break;
            }
        }

        PackageManager pm = getPackageManager();
        String pkg = getPackageName();
        pm.setComponentEnabledSetting(
            new ComponentName(pkg, targetClass),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        );
        for (String[] entry : LAUNCHER_ALIASES) {
            if (!entry[0].equals(targetKey)) {
                pm.setComponentEnabledSetting(
                    new ComponentName(pkg, entry[1]),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
                );
            }
        }
        prefs.edit()
            .putString(LAUNCHER_PREF_KEY, targetKey)
            .remove(LAUNCHER_PENDING_KEY)
            .apply();
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

            @JavascriptInterface
            public void setAppThemeIcon(final String themeKey) {
                runOnUiThread(() -> scheduleAppThemeIconAndSplash(themeKey));
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

            /**
             * Writes a base64-encoded PDF into the app cache directory and opens the native
             * Android Share Sheet (`ACTION_SEND` + `FileProvider`) so the user can share the
             * PDF directly to WhatsApp, Drive, Gmail, etc.
             */
            @JavascriptInterface
            public boolean sharePdfBase64(
                final String base64Pdf,
                final String rawFilename,
                final String title,
                final String text
            ) {
                if (base64Pdf == null || base64Pdf.isEmpty()) return false;
                try {
                    final byte[] pdfBytes = android.util.Base64.decode(base64Pdf, android.util.Base64.DEFAULT);
                    if (pdfBytes == null || pdfBytes.length == 0) return false;

                    String safeName = (rawFilename == null ? "" : rawFilename)
                        .replaceAll("[^a-zA-Z0-9._-]", "_");
                    if (safeName.isEmpty() || safeName.startsWith(".")) {
                        safeName = "boletim-n2sac.pdf";
                    }
                    if (!safeName.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) {
                        safeName = safeName + ".pdf";
                    }

                    File dir = new File(getCacheDir(), "shared_pdfs");
                    if (!dir.exists() && !dir.mkdirs()) return false;
                    File outFile = new File(dir, safeName);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(pdfBytes);
                        fos.flush();
                    }

                    final Uri contentUri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        outFile
                    );
                    final String finalName = safeName;
                    runOnUiThread(() -> {
                        try {
                            Intent shareIntent = new Intent(Intent.ACTION_SEND);
                            shareIntent.setType("application/pdf");
                            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                            if (title != null && !title.isEmpty()) {
                                shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                            }
                            if (text != null && !text.isEmpty()) {
                                shareIntent.putExtra(Intent.EXTRA_TEXT, text);
                            }
                            shareIntent.setClipData(android.content.ClipData.newRawUri(finalName, contentUri));
                            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            Intent chooser = Intent.createChooser(
                                shareIntent,
                                (title != null && !title.isEmpty()) ? title : "Compartilhar Boletim"
                            );
                            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            startActivity(chooser);
                        } catch (Exception ignored) {
                            // No share target available.
                        }
                    });
                    return true;
                } catch (Exception e) {
                    return false;
                }
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
