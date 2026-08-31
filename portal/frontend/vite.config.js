import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: demo ? [{ find: /^(?:\.\.?\/)+api\/client$/, replacement: fileURLToPath(new URL('./src/api/demoClient.js', import.meta.url)) }] : [] },
  build: demo ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {},
  server: {
    port: 5300,
    proxy: { '/api': { target: 'http://127.0.0.1:5200', changeOrigin: true } },
  },
});
