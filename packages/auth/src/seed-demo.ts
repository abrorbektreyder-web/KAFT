// Demo tenant: bosh sahifani haqiqiy ma'lumot bilan ko'rish uchun (faqat dev bazada!).
//   pnpm seed:demo   — «Demo holding»ni qaytadan yaratadi va login ma'lumotlarini chiqaradi
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb, schema, withTenant } from '@kaft/db';
import { createEmployee, createTenant, createUser, FakeTelegram, recordEvent, runDailyJobs } from '@kaft/core';
import { acceptInvite, ConsoleMailer, createAuth, createInvitation } from './index.ts';

const envFile = resolve(import.meta.dirname, '../../../.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
const { DATABASE_URL, BETTER_AUTH_SECRET } = process.env;
if (!DATABASE_URL || !BETTER_AUTH_SECRET) throw new Error('DATABASE_URL va BETTER_AUTH_SECRET kerak');

const SLUG = 'demo-holding';
const OWNER_EMAIL = 'ega@demo.kaft.uz';
const HR_EMAIL = 'hr@demo.kaft.uz';
const { db, sql } = createDb(DATABASE_URL);
const mailer = new ConsoleMailer({ quiet: true });
const auth = createAuth({ db, mailer, baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000', secret: BETTER_AUTH_SECRET });

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
const addDays = (n: number) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);

const LAST = ['Karimov', 'Saidov', 'Toshmatov', 'Rahimov', 'Yusupov', 'Nazarov', 'Aliyev', 'Qodirov', 'Ergashev', 'Mirzayev'];
const FIRST_M = ['Aziz', 'Jasur', 'Sardor', 'Bekzod', 'Otabek', 'Sherzod', 'Rustam', 'Farrux'];
const FIRST_F = ['Malika', 'Dilnoza', 'Nodira', 'Kamola', 'Gulnora', 'Zarina', 'Madina', 'Shahnoza'];

try {
  // Eski demoni tozalash (kaskad bilan) va loginlarini
  await sql`delete from tenants where slug = ${SLUG}`;
  await sql`delete from auth_user where email in (${OWNER_EMAIL}, ${HR_EMAIL})`;

  const tenant = await createTenant(db, { name: 'Demo holding', slug: SLUG, brandName: 'Demo holding' });
  const t = tenant.id;
  const { companies, depts, ownerId, hrId } = await withTenant(db, t, async (tx) => {
    const companies = await tx.insert(schema.companies).values([{ tenantId: t, name: 'Savdo Markaz' }, { tenantId: t, name: 'Distribyutor Plus' }]).returning();
    const depts = await tx.insert(schema.departments).values([
      { tenantId: t, companyId: companies[0]!.id, name: 'Chakana savdo' },
      { tenantId: t, companyId: companies[0]!.id, name: 'Kassa' },
      { tenantId: t, companyId: companies[1]!.id, name: 'Ulgurji savdo' },
      { tenantId: t, companyId: companies[1]!.id, name: 'Ombor' },
    ]).returning();
    const owner = await createUser(tx, { fullName: 'Abror Egamov', email: OWNER_EMAIL, roles: ['Ega'] });
    const hr = await createUser(tx, { fullName: 'Malika Saidova', email: HR_EMAIL, roles: ['HR menejer'] });
    return { companies, depts, ownerId: owner.id, hrId: hr.id };
  });
  const ctx = { tenantId: t, userId: ownerId };

  const ids: string[] = [];
  for (let i = 0; i < 40; i++) {
    const female = i % 2 === 1;
    const dept = depts[i % depts.length]!;
    const last = LAST[i % LAST.length]!;
    const birth = i === 0 ? `1990-${today.slice(5)}` : i === 1 ? `1993-${addDays(3).slice(5)}` : `19${80 + (i % 20)}-0${1 + (i % 9)}-1${i % 9}`;
    const { id } = await createEmployee(db, ctx, {
      companyId: dept.companyId, departmentId: dept.id,
      lastName: female ? `${last}a` : last, firstName: (female ? FIRST_F : FIRST_M)[i % 8]!,
      birthDate: birth, phone: `+99890${String(1000000 + i * 7331).slice(0, 7)}`, hiredAt: `202${i % 5}-0${1 + (i % 9)}-01`,
      probationEndsOn: i === 2 ? addDays(7) : undefined, contractEndsOn: i === 3 ? addDays(30) : undefined,
    });
    ids.push(id);
  }
  // Bugungi holatlar: ta'til, kasallik, safar, dikret — «Kim qayerda» va «Bugun yo'qlar»
  await recordEvent(db, ctx, ids[4]!, { type: 'vacation', startsOn: addDays(-3), endsOn: addDays(9), basis: 'Buyruq №12' });
  await recordEvent(db, ctx, ids[8]!, { type: 'vacation', startsOn: addDays(-1), endsOn: addDays(5), basis: 'Buyruq №14' });
  await recordEvent(db, ctx, ids[5]!, { type: 'sick', startsOn: addDays(-1), endsOn: addDays(2), basis: 'Kasallik varaqasi' });
  await recordEvent(db, ctx, ids[7]!, { type: 'maternity', startsOn: addDays(-40), basis: 'Buyruq №3' });
  await recordEvent(db, ctx, ids[11]!, { type: 'business_trip', startsOn: today, endsOn: addDays(2), basis: 'Buyruq №15' });
  await recordEvent(db, ctx, ids[16]!, { type: 'vacation', startsOn: today, endsOn: addDays(6), basis: 'Buyruq №16' });

  // Loginlar: taklif → parol (ega va HR)
  const logins: [string, string, string][] = [];
  for (const [userId, email, role] of [[ownerId, OWNER_EMAIL, 'Ega (2FA majburiy)'], [hrId, HR_EMAIL, 'HR menejer']] as const) {
    const password = randomBytes(9).toString('base64url');
    await createInvitation(db, { tenantId: t, userId }, { mailer, baseURL: 'http://localhost:3000' });
    const token = mailer.outbox.at(-1)!.text.match(/taklif\/([\w-]+)/)![1]!;
    await acceptInvite(db, auth, { token, password });
    logins.push([role, email, password]);
  }

  // Bugungi eslatmalar: tug'ilgan kun (bugun), sinov (7 kundan keyin), shartnoma (30 kundan keyin)
  await runDailyJobs(db, { telegram: new FakeTelegram(), on: today, tenantIds: [t] });

  const [row] = await sql`select count(*)::int as count from employees where tenant_id = ${t}`;
  console.log(`\nDemo tayyor: «Demo holding», ${companies.length} kompaniya, ${row!.count} xodim`);
  console.log('Kirish: http://localhost:3000/kirish');
  for (const [role, email, password] of logins) console.log(`  ${role.padEnd(20)} ${email.padEnd(20)} parol: ${password}`);
  console.log('Ega birinchi kirishda telefon ilovasini (2FA) ulaydi.\n');
} finally {
  await sql.end();
}
