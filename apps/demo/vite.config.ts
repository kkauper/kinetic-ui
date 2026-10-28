import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages project page: https://<user>.github.io/kinetic-ui/
export default defineConfig({
  plugins: [react()],
  base: '/kinetic-ui/',
});
