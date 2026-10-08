package com.kpflow.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ⭐ 백그라운드 실시간 위치 전송 서비스.
 *
 * 예전 방식(웹 화면 JS가 위치를 받아 Firestore에 쓰는 방식)은 앱이 백그라운드로 가면
 * 안드로이드가 웹 화면(WebView)을 멈추거나 느리게 만들어 위치 전송이 끊겼다.
 * 이 서비스는 화면과 상관없이 네이티브(안드로이드)에서 직접 GPS를 받고,
 * Firestore REST API로 drivers/{uid} 문서와 gps_tracks에 바로 기록한다.
 * 상단 알림("KP-Flow 운행 추적 중")이 떠 있는 동안 계속 동작한다.
 */
public class KpLocationService extends Service {
    private static final String TAG = "KpLocation";
    private static final String CHANNEL_ID = "kp_tracking";
    private static final int NOTI_ID = 4411;
    static final String PREFS = "kp_location";

    private static final long MIN_TIME_MS = 5000;           // GPS 수신 간격
    private static final long DRIVER_UPLOAD_MS = 10000;     // drivers 문서 갱신 최소 간격
    private static final long TRACK_UPLOAD_MS = 30000;      // gps_tracks 저장 간격
    private static final double TRACK_UPLOAD_KM = 0.05;     // 또는 50m 이동 시 저장
    private static final float MAX_ACCURACY_M = 100f;       // 실시간 위치(drivers 문서) 허용 오차
    // ⭐ 정차 중(실내/주차장) GPS·와이파이 위치가 50~100m씩 튀어 지도에 "낙서"처럼
    // 그려졌다. 이동 경로(gps_tracks)·이동거리에는 정확한 위치만 쓰고, 멈춰 있을 땐 기록하지 않는다.
    private static final float TRACK_ACCURACY_M = 35f;
    private static final double STOPPED_SPEED_MS = 1.5;     // 약 5km/h 미만 = 정차
    private static final double STOPPED_MIN_MOVE_KM = 0.05; // 정차 중엔 50m 이상 벗어나야 기록

    public interface Listener { void onLocation(double lat, double lng, double speed, double accuracy); }
    static volatile Listener listener;
    static volatile boolean running = false;

    private LocationManager lm;
    private PowerManager.WakeLock wakeLock;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private Location lastDistLoc = null;
    private double pendingDistKm = 0;
    private long lastDriverUploadAt = 0;
    private long lastTrackAt = 0;
    private Location lastTrackLoc = null;
    private String idToken = null;
    private long idTokenExpAt = 0;

    private final LocationListener locListener = new LocationListener() {
        @Override public void onLocationChanged(Location loc) { handleLocation(loc); }
        @Override public void onStatusChanged(String p, int s, Bundle e) {}
        @Override public void onProviderEnabled(String p) {}
        @Override public void onProviderDisabled(String p) {}
    };

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, KpLocationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, KpLocationService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (sp.getString("uid", null) == null) { stopSelf(); return START_NOT_STICKY; }
        try {
            createChannel();
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0;
            ServiceCompat.startForeground(this, NOTI_ID, buildNotification(), type);
        } catch (Exception e) {
            // 안드로이드 14+: 앱이 화면에 없을 때(시스템 재시작 등) 위치 서비스를 시작하면 거부될 수 있다.
            Log.w(TAG, "startForeground 실패", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) {
            running = true;
            acquireWakeLock();
            startLocationUpdates();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        try { if (lm != null) lm.removeUpdates(locListener); } catch (Exception ignored) {}
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        io.shutdown();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "운행 위치 추적", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("운행 중 위치를 배차 담당자에게 실시간으로 전송합니다.");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("KP-Flow 운행 추적 중")
                .setContentText("위치를 배차 담당자에게 실시간 전송하고 있습니다")
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kpflow:tracking");
            wakeLock.acquire();
        } catch (Exception e) { Log.w(TAG, "wakelock 실패", e); }
    }

    private void startLocationUpdates() {
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, MIN_TIME_MS, 0f, locListener, Looper.getMainLooper());
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, MIN_TIME_MS * 2, 0f, locListener, Looper.getMainLooper());
            }
        } catch (SecurityException e) {
            Log.w(TAG, "위치 권한 없음", e);
            stopSelf();
        }
    }

    private Location bestRecent = null;

    private void handleLocation(Location loc) {
        if (loc == null) return;
        // GPS가 잡혀 있으면 정확도가 낮은 네트워크 위치는 무시
        if (bestRecent != null && LocationManager.NETWORK_PROVIDER.equals(loc.getProvider())
                && LocationManager.GPS_PROVIDER.equals(bestRecent.getProvider())
                && loc.getTime() - bestRecent.getTime() < 30000) return;
        bestRecent = loc;

        double lat = loc.getLatitude(), lng = loc.getLongitude();
        double speed = loc.hasSpeed() ? loc.getSpeed() : 0;
        double acc = loc.hasAccuracy() ? loc.getAccuracy() : 0;

        Listener l = listener;
        if (l != null) { try { l.onLocation(lat, lng, speed, acc); } catch (Exception ignored) {} }

        if (acc > MAX_ACCURACY_M) return;

        boolean precise = acc > 0 && acc <= TRACK_ACCURACY_M;
        boolean stopped = speed < STOPPED_SPEED_MS;

        // 이동거리: 정확한 위치끼리, 오차보다 크게 움직였을 때만 누적
        if (precise) {
            if (lastDistLoc != null) {
                double km = lastDistLoc.distanceTo(loc) / 1000.0;
                double minKm = Math.max(0.02, acc / 1000.0);
                if (km > minKm && !(stopped && km < STOPPED_MIN_MOVE_KM)) { pendingDistKm += km; lastDistLoc = loc; }
            } else {
                lastDistLoc = loc;
            }
        }

        long now = System.currentTimeMillis();
        double fromLastTrackKm = lastTrackLoc != null ? lastTrackLoc.distanceTo(loc) / 1000.0 : 999;
        boolean track = precise && (
                lastTrackLoc == null
                || (stopped ? fromLastTrackKm > STOPPED_MIN_MOVE_KM
                            : (now - lastTrackAt >= TRACK_UPLOAD_MS || fromLastTrackKm > TRACK_UPLOAD_KM)));
        if (now - lastDriverUploadAt < DRIVER_UPLOAD_MS && !track) return;

        lastDriverUploadAt = now;
        if (track) { lastTrackAt = now; lastTrackLoc = loc; }
        final double distKm = pendingDistKm;
        pendingDistKm = 0;
        final boolean writeTrack = track;
        final int speedKmh = (int) Math.round(speed * 3.6);
        final double accM = acc;
        io.execute(() -> upload(lat, lng, speedKmh, distKm, writeTrack, accM));
    }

    // ── Firestore REST ──────────────────────────────────────────────
    private void upload(double lat, double lng, int speedKmh, double distKm, boolean writeTrack, double accM) {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        String uid = sp.getString("uid", null);
        String projectId = sp.getString("projectId", null);
        if (uid == null || projectId == null) return;
        try {
            String token = getIdToken();
            if (token == null) return;
            String base = "projects/" + projectId + "/databases/(default)/documents/";

            JSONArray writes = new JSONArray();

            JSONObject loc = new JSONObject()
                    .put("lat", new JSONObject().put("doubleValue", lat))
                    .put("lng", new JSONObject().put("doubleValue", lng));
            JSONObject fields = new JSONObject()
                    .put("location", new JSONObject().put("mapValue", new JSONObject().put("fields", loc)))
                    .put("speed", new JSONObject().put("integerValue", String.valueOf(speedKmh)))
                    .put("nativeTracking", new JSONObject().put("booleanValue", true));
            JSONArray transforms = new JSONArray()
                    .put(new JSONObject().put("fieldPath", "updatedAt").put("setToServerValue", "REQUEST_TIME"));
            if (distKm > 0) {
                transforms.put(new JSONObject().put("fieldPath", "totalDistance")
                        .put("increment", new JSONObject().put("doubleValue", distKm)));
            }
            writes.put(new JSONObject()
                    .put("update", new JSONObject().put("name", base + "drivers/" + uid).put("fields", fields))
                    .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray().put("location").put("speed").put("nativeTracking")))
                    .put("updateTransforms", transforms)
                    .put("currentDocument", new JSONObject().put("exists", true)));

            if (writeTrack) {
                SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                f.setTimeZone(TimeZone.getTimeZone("Asia/Seoul"));
                JSONObject tf = new JSONObject()
                        .put("driverId", new JSONObject().put("stringValue", uid))
                        .put("lat", new JSONObject().put("doubleValue", lat))
                        .put("lng", new JSONObject().put("doubleValue", lng))
                        .put("speed", new JSONObject().put("integerValue", String.valueOf(speedKmh)))
                        .put("date", new JSONObject().put("stringValue", f.format(new Date())))
                        .put("source", new JSONObject().put("stringValue", "native"))
                        .put("accuracy", new JSONObject().put("doubleValue", accM));
                String trackId = UUID.randomUUID().toString().replace("-", "").substring(0, 20);
                writes.put(new JSONObject()
                        .put("update", new JSONObject().put("name", base + "gps_tracks/" + trackId).put("fields", tf))
                        .put("updateTransforms", new JSONArray()
                                .put(new JSONObject().put("fieldPath", "timestamp").put("setToServerValue", "REQUEST_TIME")))
                        .put("currentDocument", new JSONObject().put("exists", false)));
            }

            String url = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents:commit";
            int code = httpJson(url, new JSONObject().put("writes", writes).toString(), token, null);
            if (code == 401 || code == 403) { idToken = null; idTokenExpAt = 0; }
            if (code >= 300) Log.w(TAG, "업로드 실패 HTTP " + code);
        } catch (Exception e) {
            Log.w(TAG, "업로드 오류", e);
        }
    }

    private String getIdToken() throws Exception {
        if (idToken != null && System.currentTimeMillis() < idTokenExpAt - 120000) return idToken;
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        String refresh = sp.getString("refreshToken", null);
        String apiKey = sp.getString("apiKey", null);
        if (refresh == null || apiKey == null) return null;
        String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8");
        StringBuilder out = new StringBuilder();
        int code = httpForm("https://securetoken.googleapis.com/v1/token?key=" + apiKey, body, out);
        if (code != 200) { Log.w(TAG, "토큰 갱신 실패 HTTP " + code); return null; }
        JSONObject j = new JSONObject(out.toString());
        idToken = j.getString("id_token");
        idTokenExpAt = System.currentTimeMillis() + Long.parseLong(j.optString("expires_in", "3600")) * 1000L;
        String newRefresh = j.optString("refresh_token", null);
        if (newRefresh != null && !newRefresh.isEmpty()) sp.edit().putString("refreshToken", newRefresh).apply();
        return idToken;
    }

    private static int httpJson(String url, String json, String bearer, StringBuilder out) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
        try (OutputStream os = c.getOutputStream()) { os.write(json.getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        readBody(c, code, out);
        c.disconnect();
        return code;
    }

    private static int httpForm(String url, String form, StringBuilder out) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        try (OutputStream os = c.getOutputStream()) { os.write(form.getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        readBody(c, code, out);
        c.disconnect();
        return code;
    }

    private static void readBody(HttpURLConnection c, int code, StringBuilder out) {
        try {
            InputStream is = code < 400 ? c.getInputStream() : c.getErrorStream();
            if (is == null) return;
            BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            String line;
            StringBuilder sb = out != null ? out : new StringBuilder();
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
            if (code >= 400) Log.w(TAG, "응답: " + sb);
        } catch (Exception ignored) {}
    }
}
