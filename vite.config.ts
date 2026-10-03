import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works under the GitHub Pages sub-path (/Starfall.Grove.Moba.UI/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
});
