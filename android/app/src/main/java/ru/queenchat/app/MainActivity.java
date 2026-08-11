package ru.queenchat.app;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TRUSTED_HOST = "queenchat.ru";
    private static final int SYSTEM_BAR_COLOR = Color.rgb(46, 16, 101);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i("NativeCall", "[NativeCall] MainActivity onCreate action=" + getIntentAction(getIntent()));
        persistAcceptIntent(getIntent());
        normalizeIntent(getIntent());
        registerPlugin(NativeCallPlugin.class);
        super.onCreate(savedInstanceState);

        // Android 15+ enforces edge-to-edge for this app's target SDK.  Keep
        // rendering edge-to-edge, but reserve the actual system/IME insets for
        // the Capacitor WebView instead of allowing web content below them.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(SYSTEM_BAR_COLOR);
        getWindow().setNavigationBarColor(SYSTEM_BAR_COLOR);

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        View root = findViewById(R.id.capacitor_root);
        root.setBackgroundColor(SYSTEM_BAR_COLOR);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets systemBars = insets.getInsetsIgnoringVisibility(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());

            view.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                Math.max(systemBars.bottom, ime.bottom)
            );
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        Log.i("NativeCall", "[NativeCall] MainActivity onNewIntent action=" + getIntentAction(intent));
        // Persist before Capacitor forwards the intent to JS: React may not
        // have registered appUrlOpen/appState listeners yet.
        persistAcceptIntent(intent);
        normalizeIntent(intent);
        setIntent(intent);
        super.onNewIntent(intent);
    }

    private void persistAcceptIntent(Intent intent) {
        if (!QueenChatMessagingService.ACTION_ACCEPT_CALL.equals(getIntentAction(intent))) return;
        Log.i("NativeCall", "[NativeCall] accept action clicked");
        NativeCallPlugin.saveAcceptAction(this, intent);
        Log.i("NativeCall", "[NativeCall] accept intent persisted");
    }

    private String getIntentAction(Intent intent) {
        return intent == null || intent.getAction() == null ? "null" : intent.getAction();
    }

    private void normalizeIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri uri = intent.getData();
        Uri normalized = normalizeUri(uri);
        if (normalized != null) {
            intent.setData(normalized);
        }
    }

    private Uri normalizeUri(Uri uri) {
        if ("https".equals(uri.getScheme()) && TRUSTED_HOST.equals(uri.getHost())) {
            return uri;
        }
        if (!"queenchat".equals(uri.getScheme())) {
            return null;
        }

        String path;
        if ("chat".equals(uri.getHost())) {
            path = "/chat/" + trimSlashes(uri.getPath());
        } else {
            path = uri.getPath();
        }
        if (path == null || !path.startsWith("/chat/")) {
            return null;
        }

        return new Uri.Builder()
            .scheme("https")
            .authority(TRUSTED_HOST)
            .path(path)
            .encodedQuery(uri.getEncodedQuery())
            .build();
    }

    private String trimSlashes(String value) {
        if (value == null) return "";
        return value.replaceFirst("^/+", "");
    }
}
