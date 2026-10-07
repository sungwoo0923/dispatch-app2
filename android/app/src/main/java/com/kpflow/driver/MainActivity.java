package com.kpflow.driver;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 백그라운드 실시간 위치 전송(네이티브 서비스) 플러그인 등록
        registerPlugin(KpLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
