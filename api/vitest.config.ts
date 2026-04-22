import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@token-derby/shared': new URL('../shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
