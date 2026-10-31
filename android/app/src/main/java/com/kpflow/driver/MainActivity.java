package com.kpflow.driver;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 백그라운드 실시간 위치 전송(네이티브 서비스) 플러그인 등록
        registerPlugin(KpLocationPlugin.class);
        super.onCreate(savedInstanceState);
        // 휴대폰 설정의 "글자 크기"가 크면 WebView가 앱 글자를 그만큼 키워서 가입·로그인 화면이
        // 확대된 것처럼 보였다 — 앱 화면은 웹과 같은 크기(100%)로 고정한다(화면 크기는 앱 설정에서 조절).
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
        }
    }
}
