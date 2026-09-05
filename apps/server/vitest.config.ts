import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@surge/engine': r('../../packages/engine/src/index.ts'),
      '@surge/config': r('../../packages/config/src/index.ts'),
    },
  },
  test: { include: ['test/**/*.test.ts'] },
});
