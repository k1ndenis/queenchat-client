package ru.queenchat.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;

public class QueenChatNotificationReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        android.util.Log.i("NativeCall", "[NativeCall] receiver invoked action=" + action);
        if (!QueenChatMessagingService.ACTION_DECLINE_CALL.equals(action)) {
            return;
        }

        String callId = intent.getStringExtra(QueenChatMessagingService.EXTRA_CALL_ID);
        String chatId = intent.getStringExtra(QueenChatMessagingService.EXTRA_CHAT_ID);
        String callerId = intent.getStringExtra(QueenChatMessagingService.EXTRA_CALLER_ID);
        if (callId != null) {
            NotificationManagerCompat.from(context).cancel(QueenChatMessagingService.notificationId(callId));
        }
        QueenChatMessagingService.declineCall(context, callId, chatId, callerId);
    }
}
