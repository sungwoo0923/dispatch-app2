package com.kpflow.driver;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * JS(DriverHome.jsx) ↔ 네이티브 위치 서비스(KpLocationService) 연결.
 *  - start({ uid, refreshToken, apiKey, projectId }) : 권한 요청 후 추적 시작
 *  - stop()                                           : 추적 중지(퇴근/로그아웃)
 *  - status()                                         : 추적중/권한/배터리최적화 상태
 *  - requestIgnoreBattery() / openAppSettings()
 *  - "location" 이벤트 : 앱 화면이 켜져 있을 때 화면 표시용 위치
 */
@CapacitorPlugin(
        name = "KpLocation",
        permissions = {
                @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
        }
)
public class KpLocationPlugin extends Plugin {

    @Override
    public void load() {
        KpLocationService.listener = (lat, lng, speed, acc) -> {
            JSObject o = new JSObject();
            o.put("lat", lat);
            o.put("lng", lng);
            o.put("speed", speed);
            o.put("accuracy", acc);
            notifyListeners("location", o);
        };
    }

    @PluginMethod
    public void start(PluginCall call) {
        String uid = call.getString("uid");
        String refreshToken = call.getString("refreshToken");
        String apiKey = call.getString("apiKey");
        String projectId = call.getString("projectId");
        if (uid == null || refreshToken == null || apiKey == null || projectId == null) {
            call.reject("uid/refreshToken/apiKey/projectId 필요");
            return;
        }
        SharedPreferences sp = getContext().getSharedPreferences(KpLocationService.PREFS, Context.MODE_PRIVATE);
        sp.edit()
                .putString("uid", uid)
                .putString("refreshToken", refreshToken)
                .putString("apiKey", apiKey)
                .putString("projectId", projectId)
                .apply();

        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterLocationPermission");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void afterLocationPermission(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("NOT_AUTHORIZED");
            return;
        }
        startService(call);
    }

    private void startService(PluginCall call) {
        // 안드로이드 13+: 상단 "운행 추적 중" 알림 표시 권한(거부해도 추적 자체는 동작)
        if (Build.VERSION.SDK_INT >= 33 && getActivity() != null
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 4412);
        }
        try {
            KpLocationService.start(getContext());
            call.resolve(statusObj());
        } catch (Exception e) {
            call.reject("서비스 시작 실패: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().getSharedPreferences(KpLocationService.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        KpLocationService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObj());
    }

    private JSObject statusObj() {
        JSObject o = new JSObject();
        o.put("running", KpLocationService.running);
        o.put("locationGranted", getPermissionState("location") == PermissionState.GRANTED);
        o.put("backgroundGranted", Build.VERSION.SDK_INT < 29
                || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED);
        o.put("ignoringBattery", isIgnoringBattery());
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
