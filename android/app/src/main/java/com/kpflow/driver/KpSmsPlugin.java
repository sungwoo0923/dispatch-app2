package com.kpflow.driver;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 💬 2026-11-18 사내문자 — 웹 화면(src/officeSms/OfficeSmsLinkCard.jsx) ↔ 사내문자 서비스(KpSmsService).
 *  - link({ uid, refreshToken, apiKey, projectId, backfillDays }) : 문자 권한을 받고 연결 시작
 *  - unlink()  : 연결 끊기(서비스 멈춤 · 이 휴대폰에 저장한 로그인 정보 지움)
 *  - status()  : { supported, linked, uid, running, send, read, receive, ignoringBattery, authError }
 *  ⚠ 플레이스토어용(play) 앱에는 문자 권한이 없다 → supported:false, link()는 NOT_SUPPORTED.
 *    업무폰용(office) 앱(src/office/AndroidManifest.xml)에서만 동작한다.
 *  - requestIgnoreBattery() / openAppSettings()
 */
@CapacitorPlugin(
        name = "KpSms",
        permissions = {
                @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS, Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS })
        }
)
public class KpSmsPlugin extends Plugin {

    /** 이 앱(빌드)에 문자 권한이 들어 있나 — 업무폰용(office)만 true */
    private boolean supported() {
        try {
            String[] req = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
            if (req == null) return false;
            for (String p : req) if (Manifest.permission.SEND_SMS.equals(p)) return true;
        } catch (Exception ignored) {}
        return false;
    }

    @PluginMethod
    public void link(PluginCall call) {
        if (!supported()) { call.reject("NOT_SUPPORTED"); return; }
        String uid = call.getString("uid");
        String refreshToken = call.getString("refreshToken");
        String apiKey = call.getString("apiKey");
        String projectId = call.getString("projectId");
        if (uid == null || refreshToken == null || apiKey == null || projectId == null) {
            call.reject("uid/refreshToken/apiKey/projectId 필요");
            return;
        }
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "afterSmsPermission");
            return;
        }
        doLink(call);
    }

    @PermissionCallback
    private void afterSmsPermission(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("NOT_AUTHORIZED");
            return;
        }
        doLink(call);
    }

    private void doLink(PluginCall call) {
        Context ctx = getContext();
        String uid = call.getString("uid");
        SharedPreferences sp = ctx.getSharedPreferences(KpSmsService.PREFS, Context.MODE_PRIVATE);
        String prevUid = sp.getString("uid", null);
        SharedPreferences.Editor ed = sp.edit()
                .putString("uid", uid)
                .putString("refreshToken", call.getString("refreshToken"))
                .putString("apiKey", call.getString("apiKey"))
                .putString("projectId", call.getString("projectId"))
                .remove("authError");
        // 처음 연결(또는 다른 계정으로 바꿈)할 때만 어디서부터 올릴지 정한다 — 다시 연결하면 이어서
        if (prevUid == null || !prevUid.equals(uid) || sp.getLong("lastSmsId", -1) < 0) {
            int days = call.getInt("backfillDays", 2);
            long since = System.currentTimeMillis() - Math.max(0, days) * 86400000L;
            ed.putLong("lastSmsId", startId(ctx, "content://sms", "date", since));
            ed.putLong("lastMmsId", startId(ctx, "content://mms", "date", since / 1000L));
        }
        ed.apply();
        // 안드로이드 13+: 상단 "사내문자 연결 중" 알림 표시 권한
        if (Build.VERSION.SDK_INT >= 33 && getActivity() != null
                && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 4422);
        }
        try {
            if (prevUid != null && !prevUid.equals(uid)) KpSmsService.stop(ctx);
            KpSmsService.start(ctx);
            call.resolve(statusObj());
        } catch (Exception e) {
            call.reject("서비스 시작 실패: " + e.getMessage());
        }
    }

    /** since(밀리초 · MMS는 초) 이전 문자 중 가장 큰 번호 — 그 다음 문자부터 올린다. 문자함이 비었으면 0 */
    private static long startId(Context ctx, String uri, String dateCol, long since) {
        try (Cursor c = ctx.getContentResolver().query(Uri.parse(uri), new String[]{"_id"}, dateCol + " < ?", new String[]{String.valueOf(since)}, "_id DESC")) {
            if (c != null && c.moveToFirst()) return c.getLong(0);
        } catch (Exception ignored) {}
        // 기준보다 오래된 문자가 없으면(새 휴대폰) 처음부터
        return 0;
    }

    @PluginMethod
    public void unlink(PluginCall call) {
        getContext().getSharedPreferences(KpSmsService.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        KpSmsService.stop(getContext());
        call.resolve(statusObj());
    }

    @PluginMethod
    public void status(PluginCall call) {
        // 연결돼 있는데 서비스가 꺼져 있으면(앱 업데이트 · 강제 종료 뒤) 다시 켠다
        if (supported() && KpSmsService.linked(getContext()) && !KpSmsService.running) {
            try { KpSmsService.start(getContext()); } catch (Exception ignored) {}
        }
        call.resolve(statusObj());
    }

    private boolean granted(String p) {
        return ContextCompat.checkSelfPermission(getContext(), p) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject statusObj() {
        SharedPreferences sp = getContext().getSharedPreferences(KpSmsService.PREFS, Context.MODE_PRIVATE);
        JSObject o = new JSObject();
        o.put("supported", supported());
        o.put("linked", sp.getString("uid", null) != null);
        o.put("uid", sp.getString("uid", ""));
        o.put("running", KpSmsService.running);
        o.put("send", granted(Manifest.permission.SEND_SMS));
        o.put("read", granted(Manifest.permission.READ_SMS));
        o.put("receive", granted(Manifest.permission.RECEIVE_SMS));
        o.put("ignoringBattery", isIgnoringBattery());
        o.put("authError", sp.getString("authError", ""));
        o.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        return o;
    }

    private boolean isIgnoringBattery() {
        if (Build.VERSION.SDK_INT < 23) return true;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    @PluginMethod
    public void requestIgnoreBattery(PluginCall call) {
        try {
            if (!isIgnoringBattery() && Build.VERSION.SDK_INT >= 23) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
