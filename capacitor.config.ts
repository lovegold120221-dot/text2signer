import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.eburon.translate',
  appName: 'Eburon Translate',
  webDir: 'dist/sign-translate/browser',
  server: {
    androidScheme: 'https',
  },
};

export default config;
