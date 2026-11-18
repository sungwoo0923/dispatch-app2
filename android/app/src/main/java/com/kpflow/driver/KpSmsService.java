package com.kpflow.driver;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.telephony.SmsManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * 💬 2026-11-18 사내문자 — 직원 업무폰과 PC 배차 프로그램을 문자로 연결하는 서비스.
 *
 *  ① PC에서 보낸 문자: smsBox/{uid}/msgs 에 status "queued"로 들어온 문서를 몇 초마다 가져와
 *     이 휴대폰(업무폰)으로 보낸다 → 결과(sent · failed)를 다시 문서에 적는다.
 *  ② 받은 문자 · 휴대폰에서 직접 보낸 문자: 휴대폰 문자함(SMS · MMS/LMS)을 읽어 같은 곳에 올린다.
 *     문서 이름이 문자함 번호로 정해져 있어 같은 문자를 두 번 올려도 한 건만 남는다.
 *  ③ smsBox/{uid} 에 1분마다 "살아 있음"(serviceAt)을 적는다 → PC 창에 "업무폰 연결됨"이 보인다.
 *
 *  🔒 문서는 smsBox/{로그인한 직원 uid} 아래에만 쓴다. 보안 규칙이 본인만 읽고 쓰게 막는다(최고관리자 포함 누구도 못 본다).
 *  상단 알림("LogisWeb 사내문자 연결 중")이 떠 있는 동안 계속 동작한다.
 */
public class KpSmsService extends Service {
    private static final String TAG = "KpSms";
    static final String PREFS = "kp_sms";
    private static final String CHANNEL_ID = "kp_office_sms";
    private static final int NOTI_ID = 4421;
    private static final String ACTION_SENT = "com.kpflow.driver.KP_SMS_SENT";
    static final String ACTION_SYNC = "com.kpflow.driver.KP_SMS_SYNC";

    private static final long HOT_MS = 3000;             // 최근에 주고받았으면 3초마다 확인
    private static final long IDLE_MS = 8000;            // 평소에는 8초마다
    private static final long HOT_WINDOW_MS = 5 * 60000; // 마지막으로 주고받은 뒤 5분 동안은 빠르게
    private static final long HEARTBEAT_MS = 60000;
    private static final long STALE_QUEUED_MS = 30 * 60000; // 30분 넘게 기다린 문자는 보내지 않는다(오래된 오더 문자 방지)
    private static final long OWN_SENT_KEEP_MS = 10 * 60000;

    static volatile boolean running = false;

    private KpRest rest;
    private HandlerThread worker;
    private Handler bg;
    private PowerManager.WakeLock wakeLock;
    private long lastHeartbeatAt = 0;
    private long hotUntil = 0;
    private boolean authNotified = false;
    private final ArrayList<ContentObserver> observers = new ArrayList<>();
    // PC에서 보낸 문자가 휴대폰 "보낸 문자함"에 다시 나타나면 두 번 올리지 않게 기억(번호|내용 → 보낸 시각)
    private final HashMap<String, Long> ownSent = new HashMap<>();
    // 여러 조각으로 나뉜 긴 문자 — 문서 이름 → 남은 조각 수
    private final HashMap<String, Integer> partsLeft = new HashMap<>();

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            try { cycle(); } catch (Exception e) { Log.w(TAG, "cycle 오류", e); }
            if (running) bg.postDelayed(this, System.currentTimeMillis() < hotUntil ? HOT_MS : IDLE_MS);
        }
    };
    private final Runnable syncSoon = () -> { try { syncProvider(); } catch (Exception e) { Log.w(TAG, "sync 오류", e); } };

    private final BroadcastReceiver sentReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent intent) {
            final String doc = intent.getStringExtra("doc");
            final int rc = getResultCode();
            if (doc == null || bg == null) return;
            bg.post(() -> onPartResult(doc, rc));
        }
    };

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, KpSmsService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, KpSmsService.class));
    }

    static boolean linked(Context ctx) {
        return ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getString("uid", null) != null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!linked(this)) { stopSelf(); return START_NOT_STICKY; }
        try {
            createChannel();
            int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING : 0;
            ServiceCompat.startForeground(this, NOTI_ID, buildNotification("PC와 문자를 주고받고 있어요"), type);
        } catch (Exception e) {
            Log.w(TAG, "startForeground 실패", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) {
            running = true;
            rest = new KpRest(this, PREFS);
            worker = new HandlerThread("kpSms");
            worker.start();
            bg = new Handler(worker.getLooper());
            acquireWakeLock();
            ContextCompat.registerReceiver(this, sentReceiver, new IntentFilter(ACTION_SENT), ContextCompat.RECEIVER_NOT_EXPORTED);
            watchProvider();
            hotUntil = System.currentTimeMillis() + HOT_WINDOW_MS;
            bg.post(tick);
        } else if (intent != null && ACTION_SYNC.equals(intent.getAction())) {
            hotUntil = System.currentTimeMillis() + HOT_WINDOW_MS;
            bg.removeCallbacks(syncSoon);
            bg.postDelayed(syncSoon, 2500);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        for (ContentObserver o : observers) { try { getContentResolver().unregisterContentObserver(o); } catch (Exception ignored) {} }
        observers.clear();
        try { unregisterReceiver(sentReceiver); } catch (Exception ignored) {}
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        if (worker != null) worker.quitSafely();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    // ── 알림 ──
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "사내문자 연결", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("PC 배차 프로그램과 업무폰 문자를 주고받는 동안 표시됩니다.");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("LogisWeb 사내문자 연결 중")
                .setContentText(text)
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void setNotiText(String text) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTI_ID, buildNotification(text));
        } catch (Exception ignored) {}
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kpflow:officeSms");
            wakeLock.acquire();
        } catch (Exception e) { Log.w(TAG, "wakelock 실패", e); }
    }

    // ── 휴대폰 문자함이 바뀌면 바로 확인 ──
    private void watchProvider() {
        ContentResolver cr = getContentResolver();
        String[] uris = { "content://sms", "content://mms", "content://mms-sms" };
        for (String u : uris) {
            ContentObserver o = new ContentObserver(bg) {
                @Override public void onChange(boolean selfChange) {
                    hotUntil = System.currentTimeMillis() + HOT_WINDOW_MS;
                    bg.removeCallbacks(syncSoon);
                    bg.postDelayed(syncSoon, 1500);
                }
            };
            try { cr.registerContentObserver(Uri.parse(u), true, o); observers.add(o); } catch (Exception e) { Log.w(TAG, "observer 실패 " + u, e); }
        }
    }

    // ── 한 바퀴: 문자함 올리기 → PC 대기 문자 보내기 → 살아 있음 ──
    private void cycle() throws Exception {
        if (rest.uid() == null) { running = false; stopSelf(); return; }
        syncProvider();
        pollOutbox();
        long now = System.currentTimeMillis();
        if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
            lastHeartbeatAt = now;
            heartbeat();
        }
        SharedPreferences sp = rest.prefs();
        String authErr = sp.getString("authError", null);
        if (authErr != null && !authNotified) { authNotified = true; setNotiText("⚠ " + authErr + " — 앱 › 설정 › 업무폰 문자 연결"); }
        else if (authErr == null && authNotified) { authNotified = false; setNotiText("PC와 문자를 주고받고 있어요"); }
    }

    private boolean has(String perm) {
        return ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED;
    }

    private void heartbeat() throws Exception {
        String uid = rest.uid();
        if (uid == null) return;
        JSONObject perm = new JSONObject().put("fields", new JSONObject()
                .put("send", KpRest.b(has(Manifest.permission.SEND_SMS)))
                .put("read", KpRest.b(has(Manifest.permission.READ_SMS)))
                .put("receive", KpRest.b(has(Manifest.permission.RECEIVE_SMS))));
        JSONObject fields = new JSONObject()
                .put("linked", KpRest.b(true))
                .put("device", KpRest.s(Build.MANUFACTURER + " " + Build.MODEL))
                .put("perm", new JSONObject().put("mapValue", perm));
        JSONArray w = new JSONArray().put(new JSONObject()
                .put("update", new JSONObject().put("name", rest.docBase() + "smsBox/" + uid).put("fields", fields))
                .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray().put("linked").put("device").put("perm")))
                .put("updateTransforms", new JSONArray().put(KpRest.now("serviceAt"))));
        rest.commit(w);
    }

    // ── 번호 정리: +82 10-1234-5678 → 01012345678 ──
    static String normPeer(String raw) {
        if (raw == null) return "";
        StringBuilder sb = new StringBuilder();
        for (char ch : raw.toCharArray()) if (ch >= '0' && ch <= '9') sb.append(ch);
        String d = sb.toString();
        if (d.startsWith("82") && d.length() >= 11) d = "0" + d.substring(2);
        return d;
    }

    private void rememberOwnSent(String peer, String body) {
        long now = System.currentTimeMillis();
        synchronized (ownSent) {
            Iterator<Map.Entry<String, Long>> it = ownSent.entrySet().iterator();
            while (it.hasNext()) if (now - it.next().getValue() > OWN_SENT_KEEP_MS) it.remove();
            ownSent.put(peer + "|" + body.trim(), now);
        }
    }

    private boolean consumeOwnSent(String peer, String body) {
        String k = peer + "|" + (body == null ? "" : body.trim());
        synchronized (ownSent) { return ownSent.remove(k) != null; }
    }

    private JSONObject msgWrite(String docId, String peer, String dir, String body, long at, String kind, String smsId) throws Exception {
        JSONObject fields = new JSONObject()
                .put("peer", KpRest.s(peer))
                .put("dir", KpRest.s(dir))
                .put("body", KpRest.s(body))
                .put("status", KpRest.s("in".equals(dir) ? "received" : "sent"))
                .put("from", KpRest.s("phone"))
                .put("at", KpRest.i(at))
                .put("kind", KpRest.s(kind))
                .put("smsId", KpRest.s(smsId));
        JSONArray mask = new JSONArray();
        Iterator<String> keys = fields.keys();
        while (keys.hasNext()) mask.put(keys.next());
        // read(읽음)는 PC가 정한다 — 같은 문자를 다시 올려도 읽음 표시는 그대로 둔다
        return new JSONObject()
                .put("update", new JSONObject().put("name", rest.docBase() + "smsBox/" + rest.uid() + "/msgs/" + docId).put("fields", fields))
                .put("updateMask", new JSONObject().put("fieldPaths", mask))
                .put("updateTransforms", new JSONArray().put(KpRest.now("syncedAt")));
    }

    // ── 휴대폰 문자함(SMS · MMS) → 서버 ──
    private synchronized void syncProvider() throws Exception {
        if (rest.uid() == null || !has(Manifest.permission.READ_SMS)) return;
        syncSms();
        syncMms();
    }

    private void syncSms() throws Exception {
        SharedPreferences sp = rest.prefs();
        long lastId = sp.getLong("lastSmsId", -1);
        if (lastId < 0) return;
        ContentResolver cr = getContentResolver();
        JSONArray writes = new JSONArray();
        long advanceTo = lastId;
        long now = System.currentTimeMillis();
        try (Cursor c = cr.query(Uri.parse("content://sms"), new String[]{"_id", "address", "body", "date", "type"},
                "_id > ?", new String[]{String.valueOf(lastId)}, "_id ASC")) {
            if (c == null) return;
            int n = 0;
            while (c.moveToNext() && n < 60) {
                long id = c.getLong(0);
                String peer = normPeer(c.getString(1));
                String body = c.getString(2) == null ? "" : c.getString(2);
                long date = c.getLong(3);
                int type = c.getInt(4);
                if (type == 4 || type == 6) { // 보내는 중 — 끝날 때까지 기다린다(10분 넘으면 건너뜀)
                    if (now - date < 10 * 60000) break;
                    advanceTo = id; continue;
                }
                if ((type == 1 || type == 2) && !peer.isEmpty()) {
                    if (type == 2 && consumeOwnSent(peer, body)) { advanceTo = id; continue; } // PC에서 보낸 문자(이미 있음)
                    writes.put(msgWrite("s" + id + "_" + date, peer, type == 1 ? "in" : "out", body, date, "sms", "sms:" + id));
                    n++;
                }
                advanceTo = id;
            }
        }
        if (advanceTo == lastId) return;
        if (writes.length() == 0 || rest.commit(writes)) {
            sp.edit().putLong("lastSmsId", advanceTo).apply();
            if (writes.length() > 0) hotUntil = System.currentTimeMillis() + HOT_WINDOW_MS;
        }
    }

    private void syncMms() throws Exception {
        SharedPreferences sp = rest.prefs();
        long lastId = sp.getLong("lastMmsId", -1);
        if (lastId < 0) return;
        ContentResolver cr = getContentResolver();
        JSONArray writes = new JSONArray();
        long advanceTo = lastId;
        long now = System.currentTimeMillis();
        try (Cursor c = cr.query(Uri.parse("content://mms"), new String[]{"_id", "date", "msg_box", "m_type"},
                "_id > ?", new String[]{String.valueOf(lastId)}, "_id ASC")) {
            if (c == null) return;
            int n = 0;
            while (c.moveToNext() && n < 30) {
                long id = c.getLong(0);
                long date = c.getLong(1) * 1000L; // MMS는 초 단위
                int box = c.getInt(2);
                int mType = c.getInt(3);
                if (box == 4 || mType == 130) { // 보내는 중 · 아직 내려받지 않은 MMS — 잠시 기다린다
                    if (now - date < 30 * 60000) break;
                    advanceTo = id; continue;
                }
                if (box == 1 || box == 2) {
                    String peer = normPeer(mmsAddr(cr, id, box == 1 ? 137 : 151));
                    String body = mmsText(cr, id);
                    if (!peer.isEmpty()) {
                        if (box == 2 && consumeOwnSent(peer, body)) { advanceTo = id; continue; }
                        writes.put(msgWrite("m" + id + "_" + date, peer, box == 1 ? "in" : "out", body, date, "mms", "mms:" + id));
                        n++;
                    }
                }
                advanceTo = id;
            }
        }
        if (advanceTo == lastId) return;
        if (writes.length() == 0 || rest.commit(writes)) {
            sp.edit().putLong("lastMmsId", advanceTo).apply();
            if (writes.length() > 0) hotUntil = System.currentTimeMillis() + HOT_WINDOW_MS;
        }
    }

    private static String mmsAddr(ContentResolver cr, long id, int type) {
        try (Cursor c = cr.query(Uri.parse("content://mms/" + id + "/addr"), new String[]{"address", "type"}, "type=" + type, null, null)) {
            if (c != null && c.moveToFirst()) {
                String a = c.getString(0);
                if (a != null && !a.contains("insert-address-token")) return a;
            }
        } catch (Exception ignored) {}
        return "";
    }

    private static String mmsText(ContentResolver cr, long id) {
        StringBuilder text = new StringBuilder();
        int images = 0, others = 0;
        try (Cursor c = cr.query(Uri.parse("content://mms/part"), new String[]{"_id", "ct", "text", "_data"}, "mid=" + id, null, null)) {
            while (c != null && c.moveToNext()) {
                String ct = c.getString(1) == null ? "" : c.getString(1);
                if ("text/plain".equals(ct)) {
                    String t = c.getString(3) != null ? readPart(cr, c.getLong(0)) : c.getString(2);
                    if (t != null && !t.isEmpty()) { if (text.length() > 0) text.append("\n"); text.append(t); }
                } else if (ct.startsWith("image/")) images++;
                else if (!"application/smil".equals(ct)) others++;
            }
        } catch (Exception ignored) {}
        if (images > 0) text.append(text.length() > 0 ? "\n" : "").append("[사진 ").append(images).append("장 — 휴대폰에서 확인]");
        else if (others > 0 && text.length() == 0) text.append("[첨부파일 — 휴대폰에서 확인]");
        return text.toString();
    }

    private static String readPart(ContentResolver cr, long partId) {
        try (InputStream is = cr.openInputStream(Uri.parse("content://mms/part/" + partId))) {
            if (is == null) return null;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int r;
            while ((r = is.read(buf)) > 0) bo.write(buf, 0, r);
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) { return null; }
    }

    // ── PC에서 보낸 문자(대기열) → 이 휴대폰으로 보내기 ──
    private void pollOutbox() throws Exception {
        String uid = rest.uid();
        if (uid == null) return;
        JSONObject q = new JSONObject()
                .put("from", new JSONArray().put(new JSONObject().put("collectionId", "msgs")))
                .put("where", new JSONObject().put("fieldFilter", new JSONObject()
                        .put("field", new JSONObject().put("fieldPath", "status"))
                        .put("op", "EQUAL")
                        .put("value", KpRest.s("queued"))))
                .put("limit", 10);
        JSONArray res = rest.runQuery("smsBox/" + uid, q);
        if (res == null) return;
        for (int k = 0; k < res.length(); k++) {
            JSONObject d = res.getJSONObject(k).optJSONObject("document");
            if (d == null) continue;
            String name = d.getString("name");
            String updateTime = d.optString("updateTime", null);
            JSONObject f = d.optJSONObject("fields");
            if (f == null) continue;
            String peer = normPeer(str(f, "peer"));
            String body = str(f, "body");
            long at = num(f, "at");
            hotUntil = System.currentTimeMillis() + HOT_WINDOW_MS;
            if (peer.isEmpty() || body.isEmpty()) { setStatus(name, "failed", "번호나 내용이 비어 있어요", null); continue; }
            if (at > 0 && System.currentTimeMillis() - at > STALE_QUEUED_MS) {
                setStatus(name, "failed", "업무폰이 30분 넘게 꺼져 있어 보내지 않았어요. 다시 보내 주세요", null);
                continue;
            }
            if (!has(Manifest.permission.SEND_SMS)) { setStatus(name, "failed", "업무폰에서 문자 보내기 권한이 꺼져 있어요", null); continue; }
            // 두 번 보내지 않게 — 내가 본 그 상태 그대로일 때만 "보내는 중"으로 바꾼다
            if (!setStatus(name, "sending", null, updateTime)) continue;
            send(name, peer, body);
        }
    }

    private static String str(JSONObject f, String k) {
        JSONObject v = f.optJSONObject(k);
        return v == null ? "" : v.optString("stringValue", "");
    }

    private static long num(JSONObject f, String k) {
        JSONObject v = f.optJSONObject(k);
        if (v == null) return 0;
        if (v.has("integerValue")) { try { return Long.parseLong(v.optString("integerValue", "0")); } catch (Exception e) { return 0; } }
        if (v.has("doubleValue")) return (long) v.optDouble("doubleValue", 0);
        return 0;
    }

    private boolean setStatus(String name, String status, String err, String precondUpdateTime) {
        try {
            JSONObject fields = new JSONObject().put("status", KpRest.s(status)).put("err", KpRest.s(err == null ? "" : err));
            JSONObject w = new JSONObject()
                    .put("update", new JSONObject().put("name", name).put("fields", fields))
                    .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray().put("status").put("err")))
                    .put("updateTransforms", new JSONArray().put(KpRest.now("sent".equals(status) ? "sentAt" : "statusAt")));
            if (precondUpdateTime != null) w.put("currentDocument", new JSONObject().put("updateTime", precondUpdateTime));
            else w.put("currentDocument", new JSONObject().put("exists", true));
            return rest.commit(new JSONArray().put(w));
        } catch (Exception e) {
            Log.w(TAG, "상태 저장 실패", e);
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private void send(String name, String peer, String body) {
        try {
            SmsManager sm = Build.VERSION.SDK_INT >= 31 ? getSystemService(SmsManager.class) : SmsManager.getDefault();
            if (sm == null) sm = SmsManager.getDefault();
            ArrayList<String> parts = sm.divideMessage(body);
            Intent it = new Intent(ACTION_SENT).setPackage(getPackageName()).putExtra("doc", name);
            PendingIntent pi = PendingIntent.getBroadcast(this, name.hashCode(), it, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            rememberOwnSent(peer, body);
            synchronized (partsLeft) { partsLeft.put(name, parts.size()); }
            if (parts.size() <= 1) {
                sm.sendTextMessage(peer, null, body, pi, null);
            } else {
                ArrayList<PendingIntent> pis = new ArrayList<>();
                for (int k = 0; k < parts.size(); k++) pis.add(pi);
                sm.sendMultipartTextMessage(peer, null, parts, pis, null);
            }
            // 결과 알림이 오지 않는 휴대폰도 있어 2분 뒤에도 "보내는 중"이면 보낸 것으로 본다
            bg.postDelayed(() -> {
                boolean pending;
                synchronized (partsLeft) { pending = partsLeft.remove(name) != null; }
                if (pending) setStatus(name, "sent", null, null);
            }, 120000);
        } catch (Exception e) {
            Log.w(TAG, "문자 보내기 실패", e);
            synchronized (partsLeft) { partsLeft.remove(name); }
            setStatus(name, "failed", "업무폰에서 보내지 못했어요(" + e.getClass().getSimpleName() + ")", null);
        }
    }

    private void onPartResult(String name, int rc) {
        Integer left;
        synchronized (partsLeft) {
            left = partsLeft.get(name);
            if (left == null) return; // 이미 끝남
            if (rc != Activity.RESULT_OK) { partsLeft.remove(name); }
            else if (left <= 1) { partsLeft.remove(name); }
            else { partsLeft.put(name, left - 1); return; }
        }
        if (rc == Activity.RESULT_OK) setStatus(name, "sent", null, null);
        else setStatus(name, "failed", failReason(rc), null);
    }

    private static String failReason(int rc) {
        switch (rc) {
            case SmsManager.RESULT_ERROR_NO_SERVICE: return "업무폰이 통신이 안 되는 곳에 있어요";
            case SmsManager.RESULT_ERROR_RADIO_OFF: return "업무폰이 비행기 모드예요";
            case SmsManager.RESULT_ERROR_NULL_PDU: return "문자를 만들지 못했어요";
            default: return "통신사에서 보내지 못했어요(코드 " + rc + ")";
        }
    }
}
