import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@conflict/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
