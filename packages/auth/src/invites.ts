import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, schema, sql, withTenant, type Db } from '@kaft/db';
import { authorize, createUser, type Ctx } from '@kaft/core';
import type { Auth } from './auth.ts';
import type { Mailer } from './mailer.ts';

const TTL_DAYS = 7;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export interface InviteDeps { mailer: Mailer; baseURL: string }

/**
 * Mavjud foydalanuvchiga taklifnoma yaratib xat yuboradi.
 * Tizim amali ham bo'la oladi (yangi mijozning birinchi egasi) — shunda actorUserId bo'sh.
 */
export async function createInvitation(db: Db, target: { tenantId: string; userId: string }, deps: InviteDeps, actorUserId?: string) {
  const token = randomBytes(32).toString('base64url');
  const email = await withTenant(db, target.tenantId, async (tx) => {
    const [user] = await tx.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, target.userId));
    if (!user?.email) throw new Error('Taklif uchun foydalanuvchida email bo‘lishi kerak');
    await tx.insert(schema.invitations).values({
      tenantId: target.tenantId,
      userId: target.userId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + TTL_DAYS * 86_400_000),
    });
    await tx.insert(schema.auditLog).values({ tenantId: target.tenantId, actorUserId, action: 'create', entity: 'invitation', entityId: target.userId });
    return user.email;
  });
  await deps.mailer.send({
    to: email,
    subject: 'Kaft — sizni jamoaga taklif qilishdi',
    text: `Kirish uchun parol o‘rnating: ${deps.baseURL}/taklif/${token}\nHavola ${TTL_DAYS} kun amal qiladi.`,
  });
}

/** CORE-03: foydalanuvchini taklif qilish (faqat sozlamalarni boshqarish huquqi borlar). */
export async function inviteUser(
  db: Db, ctx: Ctx, input: { fullName: string; email: string; roles: string[] }, deps: InviteDeps,
) {
  await authorize(db, ctx, 'settings', 'create');
  const user = await withTenant(db, ctx.tenantId, (tx) => createUser(tx, input));
  await createInvitation(db, { tenantId: ctx.tenantId, userId: user.id }, deps, ctx.userId);
  return { userId: user.id };
}

/** Taklifnoma bo'yicha login yaratadi va tenantdagi foydalanuvchiga bog'laydi (tizim amali). */
export async function acceptInvite(db: Db, auth: Auth, input: { token: string; password: string }) {
  const tokenHash = hash(input.token);
  const valid = and(eq(schema.invitations.tokenHash, tokenHash), isNull(schema.invitations.acceptedAt), gt(schema.invitations.expiresAt, sql`now()`));
  const [inv] = await db
    .select({ tenantId: schema.invitations.tenantId, userId: schema.invitations.userId, email: schema.users.email, fullName: schema.users.fullName })
    .from(schema.invitations)
    .innerJoin(schema.users, eq(schema.users.id, schema.invitations.userId))
    .where(valid);
  if (!inv?.email) throw new Error('Taklifnoma yaroqsiz yoki muddati o‘tgan');

  const [existing] = await db.select({ id: schema.authUser.id }).from(schema.authUser).where(eq(schema.authUser.email, inv.email));
  const authUserId = existing?.id
    ?? (await auth.api.signUpEmail({ body: { email: inv.email, name: inv.fullName, password: input.password } })).user.id;

  await db.transaction(async (tx) => {
    // Shartli yangilash — bir taklifnomadan parallel ikki marta foydalanishni ham to'sadi
    const used = await tx.update(schema.invitations).set({ acceptedAt: sql`now()` }).where(valid).returning({ id: schema.invitations.id });
    if (!used.length) throw new Error('Taklifnoma yaroqsiz yoki muddati o‘tgan');
    await tx.update(schema.users).set({ authUserId }).where(eq(schema.users.id, inv.userId));
    await tx.insert(schema.auditLog).values({ tenantId: inv.tenantId, actorUserId: inv.userId, action: 'update', entity: 'invitation', entityId: inv.userId, meta: { accepted: true } });
  });
  return { authUserId };
}
