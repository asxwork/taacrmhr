package com.theadvisorassociates.ams;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;

/**
 * AMS for Android: the AMS website in a full-screen WebView, with what the site needs from the phone:
 * camera (selfie check-in, receipt photos), location (check-in), file uploads, downloads (PDF / Excel / CSV),
 * printing, phone / WhatsApp links, and a retry screen when there is no internet.
 */
public class MainActivity extends Activity {
    static final String HOME = "https://ams.theadvisorassociates.com/";
    static final String HOST = "ams.theadvisorassociates.com";
    private static final int REQ_FILE = 10, REQ_PERM_CAMERA = 11, REQ_PERM_LOCATION = 12, REQ_PERM_FILE = 13;

    private WebView web;
    private ProgressBar bar;
    private View offline;
    private ValueCallback<Uri[]> fileCallback;
    private WebChromeClient.FileChooserParams fileParams;
    private Uri cameraUri;
    private PermissionRequest pendingMedia;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#06121E"));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setVisibility(View.GONE);
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));
        offline = Offline.build(this, new View.OnClickListener() {
            @Override public void onClick(View v) { retry(); }
        });
        offline.setVisibility(View.GONE);
        root.addView(offline, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportMultipleWindows(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " AMSApp/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

        web.addJavascriptInterface(new Bridge(), "AMSApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(new Downloads());

        if (state != null) web.restoreState(state);
        if (state == null || web.getUrl() == null) web.loadUrl(startUrl(getIntent()));
    }

    private String startUrl(Intent i) {
        Uri u = i == null ? null : i.getData();
        return u != null && HOST.equals(u.getHost()) ? u.toString() : HOME;
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        if (i.getData() != null) web.loadUrl(startUrl(i));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onBackPressed() {
        if (offline.getVisibility() == View.VISIBLE) { super.onBackPressed(); return; }
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    private void retry() {
        if (!online()) { Toast.makeText(this, "Still no internet connection", Toast.LENGTH_SHORT).show(); return; }
        offline.setVisibility(View.GONE);
        String u = web.getUrl();
        if (u == null || u.startsWith("about:")) web.loadUrl(HOME); else web.reload();
    }

    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo n = cm == null ? null : cm.getActiveNetworkInfo();
        return n != null && n.isConnected();
    }

    int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private boolean has(String perm) { return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED; }

    /** Anything that isn't the AMS website (phone, WhatsApp, maps, other sites) opens in the right app. */
    private boolean openOutside(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if ((scheme.equals("https") || scheme.equals("http")) && HOST.equals(u.getHost())) return false;
        try {
            Intent i;
            if (scheme.equals("intent")) i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
            else i = new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private class Client extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return openOutside(r.getUrl()); }
        @SuppressWarnings("deprecation")
        @Override public boolean shouldOverrideUrlLoading(WebView v, String url) { return openOutside(Uri.parse(url)); }

        @Override public void onPageStarted(WebView v, String url, Bitmap icon) { bar.setVisibility(View.VISIBLE); }

        @Override public void onPageFinished(WebView v, String url) {
            bar.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
            v.evaluateJavascript(Js.HOOKS, null);
        }

        @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (r.isForMainFrame()) { v.loadUrl("about:blank"); offline.setVisibility(View.VISIBLE); }
        }
    }

    private class Chrome extends WebChromeClient {
        @Override public void onProgressChanged(WebView v, int p) { bar.setProgress(p); if (p >= 100) bar.setVisibility(View.GONE); }

        /** Camera / microphone for the page (selfie check-in, calls). */
        @Override public void onPermissionRequest(final PermissionRequest req) {
        	runOnUiThread(new Runnable() { @Override public void run() {
                if (req.getOrigin() == null || !HOST.equals(req.getOrigin().getHost())) { req.deny(); return; }
                ArrayList<String> need = new ArrayList<String>();
                for (String res : req.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res) && !has(Manifest.permission.CAMERA)) need.add(Manifest.permission.CAMERA);
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res) && !has(Manifest.permission.RECORD_AUDIO)) need.add(Manifest.permission.RECORD_AUDIO);
                }
                if (need.isEmpty()) { req.grant(req.getResources()); return; }
                pendingMedia = req;
                requestPermissions(need.toArray(new String[0]), REQ_PERM_CAMERA);
            }});
        }

        /** Location for office check-in. */
        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) { cb.invoke(origin, true, false); return; }
            geoOrigin = origin; geoCallback = cb;
            requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_PERM_LOCATION);
        }

        /** File inputs: pick a file, or take a photo with the camera when the input accepts images. */
        @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb; fileParams = params;
            if (wantsImages(params) && !has(Manifest.permission.CAMERA)) { requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_PERM_FILE); return true; }
            openChooser();
            return true;
        }
    }

    private static boolean wantsImages(WebChromeClient.FileChooserParams p) {
        String[] types = p.getAcceptTypes();
        if (types == null || types.length == 0) return true;
        for (String t : types) for (String one : t.split(",")) {
            String x = one.trim().toLowerCase();
            if (x.isEmpty() || x.startsWith("image") || x.equals("*/*") || x.endsWith(".jpg") || x.endsWith(".jpeg") || x.endsWith(".png") || x.endsWith(".webp")) return true;
        }
        return false;
    }

    private void openChooser() {
        Intent pick;
        try { pick = fileParams.createIntent(); } catch (Exception e) { pick = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*"); }
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        if (fileParams.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        Intent chooser = Intent.createChooser(pick, "Choose a file");
        cameraUri = null;
        if (wantsImages(fileParams) && has(Manifest.permission.CAMERA)) {
            try {
                File dir = new File(getCacheDir(), "camera");
                dir.mkdirs();
                File f = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
                cameraUri = CameraFiles.uriFor(f);
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { cam });
            } catch (Exception ignored) { cameraUri = null; }
        }
        try { startActivityForResult(chooser, REQ_FILE); }
        catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; }
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        if (req != REQ_FILE) { super.onActivityResult(req, result, data); return; }
        if (fileCallback == null) return;
        Uri[] out = null;
        if (result == RESULT_OK) {
            if (data != null && data.getClipData() != null) {
                out = new Uri[data.getClipData().getItemCount()];
                for (int i = 0; i < out.length; i++) out[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                out = new Uri[] { data.getData() };
            } else if (cameraUri != null && CameraFiles.fileFor(cameraUri) != null && CameraFiles.fileFor(cameraUri).length() > 0) {
                out = new Uri[] { cameraUri };
            }
        }
        fileCallback.onReceiveValue(out);
        fileCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        boolean ok = results.length > 0;
        for (int r : results) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
        if (req == REQ_PERM_CAMERA && pendingMedia != null) {
            if (ok) pendingMedia.grant(pendingMedia.getResources()); else { pendingMedia.deny(); Toast.makeText(this, "Allow the camera in Settings to use it in AMS", Toast.LENGTH_LONG).show(); }
            pendingMedia = null;
        } else if (req == REQ_PERM_LOCATION && geoCallback != null) {
            boolean any = false;
            for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) any = true;
            geoCallback.invoke(geoOrigin, any, false);
            if (!any) Toast.makeText(this, "Allow location in Settings to check in", Toast.LENGTH_LONG).show();
            geoCallback = null;
        } else if (req == REQ_PERM_FILE && fileCallback != null) {
            openChooser(); // without the camera permission it simply offers files only
        }
    }

    /** Normal downloads (Excel, CSV, payslips…) go through Android's download manager with the login cookie. */
    private class Downloads implements DownloadListener {
        @Override public void onDownloadStart(String url, String ua, String disposition, String mime, long length) {
            if (url.startsWith("blob:") || url.startsWith("data:")) { web.evaluateJavascript(Js.saveBlob(url, ""), null); return; }
            try {
                String name = URLUtil.guessFileName(url, disposition, mime);
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                r.addRequestHeader("User-Agent", ua);
                r.setMimeType(mime);
                r.setTitle(name);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                Toast.makeText(MainActivity.this, "Downloading " + name, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(MainActivity.this, "Download failed", Toast.LENGTH_SHORT).show();
            }
        }
    }

    /** Called from the page (see Js): PDFs made in the browser, and Print. */
    private class Bridge {
        @JavascriptInterface public void save(final String base64, final String mime, final String fileName) {
            runOnUiThread(new Runnable() { @Override public void run() { saveFile(base64, mime, fileName); } });
        }

        @JavascriptInterface public void print(final String title) {
            runOnUiThread(new Runnable() { @Override public void run() {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                String name = title == null || title.isEmpty() ? "AMS" : title;
                PrintDocumentAdapter a = web.createPrintDocumentAdapter(name);
                pm.print(name, a, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            }});
        }
    }

    private void saveFile(String base64, String mime, String fileName) {
        String name = fileName == null || fileName.trim().isEmpty() ? "AMS-" + System.currentTimeMillis() : fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (mime == null || mime.isEmpty()) mime = "application/octet-stream";
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Uri saved;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                saved = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                OutputStream o = getContentResolver().openOutputStream(saved);
                o.write(bytes); o.close();
            } else {
                if (!has(Manifest.permission.WRITE_EXTERNAL_STORAGE)) { requestPermissions(new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, 99); Toast.makeText(this, "Allow storage, then press Download again", Toast.LENGTH_LONG).show(); return; }
                File f = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), name);
                FileOutputStream o = new FileOutputStream(f);
                o.write(bytes); o.close();
                saved = null;
            }
            Toast.makeText(this, "Saved to Downloads: " + name, Toast.LENGTH_LONG).show();
            if (saved != null) {
                try {
                    Intent open = new Intent(Intent.ACTION_VIEW).setDataAndType(saved, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(open);
                } catch (Exception ignored) { }
            }
        } catch (Exception e) {
            Toast.makeText(this, "Could not save the file", Toast.LENGTH_SHORT).show();
        }
    }
}
