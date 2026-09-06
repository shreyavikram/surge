/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The engine and config packages are consumed as source (no build step) so the
// deterministic engine runs unmodified in the browser. tsc resolves the same
// files through each package's `exports` field.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@surge/engine': r('../../packages/engine/src/index.ts'),
      '@surge/config': r('../../packages/config/src/index.ts'),
    },
  },
  server: { fs: { allow: [r('../../')] }, proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } } },
  test: { include: ['test/**/*.test.ts'] },
});
