// HR-07: muddat eslatmalari (sof mantiq) va kunlik ish: bildirishnoma (CORE-10) + Telegram (TG-01).
// Tayyorlik mezoni (PRD 13.2, 5-hafta): eslatma Telegram'ga belgilangan kunda keladi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, createDb, eq, schema, withTenant } from '@kaft/db';
import {
  createEmployee, createTenant, createUser, dueReminders, FakeTelegram, recordEvent, runDailyJobs, setNotificationPref,
} from '../src/index.ts';

describe('dueReminders (sof mantiq)', () => {
  const base = { id: 'e1', lastName: 'Karimov', firstName: 'Aziz', birthDate: null, probationEndsOn: null, contractEndsOn: null, passportExpiresOn: null };

  it('tug‘ilgan kun — o‘sha kuni (yili farqli)', () => {
    expect(dueReminders([{ ...base, birthDate: '1990-10-12' }], '2026-10-12')).toMatchObject([{ kind: 'birthday', employeeId: 'e1' }]);
    expect(dueReminders([{ ...base, birthDate: '1990-10-12' }], '2026-10-11')).toEqual([]);
  });

  it('sinov muddati tugashidan 7 kun oldin', () => {
    expect(dueReminders([{ ...base, probationEndsOn: '2026-10-20' }], '2026-10-13')).toMatchObject([{ kind: 'probation_end', dueOn: '2026-10-20' }]);
    expect(dueReminders([{ ...base, probationEndsOn: '2026-10-20' }], '2026-10-12')).toEqual([]);
  });

  it('mehnat shartnomasi va pasport muddati — 30 kun oldin', () => {
    const e = { ...base, contractEndsOn: '2026-11-30', passportExpiresOn: '2026-11-30' };
    expect(dueReminders([e], '2026-10-31').map((r) => r.kind).sort()).toEqual(['contract_end', 'passport_expiry']);
  });

  it('eslatma matnida maxfiy ma’lumot yo‘q — faqat ism va sana', () => {
    const [r] = dueReminders([{ ...base, passportExpiresOn: '2026-11-30' }], '2026-10-31');
    expect(r!.text).toBe('Karimov Aziz — pasport muddati 30.11.2026 da tugaydi');
  });
});

describe('kunlik ish: eslatma → bildirishnoma → Telegram', () => {
  const { db, sql } = createDb(process.env.DATABASE_URL!);
  let tenantId: string;
  let companyId: string;
  let hrId: string;
  let egaId: string;
  let employeeId: string;
  const HR_CHAT = 700000000 + Math.floor(Math.random() * 1e6);

  beforeAll(async () => {
    const t = await createTenant(db, { name: 'Eslatma test', slug: `eslatma-${crypto.randomUUID()}` });
    tenantId = t.id;
    await withTenant(db, tenantId, async (tx) => {
      const [c] = await tx.insert(schema.companies).values({ tenantId, name: 'Distribyutor Plus' }).returning();
      companyId = c!.id;
      hrId = (await createUser(tx, { fullName: 'Malika', roles: ['HR menejer'] })).id;
      egaId = (await createUser(tx, { fullName: 'Abror', roles: ['Ega'] })).id;
      await tx.update(schema.users).set({ telegramId: BigInt(HR_CHAT) }).where(eq(schema.users.id, hrId));
    });
    employeeId = (await createEmployee(db, { tenantId, userId: hrId }, {
      companyId, lastName: 'Karimov', firstName: 'Aziz', probationEndsOn: '2026-10-20',
    })).id;
  });

  afterAll(async () => {
    await sql`delete from tenants where id = ${tenantId}`;
    await sql.end();
  });

  const mine = (tg: FakeTelegram) => tg.sent.filter((m) => m.chatId === String(HR_CHAT));

  it('belgilangan kundan oldin hech narsa kelmaydi', async () => {
    const tg = new FakeTelegram();
    await runDailyJobs(db, { telegram: tg, on: '2026-10-12', tenantIds: [tenantId] });
    expect(mine(tg)).toEqual([]);
  });

  it('belgilangan kunda HR Telegram’ida eslatma, ega va HR platformada bildirishnoma oladi', async () => {
    const tg = new FakeTelegram();
    await runDailyJobs(db, { telegram: tg, on: '2026-10-13', tenantIds: [tenantId] });
    expect(mine(tg)).toHaveLength(1);
    expect(mine(tg)[0]!.text).toContain('Karimov Aziz — sinov muddati 20.10.2026 da tugaydi');

    const inApp = await withTenant(db, tenantId, (tx) => tx.select().from(schema.notifications).where(eq(schema.notifications.kind, 'probation_end')));
    expect(inApp.map((n) => n.userId).sort()).toEqual([hrId, egaId].sort());
  });

  it('bir kunda ikki marta ishga tushsa ham xat bir marta keladi', async () => {
    const tg = new FakeTelegram();
    await runDailyJobs(db, { telegram: tg, on: '2026-10-13', tenantIds: [tenantId] });
    expect(mine(tg)).toEqual([]);
  });

  it('turi bo‘yicha sozlash: Telegram o‘chirilsa — faqat platformada', async () => {
    await withTenant(db, tenantId, (tx) => setNotificationPref(tx, hrId, 'birthday', { telegram: false }));
    await createEmployee(db, { tenantId, userId: hrId }, { companyId, lastName: 'Saidova', firstName: 'Malika', birthDate: '1995-11-05' });
    const tg = new FakeTelegram();
    await runDailyJobs(db, { telegram: tg, on: '2026-11-05', tenantIds: [tenantId] });
    expect(mine(tg)).toEqual([]);
    const [n] = await withTenant(db, tenantId, (tx) => tx.select().from(schema.notifications)
      .where(and(eq(schema.notifications.kind, 'birthday'), eq(schema.notifications.userId, hrId))));
    expect(n).toBeTruthy();
  });

  it('kelajak sanali o‘tkazish kuni kelganda kartaga qo‘llanadi', async () => {
    const [d] = await withTenant(db, tenantId, (tx) => tx.insert(schema.departments).values({ tenantId, companyId, name: 'Ombor' }).returning());
    await recordEvent(db, { tenantId, userId: hrId }, employeeId, { type: 'transfer', startsOn: '2099-01-10', payload: { departmentId: d!.id } });
    await runDailyJobs(db, { telegram: new FakeTelegram(), on: '2099-01-10', tenantIds: [tenantId] });
    const [e] = await withTenant(db, tenantId, (tx) => tx.select().from(schema.employees).where(eq(schema.employees.id, employeeId)));
    expect(e!.departmentId).toBe(d!.id);
  });
});
