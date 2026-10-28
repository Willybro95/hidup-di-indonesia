import { defineConfig } from 'vite';
// Relative base: the same build works at a domain root, a GitHub Pages sub-path, or Vercel.
export default defineConfig({ base: './', build: { target: 'es2022', chunkSizeWarningLimit: 1200 } });
