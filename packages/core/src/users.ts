import { inArray, sql } from 'drizzle-orm';
import { schema, type Tx } from '@kaft/db';

export interface NewUser {
  fullName: string;
  email?: string;
  phone?: string;
  /** Rol nomlari (joriy tenantda mavjud bo'lishi shart) */
  roles: string[];
}

/** Joriy tenantda foydalanuvchi yaratib, rollarini beradi (withTenant ichida). */
export async function createUser(tx: Tx, input: NewUser) {
  const { roles, ...fields } = input;
  const [user] = await tx.insert(schema.users).values({ ...fields, tenantId: sql`app_tenant_id()` }).returning();
  if (roles.length) {
    const found = await tx.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles).where(inArray(schema.roles.name, roles));
    const missing = roles.filter((r) => !found.some((f) => f.name === r));
    if (missing.length) throw new Error(`Rol topilmadi: ${missing.join(', ')}`);
    await tx.insert(schema.userRoles).values(found.map((r) => ({ tenantId: sql`app_tenant_id()`, userId: user!.id, roleId: r.id })));
  }
  return user!;
}
