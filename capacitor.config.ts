import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kpflow.driver',
  appName: 'KP-Flow 기사',
  webDir: 'dist',
  android: {
    backgroundColor: '#f0f2f5',
    // background-geolocation 플러그인 README 권고 — 없으면 앱이 백그라운드 진입 5분 후
    // WebView 브릿지가 멈춰 위치 업데이트가 끊긴다.
    useLegacyBridge: true,
  },
  plugins: {
    BackgroundGeolocation: {
      backgroundMessage: "취소하면 위치 추적이 중지됩니다.",
      backgroundTitle: "KP-Flow 운행 추적 중",
      requestPermissions: true,
    },
  },
};

export default config;
