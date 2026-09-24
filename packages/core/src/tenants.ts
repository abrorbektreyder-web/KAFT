import { and, eq, sql } from 'drizzle-orm';
import { schema, type Db, type Tx } from '@kaft/db';

// PRD 5-bo'lim modullari. `core` — yadro, doim yoqiq.
export const MODULES = ['core', 'hr', 'att', 'pay', 'fin', 'cp', 'sal', 'pur', 'inv', 'doc', 'tsk', 'apr', 'ctl', 'mgt', 'tg', 'int'] as const;
export type ModuleKey = (typeof MODULES)[number];

export interface NewTenant {
  name: string;
  slug: string;
  brandName?: string;
  logoUrl?: string;
  brandColor?: string;
  /** Yoqiladigan modullar; berilmasa — hammasi */
  modules?: ModuleKey[];
}

/** Yangi mijoz (tenant) ochish — tizim amali, ilova rolida emas, admin ulanishida bajariladi. */
export async function createTenant(db: Db, input: NewTenant) {
  const { modules, ...fields } = input;
  const enabled = new Set<ModuleKey>(['core', ...(modules ?? MODULES)]);
  return db.transaction(async (tx) => {
    const [tenant] = await tx.insert(schema.tenants).values(fields).returning();
    await tx.insert(schema.tenantModules).values(MODULES.map((module) => ({ tenantId: tenant!.id, module, enabled: enabled.has(module) })));
    return tenant!;
  });
}

/** Joriy tenantda modul yoqilganmi (withTenant ichida chaqiriladi). */
export async function isModuleEnabled(tx: Tx, module: ModuleKey): Promise<boolean> {
  if (module === 'core') return true;
  const [row] = await tx
    .select({ enabled: schema.tenantModules.enabled })
    .from(schema.tenantModules)
    .where(and(eq(schema.tenantModules.module, module), eq(schema.tenantModules.tenantId, sql`app_tenant_id()`)));
  return row?.enabled ?? false;
}

/** Joriy tenantda modulni yoqish/o'chirish. */
export async function setModule(tx: Tx, module: ModuleKey, enabled: boolean): Promise<void> {
  if (module === 'core' && !enabled) throw new Error('Yadro modulini o‘chirib bo‘lmaydi');
  await tx
    .insert(schema.tenantModules)
    .values({ tenantId: sql`app_tenant_id()`, module, enabled })
    .onConflictDoUpdate({ target: [schema.tenantModules.tenantId, schema.tenantModules.module], set: { enabled } });
}
