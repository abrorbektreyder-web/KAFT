import { and, eq, inArray } from 'drizzle-orm';
import { schema, withTenant, type Db, type Tx } from '@kaft/db';
import { TENANT_MODULE, type Action, type PermModule, type Scope } from './roles.ts';
import { isModuleEnabled } from './tenants.ts';

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

/** Foydalanuvchining shu amal uchun eng keng qamrovi; ruxsat bo'lmasa — null. */
export async function can(tx: Tx, userId: string, module: PermModule, action: Action): Promise<Scope | null> {
  if (!(await isModuleEnabled(tx, TENANT_MODULE[module]))) return null;

  const [user] = await tx.select({ isBlocked: schema.users.isBlocked }).from(schema.users).where(eq(schema.users.id, userId));
  if (!user || user.isBlocked) return null;

  const roleIds = tx.select({ id: schema.userRoles.roleId }).from(schema.userRoles).where(eq(schema.userRoles.userId, userId));
  const rows = await tx
    .select({ scope: schema.rolePermissions.scope })
    .from(schema.rolePermissions)
    .where(and(
      inArray(schema.rolePermissions.roleId, roleIds),
      eq(schema.rolePermissions.module, module),
      eq(schema.rolePermissions.action, action),
    ));
  return rows.map((r) => r.scope as Scope).sort((a, b) => RANK[b] - RANK[a])[0] ?? null;
}

/**
 * Ruxsatni tekshiradi; yo'q bo'lsa ForbiddenError. Rad etish audit jurnaliga
 * alohida tranzaksiyada yoziladi — chaqiruvchining tranzaksiyasi bekor bo'lsa ham iz qoladi.
 */
export async function authorize(db: Db, ctx: Ctx, module: PermModule, action: Action): Promise<Scope> {
  const scope = await withTenant(db, ctx.tenantId, (tx) => can(tx, ctx.userId, module, action));
  if (scope) return scope;
  await withTenant(db, ctx.tenantId, (tx) =>
    tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'denied', entity: module, meta: { action } }),
  );
  throw new ForbiddenError(module, action);
}
