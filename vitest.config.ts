import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Repo tests share one DB (billo_test) and use TRUNCATE in beforeEach.
    // Disabling file parallelism prevents cross-file TRUNCATE collisions on
    // unique constraints and FK cascades. Tests within a single file still run
    // in parallel via `it.concurrent` if used.
    fileParallelism: false,
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
