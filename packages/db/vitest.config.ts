import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    // Har fayl o'z tenantida ishlaydi — fayllar parallel; Supabase session pooler ulanishlari cheklangani uchun 3 tadan
    maxWorkers: 3,
    // Dev baza masofada (Supabase, Irlandiya) — har so'rov yuzlab ms; prod'da baza serverning o'zida
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
