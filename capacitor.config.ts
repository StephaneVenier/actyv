import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.actyv.app',
  appName: 'Actyv',
  webDir: 'out',
  server: {
    url: 'https://actyv-iota.vercel.app/',
    cleartext: false
  }
};

export default config;
