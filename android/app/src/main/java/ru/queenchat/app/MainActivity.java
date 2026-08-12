package ru.queenchat.app;

import android.content.Intent;
import android.content.Context;
import android.graphics.Color;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.coordinatorlayout.widget.CoordinatorLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String TRUSTED_HOST = "queenchat.ru";
    // Mirrors the web shell: bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900.
    private static final int SYSTEM_BAR_COLOR = Color.rgb(15, 23, 42);
    private static final int SURFACE_START = Color.rgb(15, 23, 42);
    private static final int SURFACE_MID = Color.rgb(46, 16, 101);
    private static final int TEXT_SECONDARY = Color.rgb(233, 213, 255); // purple-200
    private static final int TEXT_MUTED = Color.rgb(167, 139, 250); // purple-400
    private static final String START_URL = "https://queenchat.ru/";
    private static final long NETWORK_RETRY_DEBOUNCE_MS = 900L;
    private static final long AUTO_RETRY_MIN_INTERVAL_MS = 5_000L;
    private static final String STATE_KEY = "queenchat.web_state";
    private static final String URL_KEY = "queenchat.last_main_url";
    private static final String SERVER_ERROR_KEY = "queenchat.server_error";
    private enum WebState { LOADING, CONTENT, NETWORK_ERROR }

    private WebState webState = WebState.LOADING;
    private String lastMainUrl = START_URL;
    private View statusOverlay;
    private TextView statusTitle;
    private TextView statusMessage;
    private TextView loadingBrand;
    private TextView autoRecoveryHint;
    private ProgressBar loadingIndicator;
    private Button retryButton;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean callbackRegistered;
    private boolean autoRetryScheduled;
    private long lastAutoRetryAt;
    private boolean temporaryServerError;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i("NativeCall", "[NativeCall] MainActivity onCreate action=" + getIntentAction(getIntent()));
        persistAcceptIntent(getIntent());
        normalizeIntent(getIntent());
        registerPlugin(NativeCallPlugin.class);
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            String savedState = savedInstanceState.getString(STATE_KEY);
            if (savedState != null) {
                try { webState = WebState.valueOf(savedState); } catch (IllegalArgumentException ignored) { }
            }
            lastMainUrl = savedInstanceState.getString(URL_KEY, START_URL);
            temporaryServerError = savedInstanceState.getBoolean(SERVER_ERROR_KEY, false);
        }
        installWebViewFailureHandling();

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
    public void onStart() {
        super.onStart();
        registerNetworkCallback();
    }

    @Override
    public void onStop() {
        unregisterNetworkCallback();
        super.onStop();
    }

    @Override
    public void onSaveInstanceState(Bundle outState) {
        outState.putString(STATE_KEY, webState.name());
        outState.putString(URL_KEY, lastMainUrl);
        outState.putBoolean(SERVER_ERROR_KEY, temporaryServerError);
        super.onSaveInstanceState(outState);
    }

    private void installWebViewFailureHandling() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().setWebViewClient(new QueenChatWebViewClient(getBridge(), this));
        createStatusOverlay();
        setWebState(webState, false);
    }

    private void createStatusOverlay() {
        CoordinatorLayout root = findViewById(R.id.capacitor_root);
        if (root == null || statusOverlay != null) return;
        FrameLayout overlay = new FrameLayout(this);
        GradientDrawable background = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[] { SURFACE_START, SURFACE_MID, SURFACE_START }
        );
        overlay.setBackground(background);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setClipToPadding(false);
        scrollView.setPadding(dp(24), dp(32), dp(24), dp(32));

        LinearLayout viewport = new LinearLayout(this);
        viewport.setOrientation(LinearLayout.VERTICAL);
        viewport.setGravity(Gravity.CENTER);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_HORIZONTAL);
        panel.setPadding(0, dp(12), 0, dp(12));

        ImageView logo = new ImageView(this);
        // This is QueenChat's shipped launcher foreground artwork, prepared from the web logo.
        logo.setImageResource(R.mipmap.ic_launcher_foreground);
        logo.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        logo.setContentDescription(null);
        logo.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        panel.addView(logo, new LinearLayout.LayoutParams(dp(76), dp(76)));

        loadingBrand = new TextView(this);
        loadingBrand.setText("QueenChat");
        loadingBrand.setTextColor(Color.WHITE);
        loadingBrand.setTextSize(18);
        loadingBrand.setGravity(Gravity.CENTER);
        loadingBrand.setTypeface(null, 1);
        LinearLayout.LayoutParams brandParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        brandParams.topMargin = dp(14);
        panel.addView(loadingBrand, brandParams);

        loadingIndicator = new ProgressBar(this, null, android.R.attr.progressBarStyleSmall);
        loadingIndicator.setIndeterminateTintList(ColorStateList.valueOf(Color.rgb(192, 132, 252)));
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(dp(24), dp(24));
        progressParams.topMargin = dp(16);
        panel.addView(loadingIndicator, progressParams);

        statusTitle = new TextView(this);
        statusTitle.setTextColor(Color.WHITE);
        statusTitle.setTextSize(23);
        statusTitle.setGravity(Gravity.CENTER);
        statusTitle.setTypeface(null, 1);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(24);
        panel.addView(statusTitle, titleParams);

        statusMessage = new TextView(this);
        statusMessage.setTextColor(TEXT_SECONDARY);
        statusMessage.setTextSize(16);
        statusMessage.setGravity(Gravity.CENTER);
        statusMessage.setLineSpacing(dp(4), 1f);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = dp(12);
        panel.addView(statusMessage, messageParams);

        retryButton = new Button(this);
        retryButton.setText("Повторить");
        retryButton.setTextColor(Color.WHITE);
        retryButton.setTextSize(16);
        GradientDrawable buttonBackground = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            new int[] { Color.rgb(168, 85, 247), Color.rgb(236, 72, 153) });
        buttonBackground.setCornerRadius(dp(12));
        retryButton.setBackground(new RippleDrawable(
            ColorStateList.valueOf(Color.argb(72, 255, 255, 255)), buttonBackground, null
        ));
        retryButton.setAllCaps(false);
        retryButton.setContentDescription("Повторить подключение");
        retryButton.setMinHeight(dp(48));
        retryButton.setOnClickListener(view -> retryMainPage(true));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(dp(232), dp(50));
        buttonParams.topMargin = dp(28);
        panel.addView(retryButton, buttonParams);

        TextView hint = new TextView(this);
        hint.setText("QueenChat подключится автоматически,\nкогда сеть восстановится.");
        hint.setTextColor(TEXT_MUTED);
        hint.setTextSize(13);
        hint.setLineSpacing(dp(2), 1f);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(18);
        panel.addView(hint, hintParams);
        autoRecoveryHint = hint;

        int contentWidth = Math.min(dp(336), getResources().getDisplayMetrics().widthPixels - dp(48));
        viewport.addView(panel, new LinearLayout.LayoutParams(contentWidth, ViewGroup.LayoutParams.WRAP_CONTENT));
        scrollView.addView(viewport, new ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));
        overlay.addView(scrollView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.addView(overlay, new CoordinatorLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));
        statusOverlay = overlay;
    }

    private void setWebState(WebState state, boolean secureConnectionError) {
        webState = state;
        if (statusOverlay == null) return;
        if (state == WebState.CONTENT) {
            statusOverlay.setVisibility(View.GONE);
            return;
        }
        statusOverlay.setVisibility(View.VISIBLE);
        boolean loading = state == WebState.LOADING;
        loadingBrand.setVisibility(loading ? View.VISIBLE : View.GONE);
        loadingIndicator.setVisibility(loading ? View.VISIBLE : View.GONE);
        retryButton.setVisibility(loading ? View.GONE : View.VISIBLE);
        autoRecoveryHint.setVisibility(loading ? View.GONE : View.VISIBLE);
        if (state == WebState.LOADING) {
            statusTitle.setVisibility(View.GONE);
            statusMessage.setVisibility(View.GONE);
        } else if (secureConnectionError) {
            statusTitle.setVisibility(View.VISIBLE);
            statusMessage.setVisibility(View.VISIBLE);
            statusTitle.setText("Не удалось установить защищённое соединение");
            statusMessage.setText("Проверьте подключение к интернету\nи попробуйте ещё раз.");
        } else if (temporaryServerError) {
            statusTitle.setVisibility(View.VISIBLE);
            statusMessage.setVisibility(View.VISIBLE);
            statusTitle.setText("QueenChat временно недоступен");
            statusMessage.setText("Мы уже пытаемся восстановить соединение.\nПопробуйте ещё раз через несколько секунд.");
        } else {
            statusTitle.setVisibility(View.VISIBLE);
            statusMessage.setVisibility(View.VISIBLE);
            statusTitle.setText("Не удалось подключиться");
            statusMessage.setText("Проверьте подключение к интернету\nи попробуйте ещё раз.");
        }
    }

    private boolean isMainQueenChatUrl(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "https".equals(uri.getScheme()) && TRUSTED_HOST.equals(uri.getHost());
    }

    private void mainNavigationStarted(String url) {
        if (!isMainQueenChatUrl(url)) return;
        temporaryServerError = false;
        lastMainUrl = url;
        setWebState(WebState.LOADING, false);
    }

    private void mainNavigationFinished(String url) {
        if (!isMainQueenChatUrl(url) || webState == WebState.NETWORK_ERROR) return;
        setWebState(WebState.CONTENT, false);
    }

    private void mainNavigationFailed(String url, String reason, boolean secureConnectionError) {
        if (!isMainQueenChatUrl(url)) return;
        temporaryServerError = reason.startsWith("http_status=");
        Log.w("QueenChatWebView", "main-frame failure reason=" + reason + " url=" + url);
        setWebState(WebState.NETWORK_ERROR, secureConnectionError);
    }

    private boolean hasUsableNetwork() {
        if (connectivityManager == null) return false;
        Network network = connectivityManager.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : connectivityManager.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void retryMainPage(boolean userInitiated) {
        if (!hasUsableNetwork()) {
            setWebState(WebState.NETWORK_ERROR, false);
            return;
        }
        if (!userInitiated && System.currentTimeMillis() - lastAutoRetryAt < AUTO_RETRY_MIN_INTERVAL_MS) return;
        if (!userInitiated) lastAutoRetryAt = System.currentTimeMillis();
        setWebState(WebState.LOADING, false);
        getBridge().getWebView().loadUrl(isMainQueenChatUrl(lastMainUrl) ? lastMainUrl : START_URL);
    }

    private void registerNetworkCallback() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null || callbackRegistered) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) { scheduleAutomaticRetry(); }
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) scheduleAutomaticRetry();
            }
        };
        connectivityManager.registerDefaultNetworkCallback(networkCallback);
        callbackRegistered = true;
    }

    private void scheduleAutomaticRetry() {
        if (webState != WebState.NETWORK_ERROR || autoRetryScheduled) return;
        autoRetryScheduled = true;
        mainHandler.postDelayed(() -> {
            autoRetryScheduled = false;
            if (webState == WebState.NETWORK_ERROR) retryMainPage(false);
        }, NETWORK_RETRY_DEBOUNCE_MS);
    }

    private void unregisterNetworkCallback() {
        mainHandler.removeCallbacksAndMessages(null);
        autoRetryScheduled = false;
        if (connectivityManager != null && callbackRegistered) {
            try { connectivityManager.unregisterNetworkCallback(networkCallback); } catch (IllegalArgumentException ignored) { }
        }
        callbackRegistered = false;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

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

    /** Keeps Capacitor's navigation and plugin behavior while observing only main documents. */
    private static final class QueenChatWebViewClient extends BridgeWebViewClient {
        private final MainActivity activity;

        QueenChatWebViewClient(Bridge bridge, MainActivity activity) {
            super(bridge);
            this.activity = activity;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            activity.mainNavigationStarted(url);
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            activity.mainNavigationFinished(url);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                activity.mainNavigationFailed(request.getUrl().toString(), "code=" + error.getErrorCode(), false);
                // Do not call Capacitor's error handler: it may load the WebView error URL.
                return;
            }
            super.onReceivedError(view, request, error);
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            // minSdk is 24, but retain the legacy callback for devices/WebView implementations that invoke it.
            if (activity.isMainQueenChatUrl(failingUrl) && failingUrl.equals(view.getUrl())) {
                activity.mainNavigationFailed(failingUrl, "legacy_code=" + errorCode, false);
                return;
            }
            super.onReceivedError(view, errorCode, description, failingUrl);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && response.getStatusCode() >= 500) {
                activity.mainNavigationFailed(request.getUrl().toString(), "http_status=" + response.getStatusCode(), false);
                return;
            }
            super.onReceivedHttpError(view, request, response);
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            // Never bypass certificate validation. Cancel then cover the system page with safe native UI.
            handler.cancel();
            String url = error == null || error.getUrl() == null ? activity.lastMainUrl : error.getUrl();
            if (activity.isMainQueenChatUrl(url) && url.equals(view.getUrl())) {
                activity.mainNavigationFailed(url, "ssl_error", true);
            }
        }
    }
}
