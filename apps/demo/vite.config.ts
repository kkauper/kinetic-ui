import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served at the root of https://kineticui.kauper.co
export default defineConfig({
  plugins: [react()],
  base: '/',
  // Lets a Cloudflare quick tunnel reach the dev server (Vite blocks unknown Host headers).
  server: { allowedHosts: ['.trycloudflare.com'] },
});
