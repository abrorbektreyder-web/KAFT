// CORE-03 (taklif), CORE-05 (ega/moliyaga 2FA majburiy), PRD 10 (sessiya 12 soat).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import { createDb, eq, schema, withTenant } from '@kaft/db';
import { createTenant, createUser, ForbiddenError } from '@kaft/core';
import {
  acceptInvite, ConsoleMailer, createAuth, createInvitation, inviteUser, resolveSession,
  SESSION_TTL, TwoFactorRequiredError, UnauthorizedError,
} from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
const mailer = new ConsoleMailer({ quiet: true });
const baseURL = 'http://localhost:3000';
const auth = createAuth({ db, mailer, baseURL, secret: 'test-secret-test-secret-test-secret-000' });

let tenantId: string;
let egaId: string;
const run = crypto.randomUUID().slice(0, 8);
const egaEmail = `ega-${run}@kaft.test`;
const PAROL = 'Kuchli-parol-2026';

/** set-cookie → keyingi so'rov uchun cookie sarlavhasi */
function cookieHeaders(res: Headers) {
  const cookie = res.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return new Headers({ cookie });
}
const tokenFromMail = (to: string) => mailer.outbox.findLast((m) => m.to === to)!.text.match(/taklif\/([\w-]+)/)![1]!;

async function signIn(email: string, password = PAROL) {
  const { headers, response } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  return { headers: cookieHeaders(headers), response: response as Record<string, unknown> };
}

beforeAll(async () => {
  const t = await createTenant(db, { name: 'Login test', slug: `login-${run}` });
  tenantId = t.id;
  egaId = await withTenant(db, tenantId, async (tx) => (await createUser(tx, { fullName: 'Abror', email: egaEmail, roles: ['Ega'] })).id);
  // Birinchi ega taklifi — tizim amali (yangi mijozni ochishda)
  await createInvitation(db, { tenantId, userId: egaId }, { mailer, baseURL });
  await acceptInvite(db, auth, { token: tokenFromMail(egaEmail), password: PAROL });
});

afterAll(async () => {
  await sql`delete from tenants where id = ${tenantId}`;
  await sql`delete from auth_user where email like ${'%-' + run + '@kaft.test'}`;
  await sql.end();
});

describe('taklif (CORE-03)', () => {
  it('ega xodimni taklif qiladi: xat yuboriladi va audit jurnaliga yoziladi', async () => {
    const email = `xodim-${run}@kaft.test`;
    const { userId } = await inviteUser(db, { tenantId, userId: egaId }, { fullName: 'Aziz', email, roles: ['Xodim'] }, { mailer, baseURL });

    const mail = mailer.outbox.findLast((m) => m.to === email)!;
    expect(mail.subject).toMatch(/taklif/i);
    expect(mail.text).toContain(`${baseURL}/taklif/`);

    const logs = await withTenant(db, tenantId, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.entity, 'invitation')));
    expect(logs.some((l) => l.actorUserId === egaId && l.entityId === userId)).toBe(true);
  });

  it('taklif qilish huquqi yo‘q rol taklif qila olmaydi', async () => {
    const hrId = await withTenant(db, tenantId, async (tx) => (await createUser(tx, { fullName: 'Malika', roles: ['HR menejer'] })).id);
    await expect(
      inviteUser(db, { tenantId, userId: hrId }, { fullName: 'X', email: `x-${run}@kaft.test`, roles: ['Xodim'] }, { mailer, baseURL }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('taklifni qabul qilgan xodim parol bilan kiradi va sessiya o‘z tenantiga bog‘lanadi', async () => {
    const email = `kirdi-${run}@kaft.test`;
    const { userId } = await inviteUser(db, { tenantId, userId: egaId }, { fullName: 'Sardor', email, roles: ['Xodim'] }, { mailer, baseURL });
    await acceptInvite(db, auth, { token: tokenFromMail(email), password: PAROL });

    const { headers } = await signIn(email);
    expect(await resolveSession(db, auth, headers)).toMatchObject({ tenantId, userId });
  });

  it('bir taklifnomadan ikki marta foydalanib bo‘lmaydi', async () => {
    const email = `ikki-${run}@kaft.test`;
    await inviteUser(db, { tenantId, userId: egaId }, { fullName: 'Ikki', email, roles: ['Xodim'] }, { mailer, baseURL });
    const token = tokenFromMail(email);
    await acceptInvite(db, auth, { token, password: PAROL });
    await expect(acceptInvite(db, auth, { token, password: PAROL })).rejects.toThrow(/taklifnoma/i);
  });

  it('muddati o‘tgan taklifnoma qabul qilinmaydi', async () => {
    const email = `eski-${run}@kaft.test`;
    await inviteUser(db, { tenantId, userId: egaId }, { fullName: 'Eski', email, roles: ['Xodim'] }, { mailer, baseURL });
    const token = tokenFromMail(email);
    await sql`update invitations set expires_at = now() - interval '1 minute' where tenant_id = ${tenantId} and accepted_at is null`;
    await expect(acceptInvite(db, auth, { token, password: PAROL })).rejects.toThrow(/taklifnoma/i);
  });

  it('noto‘g‘ri parol bilan kirib bo‘lmaydi', async () => {
    await expect(signIn(egaEmail, 'notogri-parol-123')).rejects.toThrow();
  });
});

describe('sessiya', () => {
  it('sessiya 12 soat amal qiladi (PRD 10)', async () => {
    const { headers } = await signIn(egaEmail);
    const s = await auth.api.getSession({ headers });
    const ttl = (s!.session.expiresAt.getTime() - Date.now()) / 1000;
    expect(Math.abs(ttl - SESSION_TTL)).toBeLessThan(120);
  });

  it('sessiyasiz so‘rov rad etiladi', async () => {
    await expect(resolveSession(db, auth, new Headers())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('bloklangan foydalanuvchining sessiyasi ishlamaydi', async () => {
    const email = `blok-${run}@kaft.test`;
    const { userId } = await inviteUser(db, { tenantId, userId: egaId }, { fullName: 'Blok', email, roles: ['Xodim'] }, { mailer, baseURL });
    await acceptInvite(db, auth, { token: tokenFromMail(email), password: PAROL });
    const { headers } = await signIn(email);
    await withTenant(db, tenantId, (tx) => tx.update(schema.users).set({ isBlocked: true }).where(eq(schema.users.id, userId)));
    await expect(resolveSession(db, auth, headers)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('2FA (CORE-05)', () => {
  it('egaga 2FA yoqilmaguncha platforma ochilmaydi, yoqilgach TOTP kod bilan kiradi', async () => {
    const first = await signIn(egaEmail);
    await expect(resolveSession(db, auth, first.headers)).rejects.toBeInstanceOf(TwoFactorRequiredError);

    // 2FA yoqish: TOTP sirini olib, birinchi kod bilan tasdiqlash
    const enabled = await auth.api.enableTwoFactor({ body: { password: PAROL }, headers: first.headers });
    if (!('totpURI' in enabled)) throw new Error('TOTP kutilgan edi');
    const { totpURI } = enabled;
    // URI'da sir base32 ko'rinishida — autentifikator ilovasi kabi xom sirga qaytaramiz
    const secret = new TextDecoder().decode(base32.decode(new URL(totpURI).searchParams.get('secret')!));
    await auth.api.verifyTOTP({ body: { code: await createOTP(secret).totp() }, headers: first.headers });

    // Qayta kirish: parol yetarli emas, TOTP so'raladi
    const second = await signIn(egaEmail);
    expect(second.response.twoFactorRedirect).toBe(true);
    const { headers } = await auth.api.verifyTOTP({ body: { code: await createOTP(secret).totp() }, headers: second.headers, returnHeaders: true });
    expect(await resolveSession(db, auth, cookieHeaders(headers))).toMatchObject({ tenantId, userId: egaId });
  });

  it('oddiy xodimga 2FA majburiy emas', async () => {
    const email = `oddiy-${run}@kaft.test`;
    const { userId } = await inviteUser(db, { tenantId, userId: egaId }, { fullName: 'Oddiy', email, roles: ['Xodim'] }, { mailer, baseURL });
    await acceptInvite(db, auth, { token: tokenFromMail(email), password: PAROL });
    const { headers } = await signIn(email);
    expect(await resolveSession(db, auth, headers)).toMatchObject({ userId });
  });
});
