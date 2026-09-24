import { and, eq, schema, type Db } from '@kaft/db';
import type { Ctx } from '@kaft/core';
import type { Auth } from './auth.ts';

// CORE-05: ega va moliya rollari uchun 2FA majburiy
export const TWO_FACTOR_ROLES = ['Ega', 'Buxgalter'];

export class UnauthorizedError extends Error {
  constructor() { super('Kirish talab qilinadi'); }
}
export class TwoFactorRequiredError extends Error {
  constructor() { super('Bu rol uchun ikki bosqichli kirish (2FA) yoqilishi shart'); }
}

/** So'rovdagi sessiyadan tenant va foydalanuvchini aniqlaydi; har server amalida birinchi chaqiriladi. */
/**
 * `requireTwoFactor: false` — faqat dev/test uchun (KAFT_REQUIRE_2FA=false). Standart — yoqiq (CORE-05).
 */
export async function resolveSession(db: Db, auth: Auth, headers: Headers, opts: { requireTwoFactor?: boolean } = {}): Promise<Ctx & { authUserId: string }> {
  const s = await auth.api.getSession({ headers });
  if (!s) throw new UnauthorizedError();

  // Tizim so'rovi (admin ulanish): shaxsning tenantdagi a'zoligi. Bir nechta tenant — keyingi bosqich.
  const [member] = await db
    .select({ tenantId: schema.users.tenantId, userId: schema.users.id, isBlocked: schema.users.isBlocked })
    .from(schema.users)
    .where(eq(schema.users.authUserId, s.user.id));
  if (!member || member.isBlocked) throw new UnauthorizedError();

  if (opts.requireTwoFactor !== false && !s.user.twoFactorEnabled) {
    const roles = await db
      .select({ name: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, and(eq(schema.roles.id, schema.userRoles.roleId), eq(schema.roles.tenantId, schema.userRoles.tenantId)))
      .where(eq(schema.userRoles.userId, member.userId));
    if (roles.some((r) => TWO_FACTOR_ROLES.includes(r.name))) throw new TwoFactorRequiredError();
  }
  return { tenantId: member.tenantId, userId: member.userId, authUserId: s.user.id };
}
