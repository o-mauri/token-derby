import { defineConfig } from 'vitest/config';

// Synthesising the stack runs the whole CDK app, which is slow next to a unit test.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 120_000, hookTimeout: 120_000 },
});
