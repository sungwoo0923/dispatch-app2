import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kpwork.attendance',
  appName: 'KP-work',
  webDir: 'dist',
  android: {
    backgroundColor: '#F8FAFC',
  },
  plugins: {
    BackgroundGeolocation: {
      backgroundMessage: '반경 자동출근 확인을 위해 위치를 추적하고 있습니다.',
      backgroundTitle: 'KP-work 출근 확인 중',
      requestPermissions: true,
    },
  },
};

export default config;
