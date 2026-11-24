package br.unesp.cti.nsac;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Intercepts high-priority data-only `grade_update` FCM messages even when the app is
 * backgrounded or killed so multiple grade postings accumulate cleanly into a single
 * smart Android notification. All other push kinds delegate untouched to Capacitor.
 */
public class NsacMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data != null && "grade_update".equals(data.get("kind"))) {
            GradeNotificationAccumulator.accumulateAndNotify(this, data);
            // Also notify foreground WebView listeners (so open screens refresh boletim silently);
            // pushService.ts skips scheduling a duplicate LocalNotification for `grade_update`.
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
            return;
        }
        super.onMessageReceived(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
    }
}
