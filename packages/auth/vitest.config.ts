import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    // Bitta umumiy dev bazasi — testlar ketma-ket
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
