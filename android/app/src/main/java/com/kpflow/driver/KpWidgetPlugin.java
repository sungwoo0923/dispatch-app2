package com.kpflow.driver;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 🟦 2026-11-26 홈 화면 위젯 글자 바꾸기 — 기사앱이 상태가 바뀔 때마다 부른다
 *  update({ title, sub, action: "checkin" | "open", label })
 */
@CapacitorPlugin(name = "KpWidget")
public class KpWidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor e = ctx.getSharedPreferences(KpWidgetProvider.PREFS, Context.MODE_PRIVATE).edit();
        e.putString("title", call.getString("title", "출근 전"));
        e.putString("sub", call.getString("sub", ""));
        e.putString("action", call.getString("action", "open"));
        e.putString("label", call.getString("label", "앱 열기"));
        e.apply();
        try { KpWidgetProvider.refreshAll(ctx); } catch (Exception ignored) { }
        call.resolve();
    }
}
