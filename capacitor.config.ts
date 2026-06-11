import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kpflow.driver',
  appName: 'KP-Flow 기사',
  webDir: 'dist',
  android: {
    backgroundColor: '#f0f2f5',
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
