import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works at a domain root, a GitHub Pages sub-path, or Vercel.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
});
