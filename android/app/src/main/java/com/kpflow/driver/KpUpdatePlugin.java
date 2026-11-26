package com.kpflow.driver;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * ⭐ 2026-11-26 기사앱 APK 업데이트를 앱 안에서 바로 — 예전엔 브라우저로 파일을 받고 다운로드 폴더에서 찾아 눌러야 했다.
 *  - info()                 : { canInstall, samsung, sdk, versionCode } — canInstall = "이 앱에서 설치 허용"이 켜져 있는지
 *  - download({ url })      : APK 를 앱 임시 폴더에 받는다(진행률 이벤트 "progress" { pct })
 *  - install()              : 받아 둔 APK 로 안드로이드 설치 화면을 연다 → 기사님은 [업데이트] 한 번만 누르면 된다
 *  - openInstallPermission(): "출처를 알 수 없는 앱 설치 · 이 앱에서 허용" 화면(이 앱 항목으로 바로)
 *  - openAutoBlocker()      : 삼성 "보안 위험 자동 차단" 이 있는 화면 — 바로 가는 공식 주소가 없어서
 *                             알려진 화면들을 차례로 시도하고, 없으면 "보안 및 개인정보 보호" 화면을 연다(맨 위에 자동 차단이 있다)
 */
@CapacitorPlugin(name = "KpUpdate")
public class KpUpdatePlugin extends Plugin {

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "apk");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "LogisWeb-Driver.apk");
    }

    private boolean canInstall() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        try { return getContext().getPackageManager().canRequestPackageInstalls(); } catch (Exception e) { return false; }
    }

    private boolean isSamsung() {
        return "samsung".equalsIgnoreCase(Build.MANUFACTURER);
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("canInstall", canInstall());
        ret.put("samsung", isSamsung());
        ret.put("sdk", Build.VERSION.SDK_INT);
        long code = 0;
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception ignored) { }
        ret.put("versionCode", code);
        File f = apkFile();
        ret.put("downloaded", f.exists() && f.length() > 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("BAD_URL"); return; }
        new Thread(() -> {
            HttpURLConnection c = null;
            File tmp = new File(apkFile().getParentFile(), "download.part");
            try {
                URL u = new URL(url);
                // GitHub 릴리즈 주소는 다른 주소로 넘겨준다 — https → https 만 따라간다
                for (int hop = 0; hop < 6; hop++) {
                    c = (HttpURLConnection) u.openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    c.setRequestProperty("Accept", "application/octet-stream");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = c.getHeaderField("Location");
                        c.disconnect();
                        if (loc == null) throw new Exception("NO_REDIRECT");
                        u = new URL(u, loc);
                        if (!"https".equals(u.getProtocol())) throw new Exception("NOT_HTTPS");
                        continue;
                    }
                    if (code != 200) throw new Exception("HTTP_" + code);
                    break;
                }
                long total = c.getContentLengthLong();
                InputStream in = c.getInputStream();
                FileOutputStream out = new FileOutputStream(tmp);
                byte[] buf = new byte[64 * 1024];
                long got = 0; int n; int lastPct = -1;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    got += n;
                    if (total > 0) {
                        int pct = (int) (got * 100 / total);
                        if (pct != lastPct) { lastPct = pct; JSObject p = new JSObject(); p.put("pct", pct); notifyListeners("progress", p); }
                    }
                }
                out.close(); in.close();
                File f = apkFile();
                if (f.exists()) f.delete();
                if (!tmp.renameTo(f)) throw new Exception("RENAME_FAILED");
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("bytes", got);
                ret.put("canInstall", canInstall());
                call.resolve(ret);
            } catch (Exception e) {
                try { tmp.delete(); } catch (Exception ignored) { }
                call.reject("DOWNLOAD_FAILED: " + e.getMessage());
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile();
        if (!f.exists() || f.length() == 0) { call.reject("NO_APK"); return; }
        if (!canInstall()) {
            JSObject r = new JSObject(); r.put("started", false); r.put("needPermission", true); r.put("samsung", isSamsung());
            call.resolve(r); return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            JSObject r = new JSObject(); r.put("started", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("INSTALL_FAILED: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openInstallPermission(PluginCall call) {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("OPEN_FAILED: " + e.getMessage());
        }
    }

    private boolean tryStart(Intent i) {
        try {
            // 안드로이드 11부터 다른 앱 화면이 있는지 미리 묻기(resolveActivity)가 막혀 있어 그냥 열어 보고 실패하면 다음으로
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void openAutoBlocker(PluginCall call) {
        String opened = "";
        if (isSamsung()) {
            // 삼성 설정 앱 안의 자동 차단 화면(기종 · 버전마다 이름이 달라 있는 것만 연다 — 없으면 건너뜀)
            String[][] comps = {
                {"com.android.settings", "com.samsung.android.settings.security.autoblocker.AutoBlockerSettingsActivity"},
                {"com.android.settings", "com.android.settings.Settings$AutoBlockerSettingsActivity"},
                {"com.samsung.android.sm.devicesecurity", "com.samsung.android.sm.autoblocker.ui.AutoBlockerActivity"},
            };
            for (String[] cpn : comps) {
                Intent i = new Intent();
                i.setComponent(new ComponentName(cpn[0], cpn[1]));
                if (tryStart(i)) { opened = "autoBlocker"; break; }
            }
        }
        if (opened.isEmpty() && tryStart(new Intent(Settings.ACTION_SECURITY_SETTINGS))) opened = "security";
        if (opened.isEmpty() && tryStart(new Intent(Settings.ACTION_SETTINGS))) opened = "settings";
        JSObject r = new JSObject(); r.put("opened", opened);
        call.resolve(r);
    }
}
