package com.kpflow.driver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * 💬 2026-11-18 사내문자 — 문자가 오거나 휴대폰을 다시 켜면 사내문자 서비스를 깨운다.
 *  문자 내용은 여기서 읽지 않는다(서비스가 휴대폰 문자함에서 읽어 한 번만 올린다).
 */
public class KpSmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!KpSmsService.linked(ctx)) return;
        try {
            Intent i = new Intent(ctx, KpSmsService.class).setAction(KpSmsService.ACTION_SYNC);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception e) {
            // 안드로이드 12+: 앱이 뒤에 있을 때 서비스를 새로 켜지 못할 수 있다 — 이미 켜져 있으면 문자함 감시로 처리된다
            Log.w("KpSms", "서비스 깨우기 실패", e);
        }
    }
}
