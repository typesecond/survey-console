import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/vitest.setup.ts'],
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
