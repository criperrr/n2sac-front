package br.unesp.cti.nsac;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Persistent SHA-256 verified APK update cache stored in {@code files/apk_updates/}.
 *
 * <ul>
 *   <li>Used by both the silent background pre-downloader ({@link ApkPreloadJobService}) and
 *       manual in-app downloads ({@code NsacAndroidUpdater}).</li>
 *   <li>Downloads atomically to {@code n2sac-downloading.tmp} while computing streaming SHA-256.</li>
 *   <li>Promotes to {@code n2sac-verified.apk} + {@code n2sac-verified.meta.json} ONLY when the
 *       SHA-256 checksum matches; corrupt/unverified files are deleted immediately.</li>
 * </ul>
 */
public final class ApkUpdateCache {
    private static final String TAG = "ApkUpdateCache";
    private static final String DIR_NAME = "apk_updates";
    private static final String APK_FILE = "n2sac-verified.apk";
    private static final String TMP_FILE = "n2sac-downloading.tmp";
    private static final String META_FILE = "n2sac-verified.meta.json";
    private static final int MAX_REDIRECTS = 8;

    public interface ProgressListener {
        void onProgress(int percent);
    }

    private ApkUpdateCache() {}

    public static File getCacheDir(Context context) {
        File dir = new File(context.getFilesDir(), DIR_NAME);
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    public static File getApkFile(Context context) {
        return new File(getCacheDir(context), APK_FILE);
    }

    private static File getTmpFile(Context context) {
        return new File(getCacheDir(context), TMP_FILE);
    }

    private static File getMetaFile(Context context) {
        return new File(getCacheDir(context), META_FILE);
    }

    public static synchronized void clear(Context context) {
        deleteQuietly(getApkFile(context));
        deleteQuietly(getTmpFile(context));
        deleteQuietly(getMetaFile(context));
    }

    private static void deleteQuietly(File f) {
        if (f != null && f.exists()) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    /**
     * Returns verified cached metadata JSON ({@code version, sha256, apkUrl, ready}) if a valid
     * APK newer than {@code installedVersion} is already cached and passes SHA-256 verification.
     * Automatically cleans up stale cached APKs once installed.
     */
    public static synchronized JSONObject getVerifiedCachedMeta(Context context, String installedVersion) {
        File apk = getApkFile(context);
        File metaFile = getMetaFile(context);
        if (!apk.exists() || !metaFile.exists()) {
            return null;
        }
        try {
            JSONObject meta = new JSONObject(readUtf8(metaFile));
            String version = meta.optString("version", "").trim();
            String expectedSha = normalizeSha256(meta.optString("sha256", ""));
            if (version.isEmpty() || expectedSha.isEmpty()) {
                clear(context);
                return null;
            }
            if (installedVersion != null && !installedVersion.isEmpty()
                    && compareSemver(version, installedVersion) <= 0) {
                // Already installed this version (or newer); reclaim storage.
                clear(context);
                return null;
            }
            String actualSha = computeSha256(apk);
            if (!expectedSha.equalsIgnoreCase(actualSha)) {
                Log.w(TAG, "Cached APK checksum mismatch; purging corrupt file.");
                clear(context);
                return null;
            }
            meta.put("ready", true);
            return meta;
        } catch (Exception e) {
            Log.w(TAG, "Failed reading cached APK metadata: " + e.getMessage());
            clear(context);
            return null;
        }
    }

    /**
     * Re-verifies the cached APK's SHA-256 checksum immediately before handing it to Android's
     * PackageInstaller via {@code FileProvider}.
     */
    public static synchronized File getVerifiedApkFileForInstall(Context context) throws Exception {
        File apk = getApkFile(context);
        File metaFile = getMetaFile(context);
        if (!apk.exists() || !metaFile.exists()) {
            throw new IllegalStateException("APK atualizado não encontrado no cache.");
        }
        JSONObject meta = new JSONObject(readUtf8(metaFile));
        String expectedSha = normalizeSha256(meta.optString("sha256", ""));
        if (expectedSha.isEmpty()) {
            clear(context);
            throw new SecurityException("Checksum SHA-256 ausente nos metadados do APK.");
        }
        String actualSha = computeSha256(apk);
        if (!expectedSha.equalsIgnoreCase(actualSha)) {
            clear(context);
            throw new SecurityException("Checksum SHA-256 do APK em cache inválido.");
        }
        return apk;
    }

    /**
     * Downloads {@code apkUrl} (following GitHub Releases 302 redirects across hosts), verifies
     * its SHA-256 checksum against {@code expectedSha256} (or {@code <apkUrl>.sha256} if empty),
     * and caches it persistently ONLY if the checksum passes.
     */
    public static synchronized JSONObject downloadAndVerify(
            Context context,
            String apkUrl,
            String expectedSha256,
            String version,
            ProgressListener listener
    ) throws Exception {
        String normalizedExpected = normalizeSha256(expectedSha256);
        if (normalizedExpected.isEmpty()) {
            normalizedExpected = fetchRemoteSha256(apkUrl + ".sha256");
        }
        if (normalizedExpected.isEmpty()) {
            throw new SecurityException("Não foi possível obter o checksum SHA-256 oficial do APK.");
        }

        // Fast-path: already cached & verified with matching SHA-256!
        File existingApk = getApkFile(context);
        File existingMetaFile = getMetaFile(context);
        if (existingApk.exists() && existingMetaFile.exists()) {
            try {
                JSONObject existing = new JSONObject(readUtf8(existingMetaFile));
                String cachedSha = normalizeSha256(existing.optString("sha256", ""));
                if (normalizedExpected.equalsIgnoreCase(cachedSha)
                        && normalizedExpected.equalsIgnoreCase(computeSha256(existingApk))) {
                    if (listener != null) listener.onProgress(100);
                    existing.put("ready", true);
                    return existing;
                }
            } catch (Exception ignored) {
                // Fall through to fresh download.
            }
        }

        File tmp = getTmpFile(context);
        deleteQuietly(tmp);

        HttpURLConnection conn = openFollowingRedirects(apkUrl, 15000, 45000);
        try {
            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new Exception("HTTP " + status + " ao baixar APK");
            }
            long total = conn.getContentLengthLong();
            MessageDigest md = MessageDigest.getInstance("SHA-256");

            try (InputStream in = conn.getInputStream();
                 FileOutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[16384];
                long downloaded = 0;
                int lastPct = -1;
                int read;
                while ((read = in.read(buf)) != -1) {
                    out.write(buf, 0, read);
                    md.update(buf, 0, read);
                    downloaded += read;
                    if (listener != null && total > 0) {
                        int pct = (int) Math.min(99, (downloaded * 100L) / total);
                        if (pct != lastPct) {
                            lastPct = pct;
                            listener.onProgress(pct);
                        }
                    }
                }
                out.flush();
            }

            String actualSha = toHex(md.digest());
            if (!normalizedExpected.equalsIgnoreCase(actualSha)) {
                deleteQuietly(tmp);
                throw new SecurityException(
                        "Checksum SHA-256 inválido! O download foi descartado por segurança."
                );
            }

            File dest = getApkFile(context);
            deleteQuietly(dest);
            if (!tmp.renameTo(dest)) {
                deleteQuietly(tmp);
                throw new Exception("Falha ao mover APK verificado para o cache.");
            }

            JSONObject meta = new JSONObject();
            meta.put("version", version != null ? version.trim() : "");
            meta.put("sha256", actualSha);
            meta.put("apkUrl", apkUrl);
            meta.put("verifiedAt", System.currentTimeMillis());
            meta.put("ready", true);
            writeUtf8(getMetaFile(context), meta.toString());

            if (listener != null) listener.onProgress(100);
            return meta;
        } catch (Exception e) {
            deleteQuietly(tmp);
            throw e;
        } finally {
            conn.disconnect();
        }
    }

    public static HttpURLConnection openFollowingRedirects(
            String rawUrl, int connectTimeoutMs, int readTimeoutMs
    ) throws Exception {
        String current = rawUrl;
        for (int hop = 0; hop < MAX_REDIRECTS; hop++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setConnectTimeout(connectTimeoutMs);
            conn.setReadTimeout(readTimeoutMs);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("User-Agent", "n2sac-android-updater");
            conn.connect();
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                    || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == HttpURLConnection.HTTP_SEE_OTHER
                    || code == 307
                    || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null || loc.isEmpty()) {
                    throw new Exception("Redirect sem Location ao baixar APK");
                }
                current = new URL(new URL(current), loc).toString();
                continue;
            }
            return conn;
        }
        throw new Exception("Muitos redirecionamentos ao baixar APK");
    }

    private static String fetchRemoteSha256(String shaUrl) {
        HttpURLConnection conn = null;
        try {
            conn = openFollowingRedirects(shaUrl, 10000, 15000);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return "";
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line = br.readLine();
                if (line == null) return "";
                String firstToken = line.trim().split("\\s+")[0];
                return normalizeSha256(firstToken);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not fetch remote sha256 (" + shaUrl + "): " + e.getMessage());
            return "";
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    public static String computeSha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[16384];
            int read;
            while ((read = in.read(buf)) != -1) {
                md.update(buf, 0, read);
            }
        }
        return toHex(md.digest());
    }

    public static String normalizeSha256(String raw) {
        if (raw == null) return "";
        String cleaned = raw.trim().toLowerCase().replace(":", "");
        if (cleaned.length() != 64) return "";
        for (int i = 0; i < 64; i++) {
            char c = cleaned.charAt(i);
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return "";
        }
        return cleaned;
    }

    public static int compareSemver(String a, String b) {
        int[] pa = parseSemver(a);
        int[] pb = parseSemver(b);
        for (int i = 0; i < 3; i++) {
            if (pa[i] != pb[i]) return Integer.compare(pa[i], pb[i]);
        }
        return 0;
    }

    private static int[] parseSemver(String raw) {
        int[] out = new int[]{0, 0, 0};
        if (raw == null) return out;
        String clean = raw.trim().replaceFirst("^[vV]", "");
        int dash = clean.indexOf('-');
        if (dash >= 0) clean = clean.substring(0, dash);
        String[] parts = clean.split("\\.");
        for (int i = 0; i < Math.min(3, parts.length); i++) {
            try {
                out[i] = Integer.parseInt(parts[i].replaceAll("[^0-9]", ""));
            } catch (Exception ignored) {
                out[i] = 0;
            }
        }
        return out;
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }

    private static String readUtf8(File file) throws Exception {
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] data = new byte[(int) file.length()];
            int offset = 0;
            while (offset < data.length) {
                int r = in.read(data, offset, data.length - offset);
                if (r < 0) break;
                offset += r;
            }
            return new String(data, 0, offset, StandardCharsets.UTF_8);
        }
    }

    private static void writeUtf8(File file, String content) throws Exception {
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
    }
}
