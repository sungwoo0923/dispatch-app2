package com.kpflow.driver;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

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

/**
 * 💬 2026-11-18 사내문자(업무폰 문자 연결) 전용 Firestore REST 도우미.
 *  - 로그인 토큰: 화면(웹)이 넘겨준 refreshToken으로 서비스가 직접 새 토큰을 받는다(KpLocationService와 같은 방식).
 *  - 위치 서비스(KpLocationService)는 건드리지 않으려고 따로 둔다.
 *  - prefs 이름별로 토큰을 기억한다(사내문자는 "kp_sms").
 */
final class KpRest {
    private static final String TAG = "KpRest";
    private final Context ctx;
    private final String prefsName;
    private String idToken = null;
    private long idTokenExpAt = 0;

    KpRest(Context ctx, String prefsName) {
        this.ctx = ctx.getApplicationContext();
        this.prefsName = prefsName;
    }

    SharedPreferences prefs() { return ctx.getSharedPreferences(prefsName, Context.MODE_PRIVATE); }
    String uid() { return prefs().getString("uid", null); }
    String projectId() { return prefs().getString("projectId", null); }
    String docBase() { return "projects/" + projectId() + "/databases/(default)/documents/"; }
    void forgetToken() { idToken = null; idTokenExpAt = 0; }

    synchronized String token() throws Exception {
        if (idToken != null && System.currentTimeMillis() < idTokenExpAt - 120000) return idToken;
        SharedPreferences sp = prefs();
        String refresh = sp.getString("refreshToken", null);
        String apiKey = sp.getString("apiKey", null);
        if (refresh == null || apiKey == null) return null;
        String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8");
        StringBuilder out = new StringBuilder();
        int code = http("POST", "https://securetoken.googleapis.com/v1/token?key=" + apiKey, body, "application/x-www-form-urlencoded", null, out);
        if (code != 200) {
            Log.w(TAG, "토큰 갱신 실패 HTTP " + code);
            // 비밀번호 변경 · 계정 정지 등으로 다시 로그인해야 할 때
            if (code == 400) sp.edit().putString("authError", "다시 로그인이 필요해요").apply();
            return null;
        }
        JSONObject j = new JSONObject(out.toString());
        idToken = j.getString("id_token");
        idTokenExpAt = System.currentTimeMillis() + Long.parseLong(j.optString("expires_in", "3600")) * 1000L;
        String newRefresh = j.optString("refresh_token", null);
        SharedPreferences.Editor ed = sp.edit().remove("authError");
        if (newRefresh != null && !newRefresh.isEmpty()) ed.putString("refreshToken", newRefresh);
        ed.apply();
        return idToken;
    }

    /** documents:commit — 성공하면 true */
    boolean commit(JSONArray writes) throws Exception {
        if (writes.length() == 0) return true;
        String t = token();
        if (t == null) return false;
        String url = "https://firestore.googleapis.com/v1/projects/" + projectId() + "/databases/(default)/documents:commit";
        int code = http("POST", url, new JSONObject().put("writes", writes).toString(), "application/json; charset=utf-8", t, null);
        if (code == 401 || code == 403) forgetToken();
        if (code >= 300) Log.w(TAG, "commit 실패 HTTP " + code);
        return code < 300;
    }

    /** runQuery — parent는 "smsBox/{uid}" 처럼 documents/ 뒤 경로. 실패하면 null */
    JSONArray runQuery(String parentPath, JSONObject structuredQuery) throws Exception {
        String t = token();
        if (t == null) return null;
        String url = "https://firestore.googleapis.com/v1/" + docBase() + parentPath + ":runQuery";
        StringBuilder out = new StringBuilder();
        int code = http("POST", url, new JSONObject().put("structuredQuery", structuredQuery).toString(), "application/json; charset=utf-8", t, out);
        if (code == 401 || code == 403) forgetToken();
        if (code >= 300) { Log.w(TAG, "runQuery 실패 HTTP " + code); return null; }
        return new JSONArray(out.toString());
    }

    // ── Firestore 값 만들기 ──
    static JSONObject s(String v) throws Exception { return new JSONObject().put("stringValue", v == null ? "" : v); }
    static JSONObject i(long v) throws Exception { return new JSONObject().put("integerValue", String.valueOf(v)); }
    static JSONObject b(boolean v) throws Exception { return new JSONObject().put("booleanValue", v); }
    static JSONObject now(String field) throws Exception { return new JSONObject().put("fieldPath", field).put("setToServerValue", "REQUEST_TIME"); }

    static int http(String method, String url, String body, String type, String bearer, StringBuilder out) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestMethod(method);
        if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", type);
            try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int code = c.getResponseCode();
        try {
            InputStream is = code < 400 ? c.getInputStream() : c.getErrorStream();
            if (is != null) {
                BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = out != null ? out : new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();
                if (code >= 400) Log.w(TAG, "응답 " + code + ": " + (sb.length() > 300 ? sb.substring(0, 300) : sb));
            }
        } catch (Exception ignored) {}
        c.disconnect();
        return code;
    }
}
