package com.kpflow.driver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** 💬 2026-11-18 사내문자 — 휴대폰을 다시 켜거나 앱을 업데이트하면 연결을 이어서 켠다(연결해 둔 폰만). */
public class KpSmsBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        if (!KpSmsService.linked(ctx)) return;
        try { KpSmsService.start(ctx); } catch (Exception e) { Log.w("KpSms", "부팅 후 시작 실패", e); }
    }
}
