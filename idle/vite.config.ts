import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'public-build', assetsDir: 'ui-assets', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:3339', '/assets': 'http://127.0.0.1:3339' } },
});
