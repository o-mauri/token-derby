import { defineConfig } from 'vitest/config';

// Scoped to scripts/ — each workspace runs its own vitest via `npm -ws run test`.
export default defineConfig({
  test: { include: ['scripts/**/*.test.mjs'] },
});
