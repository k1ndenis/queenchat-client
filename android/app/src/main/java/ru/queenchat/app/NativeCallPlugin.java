package ru.queenchat.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "NativeCall")
public class NativeCallPlugin extends Plugin {
    private static final String PREFS = "queenchat_pending_call_action";
    private static final String ACTION = "action";
    private static final String CALL_ID = "call_id";
    private static final String CHAT_ID = "chat_id";
    private static final String CALLER_ID = "caller_id";
    private static final String CALLER_NAME = "caller_name";
    private static final String CALLER_AVATAR = "caller_avatar";
    private static final String CALL_TYPE = "call_type";

    static void saveAcceptAction(Context context, Intent intent) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editor.putString(ACTION, "accept_call");
        copy(editor, CALL_ID, intent.getStringExtra(QueenChatMessagingService.EXTRA_CALL_ID));
        copy(editor, CHAT_ID, intent.getStringExtra(QueenChatMessagingService.EXTRA_CHAT_ID));
        copy(editor, CALLER_ID, intent.getStringExtra(QueenChatMessagingService.EXTRA_CALLER_ID));
        copy(editor, CALLER_NAME, intent.getStringExtra(QueenChatMessagingService.EXTRA_CALLER_NAME));
        copy(editor, CALLER_AVATAR, intent.getStringExtra(QueenChatMessagingService.EXTRA_CALLER_AVATAR));
        copy(editor, CALL_TYPE, intent.getStringExtra(QueenChatMessagingService.EXTRA_CALL_TYPE));
        editor.apply();
        android.util.Log.i("NativeCall", "[NativeCall] pending action saved action=accept_call");
    }

    private static void copy(SharedPreferences.Editor editor, String key, String value) {
        if (value == null) editor.remove(key); else editor.putString(key, value);
    }

    @PluginMethod
    public void getPendingAction(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        String action = prefs.getString(ACTION, null);
        result.put("hasAction", action != null);
        if (action != null) {
            result.put("action", action);
            result.put("call_id", prefs.getString(CALL_ID, null));
            result.put("chat_id", prefs.getString(CHAT_ID, null));
            result.put("caller_id", prefs.getString(CALLER_ID, null));
            result.put("caller_name", prefs.getString(CALLER_NAME, null));
            result.put("caller_avatar", prefs.getString(CALLER_AVATAR, null));
            result.put("call_type", prefs.getString(CALL_TYPE, "video"));
            android.util.Log.i("NativeCall", "[NativeCall] pending action delivered to JS");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void clearPendingAction(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        android.util.Log.i("NativeCall", "[NativeCall] pending action cleared");
        call.resolve();
    }
}
