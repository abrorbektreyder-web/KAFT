import postgres from 'postgres';
import { sql as dsql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.ts';

export * as schema from './schema.ts';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDb(url: string) {
  // prepare:false — Supabase pooler (Supavisor) bilan mos
  const sql = postgres(url, { prepare: false, max: 5 });
  return { sql, db: drizzle(sql, { schema }) };
}

/**
 * Ilova rolida (RLS'ni chetlab o'ta olmaydi) tranzaksiya.
 * Barcha ilova so'rovlari shu yoki withTenant orqali o'tishi shart.
 */
export function withAppRole<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(dsql`set local role kaft_app`);
    return fn(tx);
  });
}

/** Tenant kontekstidagi tranzaksiya: RLS faqat shu tenant qatorlarini ochadi. */
export function withTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(tenantId)) return Promise.reject(new Error(`Noto'g'ri tenant ID: ${tenantId}`));
  return withAppRole(db, async (tx) => {
    await tx.execute(dsql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
