import { defineConfig } from 'vitest/config';

// Present so vitest stops here instead of inheriting the root config, whose
// include is scoped to scripts/ and would match none of this workspace's tests.
export default defineConfig({
  test: {},
});
