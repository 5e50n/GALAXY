import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ORBIT/',
  root: './',
  server: {
    port: 3000,
    open: false,
    host: true
  },
  worker: {
    format: 'es'
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  }
});
