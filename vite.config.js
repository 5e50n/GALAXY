import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves under /GALAXY/ (repo name); Netlify serves at / (set BASE_PATH=/ in netlify.toml)
  base: process.env.BASE_PATH || '/GALAXY/',
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
