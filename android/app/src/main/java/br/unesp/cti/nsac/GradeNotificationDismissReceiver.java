package br.unesp.cti.nsac;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Clears accumulated unread grade highlights when the user swipes away the grade notification.
 */
public class GradeNotificationDismissReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        GradeNotificationAccumulator.clearPending(context, false);
    }
}
