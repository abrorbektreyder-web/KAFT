// e2e testlar uchun alohida tenant (faqat dev/CI bazada). Har ishga tushishda qaytadan yaratiladi.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb, schema, withTenant } from '@kaft/db';
import { createEmployee, createTenant, createUser, FakeTelegram, recordEvent, runDailyJobs } from '@kaft/core';
import { acceptInvite, ConsoleMailer, createAuth, createInvitation } from './index.ts';

const envFile = resolve(import.meta.dirname, '../../../.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
const { DATABASE_URL, BETTER_AUTH_SECRET } = process.env;
if (!DATABASE_URL || !BETTER_AUTH_SECRET) throw new Error('DATABASE_URL va BETTER_AUTH_SECRET kerak');

export const E2E = { slug: 'e2e-test', email: 'e2e-hr@kaft.test', password: 'E2e-test-parol-2026' };

const { db, sql } = createDb(DATABASE_URL);
const mailer = new ConsoleMailer({ quiet: true });
const auth = createAuth({ db, mailer, baseURL: 'http://localhost:3000', secret: BETTER_AUTH_SECRET });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
const addDays = (n: number) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);

try {
  await sql`delete from tenants where slug = ${E2E.slug}`;
  await sql`delete from auth_user where email = ${E2E.email}`;
  const { id: t } = await createTenant(db, { name: 'E2E test', slug: E2E.slug });
  const { companyId, deptId, hrId } = await withTenant(db, t, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId: t, name: 'E2E kompaniya' }).returning();
    const [d] = await tx.insert(schema.departments).values({ tenantId: t, companyId: c!.id, name: 'E2E bo‘lim', nameRu: 'E2E отдел' }).returning();
    const hr = await createUser(tx, { fullName: 'Test Kadrchi', email: E2E.email, roles: ['HR menejer'] });
    return { companyId: c!.id, deptId: d!.id, hrId: hr.id };
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

  await createInvitation(db, { tenantId: t, userId: hrId }, { mailer, baseURL: 'http://localhost:3000' });
  const token = mailer.outbox.at(-1)!.text.match(/taklif\/([\w-]+)/)![1]!;
  await acceptInvite(db, auth, { token, password: E2E.password });
  console.log('e2e tenant tayyor');
} finally {
  await sql.end();
}
