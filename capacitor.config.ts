import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.knowledgeretention.app',
  appName: 'knowledgeretention',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: { enabled: true },
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false
      },
      logLevel: 1 // Warnings and errors only
    }
  }
};

export default config;
