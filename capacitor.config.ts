import type { CapacitorConfig } from '@capacitor/cli';

// ⭐ 2026-11-05 사장님 요청 — 배포할 때마다 기사님들이 APK를 다시 깔지 않게.
//  예전엔 웹 화면(dist)을 APK 안에 넣어(webDir) 웹을 고칠 때마다 새 APK가 필요했다.
//  이제 APK는 실제 서비스 주소(https://dispatch-app2.vercel.app)를 열고 → 웹 배포가 곧바로 기사앱에 반영된다.
//  - 네이티브 기능(위치 추적 KpLocation·BackgroundGeolocation·푸시 PushNotifications·App)은 그대로 쓴다
//    (Capacitor가 이 주소의 화면에도 브리지를 넣어 준다 → window.Capacitor.isNativePlatform() === true → /driver-login로 시작).
//  - 인터넷이 끊겨 화면을 못 불러오면 APK에 들어 있는 offline.html("인터넷 연결을 확인해 주세요 [다시 시도]")을 보여준다.
//  - 이 설정이 들어간 APK를 "한 번" 새로 설치하면, 그다음부터 웹 수정은 APK 재설치 없이 적용된다.
//    (네이티브 플러그인을 새로 추가·변경할 때만 APK를 다시 만든다 → 앱 안에 "앱 업데이트가 있어요" 안내가 뜬다)
//  ⚠️ 주소가 바뀌면(도메인 변경) 여기와 public/offline.html의 주소를 같이 바꾸고 APK를 다시 만든다.
const APP_HOST = 'dispatch-app2.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.kpflow.driver',
  appName: 'LogisWeb 기사',
  webDir: 'dist',
  server: {
    url: `https://${APP_HOST}`,
    appStartPath: '/driver-login',
    androidScheme: 'https',
    allowNavigation: [APP_HOST],
    errorPath: 'offline.html',
  },
  android: {
    backgroundColor: '#0F1A30',
    // background-geolocation 플러그인 README 권고 — 없으면 앱이 백그라운드 진입 5분 후
    // WebView 브릿지가 멈춰 위치 업데이트가 끊긴다.
    useLegacyBridge: true,
  },
  plugins: {
    BackgroundGeolocation: {
      backgroundMessage: "취소하면 위치 추적이 중지됩니다.",
      backgroundTitle: "LogisWeb 운행 추적 중",
      requestPermissions: true,
    },
    // ⭐ 2026-11-05 앱이 켜져 있을 때 온 푸시도 알림창에 띄운다(안 켜져 있을 때는 시스템이 띄움)
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
