import { and, eq, schema, sql, withTenant, type Db, type Tx } from '@kaft/db';
import { TENANT_MODULE, type Action, type PermModule, type Scope } from './roles.ts';

export class ForbiddenError extends Error {
  readonly module: PermModule;
  readonly action: Action;
  constructor(module: PermModule, action: Action) {
    super(`Ruxsat yo'q: ${module}.${action}`);
    this.module = module;
    this.action = action;
  }
}

export interface Ctx { tenantId: string; userId: string }

const RANK: Record<Scope, number> = { own: 1, limit: 2, all: 3 };

/** Foydalanuvchining shu amal uchun eng keng qamrovi; ruxsat bo'lmasa — null. Bitta so'rov. */
export async function can(tx: Tx, userId: string, module: PermModule, action: Action): Promise<Scope | null> {
  const tenantModule = TENANT_MODULE[module];
  const moduleOn = tenantModule === 'core'
    ? sql`true`
    : sql`exists (select 1 from ${schema.tenantModules} where ${schema.tenantModules.module} = ${tenantModule} and ${schema.tenantModules.enabled})`;
  const rows = await tx
    .select({ scope: schema.rolePermissions.scope })
    .from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .innerJoin(schema.rolePermissions, and(
      eq(schema.rolePermissions.roleId, schema.userRoles.roleId),
      eq(schema.rolePermissions.module, module),
      eq(schema.rolePermissions.action, action),
    ))
    .where(and(eq(schema.users.id, userId), eq(schema.users.isBlocked, false), moduleOn));
  return rows.map((r) => r.scope as Scope).sort((a, b) => RANK[b] - RANK[a])[0] ?? null;
}

/**
 * Ruxsatni tekshiradi; yo'q bo'lsa ForbiddenError. Rad etish audit jurnaliga
 * alohida tranzaksiyada yoziladi — chaqiruvchining tranzaksiyasi bekor bo'lsa ham iz qoladi.
 */
export async function authorize(db: Db, ctx: Ctx, module: PermModule, action: Action): Promise<Scope> {
  const scope = await withTenant(db, ctx.tenantId, (tx) => can(tx, ctx.userId, module, action));
  if (scope) return scope;
  return deny(db, ctx, module, action);
}

/** Rad etishni audit jurnaliga yozib ForbiddenError tashlaydi (qamrov tekshiruvlari uchun ham). */
export async function deny(db: Db, ctx: Ctx, module: PermModule, action: Action, entityId?: string): Promise<never> {
  await withTenant(db, ctx.tenantId, (tx) =>
    tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'denied', entity: module, entityId, meta: { action } }),
  );
  throw new ForbiddenError(module, action);
}
