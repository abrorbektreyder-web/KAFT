import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './index.ts';

const envFile = resolve(import.meta.dirname, '../../../.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL topilmadi');

const { db, sql } = createDb(process.env.DATABASE_URL);
try {
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../migrations') });
  console.log('Migratsiyalar qo‘llandi');
} finally {
  await sql.end();
}
