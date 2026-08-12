package ru.queenchat.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.Dialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.content.res.ColorStateList;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.InputStream;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Safe, user-mediated updater for release-signed QueenChat APKs. */
final class AndroidUpdateManager {
    private static final String VERSION_URL = "https://queenchat.ru/api/app/android/version";
    private static final String EVENT_URL = "https://queenchat.ru/api/app/android/update-events";
    private static final long CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L;
    private static final String PREFS = "queenchat.android_update";
    private static final String PREF_LAST_CHECK = "last_check";
    private static final String PREF_DOWNLOAD_ID = "download_id";
    private static final String PREF_RELEASE = "release";

    private enum State { IDLE, CHECKING, AVAILABLE, DOWNLOADING, VERIFYING, READY_TO_INSTALL, ERROR }
    private final Activity activity;
    private final DownloadManager downloadManager;
    private final SharedPreferences prefs;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private State state = State.IDLE;
    private JSONObject release;
    private Dialog dialog;
    private LinearLayout dialogBody;
    private long downloadId = -1L;
    private boolean receiverRegistered;
    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction()) &&
                    intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) == downloadId) verifyDownload();
        }
    };

    AndroidUpdateManager(Activity activity) {
        this.activity = activity;
        this.downloadManager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    void checkAfterStartup() {
        if (isDebugBuild()) return; // Debug installs must never offer production APKs.
        if (prefs.getLong(PREF_LAST_CHECK, 0L) + CHECK_INTERVAL_MS > System.currentTimeMillis()) return;
        checkForUpdate();
    }

    void checkForUpdate() {
        if (state == State.CHECKING || state == State.DOWNLOADING || isDebugBuild()) return;
        state = State.CHECKING;
        executor.execute(() -> {
            try {
                HttpsURLConnection connection = (HttpsURLConnection) new URL(VERSION_URL).openConnection();
                connection.setConnectTimeout(8_000); connection.setReadTimeout(8_000); connection.setRequestMethod("GET");
                if (connection.getResponseCode() != 200) throw new IllegalStateException("release unavailable");
                StringBuilder body = new StringBuilder(); byte[] buffer = new byte[4096]; int read;
                try (InputStream input = new BufferedInputStream(connection.getInputStream())) {
                    while ((read = input.read(buffer)) != -1) body.append(new String(buffer, 0, read, java.nio.charset.StandardCharsets.UTF_8));
                } finally { connection.disconnect(); }
                JSONObject candidate = new JSONObject(body.toString());
                if (!isValidRelease(candidate)) throw new IllegalStateException("invalid release");
                prefs.edit().putLong(PREF_LAST_CHECK, System.currentTimeMillis()).apply();
                int local = localVersionCode();
                if (candidate.getInt("version_code") <= local) { state = State.IDLE; return; }
                release = candidate; state = State.AVAILABLE;
                activity.runOnUiThread(() -> showUpdateDialog(local < release.optInt("minimum_version_code")));
            } catch (Exception ignored) { state = State.IDLE; }
        });
    }

    void onResume() {
        if (state == State.READY_TO_INSTALL && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                activity.getPackageManager().canRequestPackageInstalls()) installVerifiedApk();
    }
    void onDestroy() { unregisterReceiver(); executor.shutdownNow(); }

    private void showUpdateDialog(boolean mandatory) {
        dismissDialog(); dialog = brandedDialog(); LinearLayout content = dialogContent();
        addLogo(content); addText(content, "Доступно обновление", 23, Color.WHITE, true, 20);
        addText(content, "QueenChat " + release.optString("version_name"), 16, Color.rgb(233,213,255), false, 8);
        addText(content, "Что нового:", 15, Color.WHITE, true, 24);
        JSONArray changes = release.optJSONArray("changelog");
        for (int i = 0; changes != null && i < Math.min(5, changes.length()); i++) addText(content, "• " + changes.optString(i), 14, Color.rgb(216,180,254), false, 7);
        long size = release.optLong("size_bytes", 0L);
        if (size > 0) addText(content, "Размер: " + String.format(Locale.US, "%.1f МБ", size / 1048576d), 13, Color.rgb(167,139,250), false, 20);
        Button update = button("Обновить", true); update.setOnClickListener(v -> startDownload()); content.addView(update, buttonParams(18));
        if (!mandatory) { Button later = button("Позже", false); later.setOnClickListener(v -> dismissDialog()); content.addView(later, buttonParams(10)); }
        dialog.show();
    }

    private void startDownload() {
        if (state == State.DOWNLOADING || release == null) return;
        try {
            Uri apkUri = Uri.parse(release.getString("apk_url"));
            if (!"https".equals(apkUri.getScheme()) || !"queenchat.ru".equals(apkUri.getHost())) throw new IllegalStateException();
            state = State.DOWNLOADING; showProgress("Скачивание обновления", 0);
            File directory = new File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates");
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException();
            cleanOldApks(directory);
            String name = "queenchat-update-" + release.getInt("version_code") + ".apk";
            DownloadManager.Request request = new DownloadManager.Request(apkUri)
                .setAllowedOverMetered(true).setAllowedOverRoaming(false)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setTitle("Обновление QueenChat")
                .setDescription("Скачивание обновления")
                .setMimeType("application/vnd.android.package-archive")
                .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, "updates/" + name);
            downloadId = downloadManager.enqueue(request);
            prefs.edit().putLong(PREF_DOWNLOAD_ID, downloadId).putString(PREF_RELEASE, release.toString()).apply();
            registerReceiver(); monitorDownload();
        } catch (Exception ignored) { downloadFailed(); }
    }

    private void monitorDownload() {
        executor.execute(() -> {
            while (state == State.DOWNLOADING) {
                DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                try (android.database.Cursor cursor = downloadManager.query(query)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        long done = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        if (total > 0) activity.runOnUiThread(() -> showProgress("Скачивание обновления", (int) (done * 100 / total)));
                        if (status == DownloadManager.STATUS_SUCCESSFUL) { verifyDownload(); return; }
                        if (status == DownloadManager.STATUS_FAILED) { downloadFailed(); return; }
                    }
                } catch (Exception ignored) { downloadFailed(); return; }
                try { Thread.sleep(500); } catch (InterruptedException ignored) { return; }
            }
        });
    }

    private void verifyDownload() {
        if (state == State.VERIFYING || release == null) return;
        state = State.VERIFYING; activity.runOnUiThread(() -> showProgress("Проверяем обновление", -1));
        executor.execute(() -> {
            File file = apkFile(); boolean valid = file != null && file.isFile() &&
                (release.optLong("size_bytes", -1L) <= 0 || file.length() == release.optLong("size_bytes")) &&
                sha256(file).equalsIgnoreCase(release.optString("sha256"));
            if (!valid) { if (file != null) file.delete(); postEvent("verify_failed"); showError("Не удалось проверить обновление.\nПопробуйте скачать его ещё раз.", true); return; }
            postEvent("download_success"); state = State.READY_TO_INSTALL; activity.runOnUiThread(this::installVerifiedApk);
        });
    }

    private void installVerifiedApk() {
        File file = apkFile(); if (file == null || !file.isFile()) { showError("Не удалось открыть обновление.", true); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
            showUnknownSources(); return;
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
        Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(install);
    }

    private void showUnknownSources() {
        dismissDialog(); dialog = brandedDialog(); LinearLayout content = dialogContent(); addLogo(content);
        addText(content, "Разрешите установку обновлений", 22, Color.WHITE, true, 20);
        addText(content, "Чтобы обновить QueenChat, разрешите установку приложений из этого источника.", 15, Color.rgb(233,213,255), false, 12);
        Button settings = button("Открыть настройки", true); settings.setOnClickListener(v -> activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())))); content.addView(settings, buttonParams(24)); dialog.show();
    }

    private void showProgress(String title, int percent) { if (dialog == null || !dialog.isShowing()) { dialog = brandedDialog(); dialog.show(); } LinearLayout content = dialogContent(); content.removeAllViews(); addLogo(content); addText(content, title, 21, Color.WHITE, true, 20); ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal); progress.setIndeterminate(percent < 0); progress.setMax(100); if (percent >= 0) progress.setProgress(percent); content.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(8))); addText(content, percent < 0 ? "" : percent + "%", 14, Color.rgb(216,180,254), false, 12); }
    private void showError(String message, boolean retry) { state = State.ERROR; postEvent("download_failed"); activity.runOnUiThread(() -> { dismissDialog(); dialog = brandedDialog(); LinearLayout c = dialogContent(); addLogo(c); addText(c, "Не удалось скачать обновление", 22, Color.WHITE, true, 20); addText(c, message, 15, Color.rgb(233,213,255), false, 12); Button b = button(retry ? "Повторить" : "Закрыть", true); b.setOnClickListener(v -> { if (retry) startDownload(); else dismissDialog(); }); c.addView(b, buttonParams(24)); dialog.show(); }); }
    private void downloadFailed() { postEvent("download_failed"); showError("Проверьте подключение к интернету и попробуйте ещё раз.", true); }

    private boolean isValidRelease(JSONObject value) { try { Uri uri = Uri.parse(value.getString("apk_url")); return value.getInt("version_code") > 0 && value.getInt("minimum_version_code") > 0 && value.getLong("size_bytes") > 0 && value.getString("sha256").matches("(?i)[a-f0-9]{64}") && "https".equals(uri.getScheme()) && "queenchat.ru".equals(uri.getHost()); } catch (Exception ignored) { return false; } }
    private int localVersionCode() { try { PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0); return (int) (Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode); } catch (Exception ignored) { return Integer.MAX_VALUE; } }
    private boolean isDebugBuild() { return (activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0; }
    private File apkFile() { return release == null ? null : new File(new File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates"), "queenchat-update-" + release.optInt("version_code") + ".apk"); }
    private String sha256(File file) { try (InputStream in = new BufferedInputStream(new java.io.FileInputStream(file))) { MessageDigest digest = MessageDigest.getInstance("SHA-256"); byte[] b = new byte[8192]; int n; while ((n = in.read(b)) >= 0) digest.update(b, 0, n); StringBuilder out = new StringBuilder(); for (byte x : digest.digest()) out.append(String.format(Locale.US, "%02x", x)); return out.toString(); } catch (Exception ignored) { return ""; } }
    private void cleanOldApks(File directory) { File[] files = directory.listFiles(); if (files != null) for (File file : files) if (file.getName().endsWith(".apk")) file.delete(); }
    private void registerReceiver() { if (!receiverRegistered) { IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE); if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED); else activity.registerReceiver(downloadReceiver, filter); receiverRegistered = true; } }
    private void unregisterReceiver() { if (receiverRegistered) { activity.unregisterReceiver(downloadReceiver); receiverRegistered = false; } }
    private void postEvent(String event) { executor.execute(() -> { try { HttpsURLConnection c = (HttpsURLConnection) new URL(EVENT_URL).openConnection(); c.setRequestMethod("POST"); c.setConnectTimeout(4_000); c.setReadTimeout(4_000); c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json"); c.getOutputStream().write(("{\"event\":\"" + event + "\"}").getBytes(java.nio.charset.StandardCharsets.UTF_8)); c.getResponseCode(); c.disconnect(); } catch (Exception ignored) {} }); }
    private Dialog brandedDialog() { Dialog d = new Dialog(activity); d.requestWindowFeature(Window.FEATURE_NO_TITLE); ScrollView scroll = new ScrollView(activity); dialogBody = new LinearLayout(activity); dialogBody.setOrientation(LinearLayout.VERTICAL); dialogBody.setGravity(Gravity.CENTER_HORIZONTAL); dialogBody.setPadding(dp(28), dp(28), dp(28), dp(28)); scroll.addView(dialogBody); d.setContentView(scroll); Window w = d.getWindow(); if (w != null) { w.setBackgroundDrawable(background()); w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); } return d; }
    private LinearLayout dialogContent() { return dialogBody; }
    private void addLogo(LinearLayout c) { ImageView logo = new ImageView(activity); logo.setImageResource(R.mipmap.ic_launcher_foreground); c.addView(logo, new LinearLayout.LayoutParams(dp(72), dp(72))); }
    private void addText(LinearLayout c, String text, int size, int color, boolean bold, int top) { TextView v = new TextView(activity); v.setText(text); v.setTextColor(color); v.setTextSize(size); v.setGravity(Gravity.CENTER); v.setLineSpacing(dp(3),1); v.setTypeface(null, bold ? 1 : 0); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); p.topMargin = dp(top); c.addView(v,p); }
    private Button button(String text, boolean primary) { Button b = new Button(activity); b.setText(text); b.setTextColor(primary ? Color.WHITE : Color.rgb(216,180,254)); b.setTextSize(16); b.setAllCaps(false); GradientDrawable bg = primary ? new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,new int[]{Color.rgb(168,85,247),Color.rgb(236,72,153)}) : background(); if (primary) bg.setCornerRadius(dp(12)); else bg.setColor(Color.TRANSPARENT); b.setBackground(primary ? new RippleDrawable(ColorStateList.valueOf(0x44ffffff),bg,null) : bg); return b; }
    private LinearLayout.LayoutParams buttonParams(int top) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50)); p.topMargin = dp(top); return p; }
    private GradientDrawable background() { GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{Color.rgb(15,23,42),Color.rgb(46,16,101),Color.rgb(15,23,42)}); bg.setCornerRadius(dp(22)); return bg; }
    private void dismissDialog() { if (dialog != null && dialog.isShowing()) dialog.dismiss(); }
    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
}
