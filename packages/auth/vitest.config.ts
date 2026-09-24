import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    // Bitta umumiy dev bazasi — testlar ketma-ket
    fileParallelism: false,
    // Dev baza masofada (Supabase, Irlandiya) — har so'rov yuzlab ms; prod'da baza serverning o'zida
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
