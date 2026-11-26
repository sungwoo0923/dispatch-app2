package com.kpflow.driver;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * 🟦 2026-11-26 홈 화면 위젯 — 출근하기 · 지금 상태 · 다음 할 일(사용자 요청)
 *  - 글자는 기사앱이 상태가 바뀔 때마다 KpWidgetPlugin.update 로 저장해 둔 값(SharedPreferences "kp_widget")
 *  - 버튼을 누르면 앱이 열리면서 logisweb-driver://checkin(출근 전) 또는 logisweb-driver://open 을 받는다
 *    → 기사앱(DriverHome)이 홈 탭의 [밀어서 출근]으로 바로 데려간다
 *    (출근은 위치 · 키로수 · 안전교육 확인이 있어 위젯에서 바로 처리하지 않고 앱에서 밀어서 확인)
 */
public class KpWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "kp_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, KpWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, v);
    }

    private static PendingIntent open(Context ctx, String action, int req) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("logisweb-driver://" + action));
        i.setClass(ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static RemoteViews build(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String title = p.getString("title", "출근 전");
        String sub = p.getString("sub", "앱을 열어 로그인해 주세요");
        String action = p.getString("action", "open");
        String label = p.getString("label", "앱 열기");
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.kp_widget);
        v.setTextViewText(R.id.kp_w_title, title);
        v.setTextViewText(R.id.kp_w_sub, sub);
        v.setTextViewText(R.id.kp_w_btn, "›  " + label);
        v.setOnClickPendingIntent(R.id.kp_w_root, open(ctx, "open", 7101));
        v.setOnClickPendingIntent(R.id.kp_w_btn, open(ctx, "checkin".equals(action) ? "checkin" : "open", "checkin".equals(action) ? 7102 : 7103));
        return v;
    }
}
