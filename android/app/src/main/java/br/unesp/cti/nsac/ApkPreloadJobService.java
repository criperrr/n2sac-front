package br.unesp.cti.nsac;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;

/**
 * Silent background JobService that checks {@code /version.json} periodically (even when the app
 * is completely closed), downloads any newer native APK from GitHub Releases, verifies its SHA-256
 * checksum, and caches it locally without showing any notification.
 *
 * When the student next opens the app, {@code UpdateAvailableDialog} detects the cached verified
 * APK via {@code NsacAndroidUpdater.getCachedApkInfo()} and prompts immediately to install.
 */
public class ApkPreloadJobService extends JobService {
    private static final String TAG = "ApkPreloadJob";
    private static final int JOB_ID = 42019;
    private static final long PERIOD_MS = 6L * 60L * 60L * 1000L; // 6 hours
    private static final String VERSION_JSON_URL = "https://notebook-server.tailddd6bf.ts.net/version.json";
    private static final String GITHUB_RELEASES_DOWNLOAD_BASE =
            "https://github.com/criperrr/n2sac/releases/download";

    private volatile Thread activeThread = null;

    public static void schedule(Context context) {
        try {
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler == null) return;
            // Do NOT reschedule if already pending — otherwise opening the app resets the 6h timer!
            if (scheduler.getPendingJob(JOB_ID) != null) return;
            ComponentName component = new ComponentName(context, ApkPreloadJobService.class);
            JobInfo info = new JobInfo.Builder(JOB_ID, component)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)
                    .setRequiresBatteryNotLow(true)
                    .setPeriodic(PERIOD_MS)
                    .setPersisted(true)
                    .build();
            scheduler.schedule(info);
        } catch (Exception e) {
            Log.w(TAG, "Failed to schedule silent APK preload job: " + e.getMessage());
        }
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        Thread t = new Thread(() -> {
            try {
                runSilentCheckAndPreload();
            } catch (Exception e) {
                Log.w(TAG, "Silent APK preload failed: " + e.getMessage());
            } finally {
                activeThread = null;
                jobFinished(params, false);
            }
        }, "ApkPreloadWorker");
        activeThread = t;
        t.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        Thread t = activeThread;
        if (t != null) {
            t.interrupt();
        }
        return true;
    }

    private void runSilentCheckAndPreload() throws Exception {
        String installed = getInstalledVersionName();
        String jsonText = fetchText(VERSION_JSON_URL + "?t=" + System.currentTimeMillis());
        if (jsonText == null || jsonText.isEmpty()) return;

        JSONObject data = new JSONObject(jsonText);
        String apkVersion = data.optString("apkVersion", "").trim();
        String apkSha256 = data.optString("apkSha256", "").trim();
        // Never attempt background APK downloads without a verified 64-hex SHA-256 checksum
        // (protects against OTA-only deploys or incomplete release metadata).
        if (apkVersion.isEmpty() || !apkSha256.matches("(?i)^[0-9a-f]{64}$")) {
            return;
        }
        if (ApkUpdateCache.compareSemver(apkVersion, installed) <= 0) {
            // Up to date — purge any stale cached APK.
            ApkUpdateCache.getVerifiedCachedMeta(this, installed);
            return;
        }

        String rawUrl = data.optString("apkUrl", "").trim();
        String cleanVer = apkVersion.replaceFirst("^[vV]", "");
        String apkUrl = (rawUrl.startsWith("https://github.com/")
                || rawUrl.startsWith("https://objects.githubusercontent.com/"))
                ? rawUrl
                : (GITHUB_RELEASES_DOWNLOAD_BASE + "/v" + cleanVer + "/n2sac-" + cleanVer + ".apk");

        ApkUpdateCache.downloadAndVerify(this, apkUrl, apkSha256, apkVersion, null);
        Log.i(TAG, "Silently preloaded & verified APK v" + apkVersion + " in background.");
    }

    private String getInstalledVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName != null ? info.versionName : "0.0.0";
        } catch (Exception e) {
            return "0.0.0";
        }
    }

    private static String fetchText(String url) {
        HttpURLConnection conn = null;
        try {
            conn = ApkUpdateCache.openFollowingRedirects(url, 10000, 15000);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line).append('\n');
                }
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
