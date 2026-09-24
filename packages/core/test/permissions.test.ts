// CORE-04 + PRD 8 matritsasi: kim nimani qila oladi. Ruxsatsiz amal bloklanadi va audit jurnaliga yoziladi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDb, schema, withTenant } from '@kaft/db';
import { authorize, createTenant, createUser, ForbiddenError, SYSTEM_ROLES } from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
const u: Record<string, string> = {};

beforeAll(async () => {
  const t = await createTenant(db, { name: 'Ruxsat test', slug: `ruxsat-${crypto.randomUUID()}`, modules: ['hr', 'pay', 'fin', 'apr', 'tsk'] });
  tenantId = t.id;
  await withTenant(db, tenantId, async (tx) => {
    u.ega = (await createUser(tx, { fullName: 'Abror', roles: ['Ega'] })).id;
    u.hr = (await createUser(tx, { fullName: 'Malika', roles: ['HR menejer'] })).id;
    u.kassir = (await createUser(tx, { fullName: 'Dilnoza', roles: ['Kassir'] })).id;
    u.bolim = (await createUser(tx, { fullName: 'Jasur', roles: ['Bo‘lim boshlig‘i'] })).id;
    u.direktor = (await createUser(tx, { fullName: 'Bekzod', roles: ['Direktor'] })).id;
    u.rolsiz = (await createUser(tx, { fullName: 'Rolsiz', roles: [] })).id;
    u.bloklangan = (await createUser(tx, { fullName: 'Bloklangan', roles: ['Ega'] })).id;
    await tx.update(schema.users).set({ isBlocked: true }).where(eq(schema.users.id, u.bloklangan!));
  });
});

afterAll(async () => {
  await sql`delete from tenants where id = ${tenantId}`;
  await sql.end();
});

const ctx = (userId: string) => ({ tenantId, userId });

describe('ruxsatlar', () => {
  it('yangi tenantda PRD 8 dagi 9 ta tizim roli bor', async () => {
    const roles = await withTenant(db, tenantId, (tx) => tx.select().from(schema.roles));
    expect(roles.map((r) => r.name).sort()).toEqual([...SYSTEM_ROLES].sort());
    expect(roles.every((r) => r.isSystem)).toBe(true);
  });

  it('ega oylikni ko‘radi — to‘liq qamrov', async () => {
    expect(await authorize(db, ctx(u.ega!), 'pay', 'view')).toBe('all');
  });

  it('HR oylikni ocholmaydi va urinish audit jurnaliga yoziladi (AC-4)', async () => {
    await expect(authorize(db, ctx(u.hr!), 'pay', 'view')).rejects.toBeInstanceOf(ForbiddenError);
    const logs = await withTenant(db, tenantId, (tx) =>
      tx.select().from(schema.auditLog).where(and(eq(schema.auditLog.action, 'denied'), eq(schema.auditLog.actorUserId, u.hr!))),
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]!.entity).toBe('pay');
    expect(logs[0]!.meta).toEqual({ action: 'view' });
  });

  it('kassir faqat o‘z kassasini ko‘radi', async () => {
    expect(await authorize(db, ctx(u.kassir!), 'fin', 'view')).toBe('own');
  });

  it('bo‘lim boshlig‘i limitgacha tasdiqlaydi', async () => {
    expect(await authorize(db, ctx(u.bolim!), 'apr', 'approve')).toBe('limit');
  });

  it('direktor maxfiy kadr maydonlarini ko‘rmaydi', async () => {
    await expect(authorize(db, ctx(u.direktor!), 'hr.secret', 'view')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('audit jurnalini faqat ega ko‘radi', async () => {
    expect(await authorize(db, ctx(u.ega!), 'audit', 'view')).toBe('all');
    await expect(authorize(db, ctx(u.direktor!), 'audit', 'view')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('modul o‘chiq bo‘lsa — ega ham kira olmaydi', async () => {
    await expect(authorize(db, ctx(u.ega!), 'inv', 'view')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('roli yo‘q foydalanuvchi hech narsa qila olmaydi', async () => {
    await expect(authorize(db, ctx(u.rolsiz!), 'hr', 'view')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('bloklangan foydalanuvchi ega roli bilan ham kira olmaydi', async () => {
    await expect(authorize(db, ctx(u.bloklangan!), 'hr', 'view')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
