// e2e testlar uchun alohida tenant (faqat dev/CI bazada). Har ishga tushishda qaytadan yaratiladi.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb, schema, withTenant } from '@kaft/db';
import { createCashAccount, createCounterparty, createEmployee, createProduct, setStaffingPlan, createTenant, createUser, FakeTelegram, recordEvent, runDailyJobs } from '@kaft/core';
import { acceptInvite, ConsoleMailer, createAuth, createInvitation } from './index.ts';

const envFile = resolve(import.meta.dirname, '../../../.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
const { DATABASE_URL, BETTER_AUTH_SECRET } = process.env;
if (!DATABASE_URL || !BETTER_AUTH_SECRET) throw new Error('DATABASE_URL va BETTER_AUTH_SECRET kerak');

export const E2E = { slug: 'e2e-test', email: 'e2e-hr@kaft.test', kassirEmail: 'e2e-kassir@kaft.test', savdoEmail: 'e2e-savdo@kaft.test', password: 'E2e-test-parol-2026' };

const { db, sql } = createDb(DATABASE_URL);
const mailer = new ConsoleMailer({ quiet: true });
const auth = createAuth({ db, mailer, baseURL: 'http://localhost:3000', secret: BETTER_AUTH_SECRET });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
const addDays = (n: number) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);

try {
  await sql`delete from tenants where slug = ${E2E.slug}`;
  await sql`delete from auth_user where email in (${E2E.email}, ${E2E.kassirEmail}, ${E2E.savdoEmail})`;
  const { id: t } = await createTenant(db, { name: 'E2E test', slug: E2E.slug });
  const { companyId, deptId, hrId, kassirId, savdoId, egaId } = await withTenant(db, t, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId: t, name: 'E2E kompaniya', nameRu: 'E2E компания' }).returning();
    const [d] = await tx.insert(schema.departments).values({ tenantId: t, companyId: c!.id, name: 'E2E bo‘lim', nameRu: 'E2E отдел' }).returning();
    const hr = await createUser(tx, { fullName: 'Test Kadrchi', email: E2E.email, roles: ['HR menejer'] });
    // Kassir — pul sahifasi (faqat o'z kassasi); ega — faqat kassalarni ochish uchun, logini yo'q
    const kassir = await createUser(tx, { fullName: 'Test Kassir', email: E2E.kassirEmail, roles: ['Kassir'] });
    const savdo = await createUser(tx, { fullName: 'Test Savdo', email: E2E.savdoEmail, roles: ['Savdo menejeri'] });
    const ega = await createUser(tx, { fullName: 'Test Ega', roles: ['Ega'] });
    return { companyId: c!.id, deptId: d!.id, hrId: hr.id, kassirId: kassir.id, savdoId: savdo.id, egaId: ega.id };
  });
  const ctx = { tenantId: t, userId: hrId };
  const ids = [];
  for (const [last, first] of [['E2eov', 'Aziz'], ['E2eova', 'Malika'], ['Qidiruvbek', 'Jasur'], ['Toshmatov', 'Sardor'], ['Rahimova', 'Dilnoza']]) {
    // Rahimova Dilnoza — bugun tug'ilgan kun (eslatma tilini tekshirish uchun)
    const birthDate = first === 'Dilnoza' ? `1995-${today.slice(5)}` : undefined;
    ids.push((await createEmployee(db, ctx, { companyId, departmentId: deptId, lastName: last!, firstName: first!, hiredAt: '2024-01-15', birthDate })).id);
  }
  await recordEvent(db, ctx, ids[1]!, { type: 'vacation', startsOn: today, endsOn: addDays(5), basis: 'E2E' });
  await runDailyJobs(db, { telegram: new FakeTelegram(), on: today, tenantIds: [t] });

  const ega = { tenantId: t, userId: egaId };
  await createCashAccount(db, ega, { companyId, name: 'E2E kassa', type: 'cash', currency: 'UZS', responsibleUserId: kassirId, openingBalance: 1_000_000_00, openingOn: today });
  await createCashAccount(db, ega, { companyId, name: 'Boshqa kassa', type: 'bank', currency: 'UZS', openingBalance: 5_000_000_00, openingOn: today });

  await createCounterparty(db, ega, { name: 'E2E hamkor', roles: ['customer'], managerUserId: savdoId });
  await createCounterparty(db, ega, { name: 'E2E do‘kon', roles: ['customer'], managerUserId: savdoId });
  // Shtat jadvali: E2E bo'limida 2 ta kassir o'rni (hali hech kim yo'q — 2 ta bo'sh o'rin)
  const [kassirPos] = await withTenant(db, t, (tx) => tx.insert(schema.positions).values({ tenantId: t, companyId, name: 'Kassir' }).returning());
  await setStaffingPlan(db, ega, { departmentId: deptId, positionId: kassirPos!.id, planned: 2 });
  await createProduct(db, ega, { name: 'E2E suv', unit: 'dona', prices: { retail: 5_000_00, wholesale: 4_000_00 } });

  for (const userId of [hrId, kassirId, savdoId]) {
    await createInvitation(db, { tenantId: t, userId }, { mailer, baseURL: 'http://localhost:3000' });
    const token = mailer.outbox.at(-1)!.text.match(/taklif\/([\w-]+)/)![1]!;
    await acceptInvite(db, auth, { token, password: E2E.password });
  }
  console.log('e2e tenant tayyor');
} finally {
  await sql.end();
}
