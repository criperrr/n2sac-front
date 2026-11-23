package br.unesp.cti.nsac.aperture;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Accumulates unread grade notifications into a single high-priority Android notification
 * (`GRADE_NOTIFICATION_ID = 42001` on channel `n2sac-grades-v2`):
 *
 * - 1 grade: previews exact personal grade, class average delta & evolution.
 * - 2-3 grades: previews each posted grade inline (with InboxStyle expansion).
 * - 4+ grades: stops inline grade previews and shows "Múltiplas novas notas saíram (N)"
 *   prompting the student to tap for the full summary & per-subject breakdown.
 *
 * Automatically resets when the notification is tapped, swiped away, or absent from the
 * active Android status bar tray.
 */
public final class GradeNotificationAccumulator {

    public static final int GRADE_NOTIFICATION_ID = 42001;
    public static final String CHANNEL_GRADES = "n2sac-grades-v2";
    private static final int MAX_INLINE_PREVIEW = 3;
    private static final int MAX_ACCUMULATED_ITEMS = 24;
    private static final String PREFS_NAME = "n2sac_grade_notif_accumulator_v1";
    private static final String KEY_PENDING_JSON = "pending_highlights_json";
    private static final String KEY_CLASS_CODE = "class_code";

    private GradeNotificationAccumulator() {}

    public static synchronized void clearPending(Context ctx, boolean cancelNotification) {
        if (ctx == null) return;
        SharedPreferences prefs = ctx.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(KEY_PENDING_JSON).remove(KEY_CLASS_CODE).apply();
        if (cancelNotification) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(GRADE_NOTIFICATION_ID);
            }
        }
    }

    /**
     * Returns any unread accumulated grade highlights captured while the user was away
     * (even if the user opened the app from the launcher instead of tapping the notification),
     * then clears both SharedPreferences and the active grade notification.
     */
    public static synchronized String consumePendingJson(Context ctx, boolean cancelNotification) {
        if (ctx == null) return null;
        Context appCtx = ctx.getApplicationContext();
        SharedPreferences prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String rawArr = prefs.getString(KEY_PENDING_JSON, "");
        String classCode = trimOrEmpty(prefs.getString(KEY_CLASS_CODE, ""));
        List<JSONObject> pending = parseHighlightsArray(rawArr);
        if (pending.isEmpty()) {
            return null;
        }
        clearPending(appCtx, cancelNotification);
        try {
            JSONObject out = new JSONObject();
            out.put("kind", "grade_update");
            out.put("source", "while_away");
            if (!classCode.isEmpty()) {
                out.put("class_code", classCode);
            }
            JSONArray arr = new JSONArray();
            for (JSONObject item : pending) arr.put(item);
            out.put("highlights_json", arr.toString());
            out.put("accumulated_count", String.valueOf(pending.size()));
            out.put("google.message_id", "while-away-" + System.currentTimeMillis());
            return out.toString();
        } catch (Exception ignored) {
            return null;
        }
    }

    public static void accumulateFromJson(Context ctx, String rawJson) {
        if (ctx == null || rawJson == null || rawJson.trim().isEmpty()) return;
        try {
            JSONObject obj = new JSONObject(rawJson);
            Map<String, String> map = new LinkedHashMap<>();
            Iterator<String> keys = obj.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                if (!obj.isNull(k)) {
                    Object v = obj.get(k);
                    map.put(k, v instanceof String ? (String) v : String.valueOf(v));
                }
            }
            accumulateAndNotify(ctx, map);
        } catch (Exception ignored) {
            // ignore malformed bridge JSON
        }
    }

    public static synchronized void accumulateAndNotify(Context ctx, Map<String, String> incomingData) {
        if (ctx == null || incomingData == null) return;
        Context appCtx = ctx.getApplicationContext();
        NotificationManager nm = (NotificationManager) appCtx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        ensureGradesChannel(nm);

        SharedPreferences prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        // If the user already swiped away or cleared the previous notification from the shade, start fresh.
        boolean trayStillHasGradeNotif = isNotificationActiveInTray(nm, GRADE_NOTIFICATION_ID);
        List<JSONObject> existing = trayStillHasGradeNotif
            ? parseHighlightsArray(prefs.getString(KEY_PENDING_JSON, "[]"))
            : new ArrayList<>();

        List<JSONObject> incoming = extractIncomingHighlights(incomingData);
        String classCode = trimOrEmpty(incomingData.get("class_code"));
        if (classCode.isEmpty()) {
            classCode = trimOrEmpty(prefs.getString(KEY_CLASS_CODE, ""));
        }

        // Merge & deduplicate by (normalizedSubject, bimester, year), preserving arrival order
        // while letting newer updates refresh an existing subject entry.
        LinkedHashMap<String, JSONObject> mergedMap = new LinkedHashMap<>();
        for (JSONObject item : existing) {
            mergedMap.put(dedupKey(item), item);
        }
        for (JSONObject item : incoming) {
            String key = dedupKey(item);
            mergedMap.remove(key);
            mergedMap.put(key, item);
        }

        List<JSONObject> merged = new ArrayList<>(mergedMap.values());
        if (merged.size() > MAX_ACCUMULATED_ITEMS) {
            merged = new ArrayList<>(merged.subList(merged.size() - MAX_ACCUMULATED_ITEMS, merged.size()));
        }

        JSONArray mergedArr = new JSONArray();
        for (JSONObject item : merged) {
            mergedArr.put(item);
        }

        prefs.edit()
            .putString(KEY_PENDING_JSON, mergedArr.toString())
            .putString(KEY_CLASS_CODE, classCode)
            .apply();

        int count = merged.size();
        String title;
        String body;
        NotificationCompat.Style style = null;

        if (count == 0) {
            title = trimOrEmpty(incomingData.get("title"));
            body = trimOrEmpty(incomingData.get("body"));
            if (title.isEmpty()) {
                title = classCode.isEmpty() ? "Novas notas no NSAC" : "Novas notas no NSAC (" + classCode + ")";
            }
            if (body.isEmpty()) {
                body = "Novas notas lançadas no boletim. Toque para conferir.";
            }
        } else if (count == 1) {
            JSONObject single = merged.get(0);
            String subj = single.optString("subject", "Boletim");
            int bim = single.optInt("bimester", 1);
            Double personal = optDouble(single, "personal_grade");
            Double classAvg = optDouble(single, "class_average");
            Double prev = optDouble(single, "previous_grade");

            title = personal != null
                ? "Nova nota em " + subj + ": " + formatGradeBr(personal)
                : "Nova nota em " + subj + " (" + bim + "º Bim)";

            List<String> parts = new ArrayList<>();
            parts.add(bim + "º Bim");
            if (personal != null && classAvg != null) {
                parts.add("Sala: " + formatGradeBr(classAvg) + " (" + formatSignedBr(personal - classAvg) + ")");
            } else if (classAvg != null) {
                parts.add("Média sala: " + formatGradeBr(classAvg));
            }
            if (personal != null && prev != null) {
                parts.add("Evolução: " + formatSignedBr(personal - prev));
            }
            if (parts.size() == 1) {
                parts.add(classCode.isEmpty() ? "Toque para ver detalhes" : "Turma " + classCode + " • Toque para ver detalhes");
            }
            body = joinWith(parts, " • ");
            style = new NotificationCompat.BigTextStyle().bigText(body);
        } else if (count <= MAX_INLINE_PREVIEW) {
            title = classCode.isEmpty()
                ? count + " novas notas lançadas"
                : count + " novas notas lançadas (" + classCode + ")";
            List<String> compactParts = new ArrayList<>();
            NotificationCompat.InboxStyle inbox = new NotificationCompat.InboxStyle();
            inbox.setBigContentTitle(title);
            for (JSONObject h : merged) {
                String subj = h.optString("subject", "Matéria");
                int bim = h.optInt("bimester", 1);
                Double personal = optDouble(h, "personal_grade");
                Double classAvg = optDouble(h, "class_average");
                if (personal != null) {
                    compactParts.add(subj + ": " + formatGradeBr(personal) + " (" + bim + "ºB)");
                    String line = subj + ": " + formatGradeBr(personal) + " (" + bim + "º Bim"
                        + (classAvg != null ? " • Sala " + formatGradeBr(classAvg) : "") + ")";
                    inbox.addLine(line);
                } else {
                    compactParts.add(subj + " (" + bim + "ºB)");
                    inbox.addLine(subj + " (" + bim + "º Bim)");
                }
            }
            inbox.setSummaryText("Toque para ver resumo e médias");
            body = joinWith(compactParts, " • ");
            style = inbox;
        } else {
            // Threshold reached (4+ grades): hide individual score previews cleanly.
            title = "Múltiplas novas notas saíram (" + count + ")";
            body = classCode.isEmpty()
                ? "Múltiplas notas novas saíram no boletim. Toque para ver o resumo completo."
                : "Múltiplas notas novas saíram no boletim (" + classCode + "). Toque para ver o resumo completo.";
            style = new NotificationCompat.BigTextStyle().bigText(body);
        }

        // Build full tap Intent with all accumulated highlights so clicking opens the Summary-First modal.
        Intent tapIntent = new Intent(appCtx, MainActivity.class);
        tapIntent.setAction("br.unesp.cti.nsac.aperture.OPEN_ACCUMULATED_GRADES");
        tapIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        tapIntent.putExtra("kind", "grade_update");
        tapIntent.putExtra("title", title);
        tapIntent.putExtra("body", body);
        if (!classCode.isEmpty()) {
            tapIntent.putExtra("class_code", classCode);
        }
        tapIntent.putExtra("accumulated_count", String.valueOf(count));
        tapIntent.putExtra("google.message_id", "grade-acc-" + System.currentTimeMillis());

        if (count > 0) {
            tapIntent.putExtra("highlights_json", mergedArr.toString());
            Set<String> subjectsSet = new LinkedHashSet<>();
            Set<String> bimsSet = new LinkedHashSet<>();
            for (JSONObject h : merged) {
                String s = h.optString("subject", "").trim();
                if (!s.isEmpty()) subjectsSet.add(s);
                int b = h.optInt("bimester", 0);
                if (b >= 1 && b <= 4) bimsSet.add(String.valueOf(b));
            }
            tapIntent.putExtra("subjects", joinWith(new ArrayList<>(subjectsSet), ", "));
            tapIntent.putExtra("bimesters", joinWith(new ArrayList<>(bimsSet), ", "));

            JSONObject first = merged.get(0);
            tapIntent.putExtra("primary_subject", first.optString("subject", ""));
            tapIntent.putExtra("primary_bimester", String.valueOf(first.optInt("bimester", 1)));
            if (first.has("year") && !first.isNull("year")) {
                tapIntent.putExtra("primary_year", String.valueOf(first.optInt("year")));
            }
            Double pg = optDouble(first, "personal_grade");
            if (pg != null) tapIntent.putExtra("primary_grade", String.format(Locale.ROOT, "%.2f", pg));
            Double ca = optDouble(first, "class_average");
            if (ca != null) tapIntent.putExtra("primary_class_avg", String.format(Locale.ROOT, "%.2f", ca));
        }

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentPi = PendingIntent.getActivity(appCtx, GRADE_NOTIFICATION_ID, tapIntent, piFlags);

        Intent dismissIntent = new Intent(appCtx, GradeNotificationDismissReceiver.class);
        PendingIntent deletePi = PendingIntent.getBroadcast(appCtx, GRADE_NOTIFICATION_ID + 1, dismissIntent, piFlags);

        int smallIcon = appCtx.getApplicationInfo().icon != 0
            ? appCtx.getApplicationInfo().icon
            : android.R.drawable.ic_dialog_info;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(appCtx, CHANNEL_GRADES)
            .setSmallIcon(smallIcon)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setNumber(Math.max(1, count))
            .setContentIntent(contentPi)
            .setDeleteIntent(deletePi);

        if (style != null) {
            builder.setStyle(style);
        }

        nm.notify(GRADE_NOTIFICATION_ID, builder.build());
    }

    private static boolean isNotificationActiveInTray(NotificationManager nm, int notifId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        try {
            StatusBarNotification[] active = nm.getActiveNotifications();
            if (active == null) return false;
            for (StatusBarNotification sbn : active) {
                if (sbn != null && sbn.getId() == notifId) {
                    return true;
                }
            }
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static void ensureGradesChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(CHANNEL_GRADES) != null) return;
        Uri defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audioAttrs = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_GRADES,
            "Notas do NSAC",
            NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription("Avisos de alta prioridade quando novas notas são lançadas");
        ch.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        ch.enableVibration(true);
        ch.enableLights(true);
        if (defaultSound != null) {
            ch.setSound(defaultSound, audioAttrs);
        }
        nm.createNotificationChannel(ch);
    }

    private static List<JSONObject> extractIncomingHighlights(Map<String, String> data) {
        String rawHighlights = trimOrEmpty(data.get("highlights_json"));
        if (!rawHighlights.isEmpty()) {
            List<JSONObject> parsed = parseHighlightsArray(rawHighlights);
            if (!parsed.isEmpty()) return parsed;
        }
        List<JSONObject> out = new ArrayList<>();
        String primarySubject = trimOrEmpty(data.get("primary_subject"));
        int primaryBim = parseIntOrDefault(data.get("primary_bimester"), 1);
        int primaryYear = parseIntOrDefault(data.get("primary_year"), java.util.Calendar.getInstance().get(java.util.Calendar.YEAR));
        Double primaryGrade = parseOptionalDouble(data.get("primary_grade"));
        Double primaryAvg = parseOptionalDouble(data.get("primary_class_avg"));

        if (!primarySubject.isEmpty()) {
            out.add(buildHighlightJson(primarySubject, primaryBim, primaryYear, primaryGrade, primaryAvg, null, false));
            return out;
        }
        String subjectsCsv = trimOrEmpty(data.get("subjects"));
        if (!subjectsCsv.isEmpty()) {
            for (String s : subjectsCsv.split(",")) {
                String trimmed = s.trim();
                if (!trimmed.isEmpty()) {
                    out.add(buildHighlightJson(trimmed, primaryBim, primaryYear, null, null, null, false));
                }
            }
        }
        return out;
    }

    private static JSONObject buildHighlightJson(
        String subject,
        int bimester,
        int year,
        Double personalGrade,
        Double classAverage,
        Double previousGrade,
        boolean recovery
    ) {
        JSONObject obj = new JSONObject();
        try {
            obj.put("subject", subject);
            obj.put("bimester", bimester);
            obj.put("year", year);
            obj.put("personal_grade", personalGrade != null ? personalGrade : JSONObject.NULL);
            obj.put("class_average", classAverage != null ? classAverage : JSONObject.NULL);
            obj.put("previous_grade", previousGrade != null ? previousGrade : JSONObject.NULL);
            obj.put("recovery", recovery);
        } catch (Exception ignored) {
            // ignore
        }
        return obj;
    }

    private static List<JSONObject> parseHighlightsArray(String raw) {
        List<JSONObject> list = new ArrayList<>();
        if (raw == null || raw.trim().isEmpty()) return list;
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item != null && !trimOrEmpty(item.optString("subject", "")).isEmpty()) {
                    list.add(item);
                }
            }
        } catch (Exception ignored) {
            // ignore malformed JSON
        }
        return list;
    }

    private static String dedupKey(JSONObject item) {
        String subj = normalizeKey(item.optString("subject", ""));
        int bim = item.optInt("bimester", 1);
        int year = item.optInt("year", 0);
        return subj + "|" + bim + "|" + year;
    }

    private static String normalizeKey(String s) {
        if (s == null) return "";
        String nfd = Normalizer.normalize(s.trim().toLowerCase(Locale.ROOT), Normalizer.Form.NFD);
        return nfd.replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
    }

    private static Double optDouble(JSONObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.isNull(key)) return null;
        double v = obj.optDouble(key, Double.NaN);
        return Double.isNaN(v) || Double.isInfinite(v) ? null : v;
    }

    private static Double parseOptionalDouble(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        try {
            double v = Double.parseDouble(raw.trim().replace(',', '.'));
            return Double.isNaN(v) || Double.isInfinite(v) ? null : v;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static int parseIntOrDefault(String raw, int fallback) {
        if (raw == null || raw.trim().isEmpty()) return fallback;
        try {
            return Integer.parseInt(raw.trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String trimOrEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    private static String formatGradeBr(double value) {
        return String.format(Locale.ROOT, "%.1f", value).replace('.', ',');
    }

    private static String formatSignedBr(double delta) {
        String sign = delta >= 0.0 ? "+" : "-";
        return sign + String.format(Locale.ROOT, "%.1f", Math.abs(delta)).replace('.', ',');
    }

    private static String joinWith(List<String> items, String sep) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(sep);
            sb.append(items.get(i));
        }
        return sb.toString();
    }
}
