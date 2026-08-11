package ru.queenchat.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

public class QueenChatMessagingService extends FirebaseMessagingService {
    public static final String ACTION_ACCEPT_CALL = "ru.queenchat.app.ACTION_ACCEPT_CALL";
    public static final String ACTION_DECLINE_CALL = "ru.queenchat.app.ACTION_DECLINE_CALL";
    static final String CALL_CHANNEL_ID = "queenchat_calls";
    static final String MESSAGE_CHANNEL_ID = "queenchat_messages";
    private static final String TAG = "NativeFCM";
    static final String EXTRA_CALL_ID = "call_id";
    static final String EXTRA_CHAT_ID = "chat_id";
    static final String EXTRA_CALLER_ID = "caller_id";
    static final String EXTRA_CALLER_NAME = "caller_name";
    static final String EXTRA_CALLER_AVATAR = "caller_avatar";
    static final String EXTRA_CALL_TYPE = "call_type";
    private static final String API_ORIGIN = "https://queenchat.ru";
    private static final String PREFS = "queenchat_native";
    private static final String DEVICE_ID = "device_id";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String eventType = firstNonEmpty(data.get("event_type"), data.get("type"));
        Log.i(TAG, "message received event_type=" + eventType + " data_keys=" + data.keySet());
        if (isAppForeground()) {
            Log.i(TAG, "message notification suppressed: app is foreground");
            return;
        }
        if ("incoming_call".equals(eventType)) {
            showIncomingCallNotification(data);
            return;
        }
        if ("message".equals(eventType) || "new_message".equals(eventType)
            || "reply".equals(eventType) || "mention".equals(eventType)
            || "message_reaction".equals(eventType) || "reaction".equals(eventType)
            || "message_comment".equals(eventType)) {
            showMessageNotification(data);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        Log.i(TAG, "onNewToken token_len=" + token.length());
        PushNotificationsPlugin.onNewToken(token);
        registerTokenWithBackend(token);
    }

    private boolean isAppForeground() {
        if (getApplication() instanceof QueenChatApplication) {
            return ((QueenChatApplication) getApplication()).isInForeground();
        }
        return false;
    }

    private void showIncomingCallNotification(Map<String, String> data) {
        String callId = data.get("call_id");
        String chatId = data.get("chat_id");
        String callerId = firstNonEmpty(data.get("caller_id"), data.get("sender_id"));
        if (isBlank(callId) || isBlank(chatId) || isBlank(callerId)) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        createCallChannel();

        String callerName = firstNonEmpty(data.get("caller_name"), data.get("sender_name"), callerId);
        String callerAvatar = data.get("caller_avatar");
        String callType = firstNonEmpty(data.get("call_type"), "video");
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setAction(Intent.ACTION_VIEW);
        openIntent.setData(buildCallUri(chatId, callId, callerId, callerName, "open_call"));
        openIntent.putExtra(EXTRA_CALL_ID, callId);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        // Accept is a direct user-initiated Activity launch.  Starting an
        // Activity from a BroadcastReceiver is restricted on modern Android
        // and can be silently blocked while the app is in the background.
        Intent acceptIntent = new Intent(this, MainActivity.class);
        acceptIntent.setAction(ACTION_ACCEPT_CALL);
        acceptIntent.setData(buildCallUri(chatId, callId, callerId, callerName, "accept_call"));
        acceptIntent.putExtra(EXTRA_CALL_ID, callId);
        acceptIntent.putExtra(EXTRA_CHAT_ID, chatId);
        acceptIntent.putExtra(EXTRA_CALLER_ID, callerId);
        acceptIntent.putExtra(EXTRA_CALLER_NAME, callerName);
        acceptIntent.putExtra(EXTRA_CALLER_AVATAR, callerAvatar);
        acceptIntent.putExtra(EXTRA_CALL_TYPE, callType);
        acceptIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        Intent declineIntent = new Intent(this, QueenChatNotificationReceiver.class);
        declineIntent.setAction(ACTION_DECLINE_CALL);
        declineIntent.putExtra(EXTRA_CALL_ID, callId);
        declineIntent.putExtra(EXTRA_CHAT_ID, chatId);
        declineIntent.putExtra(EXTRA_CALLER_ID, callerId);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        int notificationId = notificationId(callId);
        int openRequestCode = requestCode("open:" + callId);
        int acceptRequestCode = requestCode("accept:" + callId);
        int declineRequestCode = requestCode("decline:" + callId);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_queenchat)
            .setContentTitle("Входящий звонок")
            .setContentText(callerName + " звонит вам")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(callerName + " звонит вам"))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setVibrate(new long[] { 200, 100, 200, 100, 400 })
            .setAutoCancel(true)
            .setOngoing(false)
            .setContentIntent(PendingIntent.getActivity(this, openRequestCode, openIntent, flags))
            .addAction(R.drawable.ic_stat_queenchat, "Принять", PendingIntent.getActivity(this, acceptRequestCode, acceptIntent, flags))
            .addAction(R.drawable.ic_stat_queenchat, "Отклонить", PendingIntent.getBroadcast(this, declineRequestCode, declineIntent, flags));

        NotificationManagerCompat.from(this).notify(notificationId, builder.build());
    }

    private void showMessageNotification(Map<String, String> data) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "message notification skipped: POST_NOTIFICATIONS denied");
            return;
        }

        String chatId = data.get("chat_id");
        String title = firstNonEmpty(data.get("title"), "QueenChat");
        String body = firstNonEmpty(data.get("body"), "New message");
        String stableId = firstNonEmpty(data.get("notification_id"), data.get("message_id"), data.get("event_type"), String.valueOf(System.currentTimeMillis()));
        int notificationId = notificationId(stableId);
        createMessageChannel();

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setAction(Intent.ACTION_VIEW);
        openIntent.setData(buildChatUri(chatId));
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MESSAGE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_queenchat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(this, notificationId, openIntent, flags));
        NotificationManagerCompat.from(this).notify(notificationId, builder.build());
        Log.i(TAG, "message notification shown event_type=" + data.get("event_type") + " chat_id=" + chatId);
    }

    private void createCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CALL_CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(CALL_CHANNEL_ID, "QueenChat calls", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Incoming video calls");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 200, 100, 200, 100, 400 });
        Uri sound = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.ringtone);
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(sound, attrs);
        manager.createNotificationChannel(channel);
    }

    private void createMessageChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(MESSAGE_CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            MESSAGE_CHANNEL_ID,
            "QueenChat messages",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("New QueenChat messages and reactions");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    static Uri buildCallUri(String chatId, String callId, String callerId, String callerName, String action) {
        return Uri.parse(API_ORIGIN)
            .buildUpon()
            .appendPath("chat")
            .appendPath(chatId)
            .appendQueryParameter("incoming_call", "1")
            .appendQueryParameter("call_id", callId)
            .appendQueryParameter("caller_id", callerId)
            .appendQueryParameter("caller_name", callerName)
            .appendQueryParameter("chat_id", chatId)
            .appendQueryParameter("call_action", action)
            .build();
    }

    private Uri buildChatUri(String chatId) {
        Uri.Builder builder = Uri.parse(API_ORIGIN).buildUpon().appendPath("chat");
        if (!isBlank(chatId)) builder.appendPath(chatId);
        return builder.build();
    }

    private void registerTokenWithBackend(String token) {
        String cookie = android.webkit.CookieManager.getInstance().getCookie(API_ORIGIN);
        if (isBlank(cookie)) {
            Log.w(TAG, "backend registration skipped: no auth cookie");
            return;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String deviceId = prefs.getString(DEVICE_ID, null);
        if (isBlank(deviceId)) {
            deviceId = UUID.randomUUID().toString();
            prefs.edit().putString(DEVICE_ID, deviceId).apply();
        }

        String body = "{\"token\":\"" + escape(token) + "\",\"device_id\":\"" + escape(deviceId)
            + "\",\"platform\":\"android_capacitor\",\"permission\":\"granted\",\"sw_version\":\"android_capacitor\",\"settings\":{}}";
        Log.i(TAG, "backend registration started device_id=" + deviceId + " token_len=" + token.length());
        postJson("/api/notifications/fcm-token", body, cookie);
    }

    static void declineCall(Context context, String callId, String chatId, String callerId) {
        String cookie = android.webkit.CookieManager.getInstance().getCookie(API_ORIGIN);
        if (isBlank(cookie) || isBlank(chatId) || isBlank(callerId)) return;
        String body = "{\"call_id\":\"" + escape(callId) + "\",\"chat_id\":\"" + escape(chatId)
            + "\",\"caller_id\":\"" + escape(callerId) + "\"}";
        postJson("/api/chats/calls/decline", body, cookie);
    }

    private static void postJson(String path, String body, String cookie) {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(API_ORIGIN + path).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Cookie", cookie);
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }
                int status = connection.getResponseCode();
                if (status >= 200 && status < 300) {
                    Log.i(TAG, "backend registration success status=" + status);
                } else {
                    Log.w(TAG, "backend registration failed status=" + status);
                }
            } catch (Exception error) {
                Log.w(TAG, "backend registration failed error_type=" + error.getClass().getSimpleName());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    static int notificationId(String callId) {
        return 100000 + Math.abs(callId.hashCode() % 100000);
    }

    private static int requestCode(String identity) {
        return identity.hashCode() & 0x7fffffff;
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (!isBlank(value)) return value;
        }
        return "";
    }

    private static String escape(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
