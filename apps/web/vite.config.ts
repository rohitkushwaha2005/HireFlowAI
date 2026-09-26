import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  const apiTarget = env.API_URL || 'http://localhost:4000';
  return {
    plugins: [react(), tailwindcss()],
    envDir: '../..',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    preview: { port: 4173, proxy: { '/api': { target: apiTarget } } },
    build: {
      sourcemap: true,
      // React 19 + React Router 7 form a ~165 kB (gzip) framework chunk; app code is lazy-loaded per route.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // Stable vendor chunks cache across deploys; route pages are lazy-loaded separately.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            // Vite module ids always use forward slashes, on every OS.
            if (/\/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id))
              return 'react';
            if (
              /\/node_modules\/(recharts|d3-[^/]+|victory-vendor|es-toolkit|immer|@reduxjs|react-redux|reselect)\//.test(
                id,
              )
            )
              return 'charts';
            if (id.includes('@dnd-kit')) return 'dnd';
            if (/@radix-ui|radix-ui|@floating-ui/.test(id)) return 'radix';
            return 'vendor';
          },
        },
      },
    },
  };
});
