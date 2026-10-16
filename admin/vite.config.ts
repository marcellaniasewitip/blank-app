/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Absolute base so deep links (/orders/:id) served by the SPA fallback still find /assets/*.
  // Set VITE_BASE_PATH (e.g. /admin/) when hosting under a sub-path.
  base: process.env.VITE_BASE_PATH || '/',
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    // Maps are emitted for error tracking but not referenced from the bundle (don't publish them).
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mantine: ['@mantine/core', '@mantine/hooks', '@mantine/form', '@mantine/notifications', '@mantine/modals', '@mantine/dates'],
          charts: ['@mantine/charts', 'recharts'],
          map: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
  },
});
