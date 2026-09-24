import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Lokalda .env.local'dan, CI'da muhit o'zgaruvchisidan
const envFile = resolve(import.meta.dirname, '../../../.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL topilmadi (.env.local yoki muhit o‘zgaruvchisi)');
