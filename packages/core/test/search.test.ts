// CORE-09: global qidiruv (xodim, hujjat; kontragent va tovar — R1/R2 modullari bilan) + «Kim qayerda» kompaniya bo'yicha.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, schema, withTenant } from '@kaft/db';
import { createEmployee, createTenant, createUser, headcount, search } from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
let companyA: string;
let companyB: string;
let hrId: string;
let kassirId: string;

beforeAll(async () => {
  const t = await createTenant(db, { name: 'Qidiruv test', slug: `qidiruv-${crypto.randomUUID()}` });
  tenantId = t.id;
  await withTenant(db, tenantId, async (tx) => {
    const cs = await tx.insert(schema.companies).values([{ tenantId, name: 'Savdo Markaz' }, { tenantId, name: 'Distribyutor Plus' }]).returning();
    companyA = cs[0]!.id;
    companyB = cs[1]!.id;
    hrId = (await createUser(tx, { fullName: 'HR', roles: ['HR menejer'] })).id;
    kassirId = (await createUser(tx, { fullName: 'Kassir', roles: ['Kassir'] })).id;
  });
  const hr = { tenantId, userId: hrId };
  await createEmployee(db, hr, { companyId: companyA, lastName: 'Karimov', firstName: 'Aziz', hiredAt: '2024-01-10' });
  await createEmployee(db, hr, { companyId: companyA, lastName: 'Karimova', firstName: 'Dilnoza', hiredAt: '2024-01-10' });
  await createEmployee(db, hr, { companyId: companyB, lastName: 'Saidov', firstName: 'Jasur', hiredAt: '2024-01-10' });
});

afterAll(async () => {
  await sql`delete from tenants where id = ${tenantId}`;
  await sql.end();
});

describe('global qidiruv', () => {
  it('ism yoki familiyaning bir qismi bo‘yicha, katta-kichik harfga qaramay', async () => {
    const res = await search(db, { tenantId, userId: hrId }, 'karim');
    expect(res.map((r) => r.title).sort()).toEqual(['Karimov Aziz', 'Karimova Dilnoza']);
    expect(res[0]).toMatchObject({ type: 'employee', href: expect.stringMatching(/^\/kadrlar\//) });
  });

  it('2 belgidan qisqa so‘rov — bo‘sh natija', async () => {
    expect(await search(db, { tenantId, userId: hrId }, 'k')).toEqual([]);
  });

  it('kadrlarni ko‘rish huquqi yo‘q rol xodimlarni topa olmaydi', async () => {
    expect(await search(db, { tenantId, userId: kassirId }, 'karim')).toEqual([]);
  });

  it('SQL maxsus belgilari oddiy matn sifatida qidiriladi', async () => {
    expect(await search(db, { tenantId, userId: hrId }, '%_%')).toEqual([]);
  });
});

describe('Kim qayerda — kompaniya bo‘yicha', () => {
  it('kompaniya tanlansa faqat uning xodimlari sanaladi', async () => {
    expect((await headcount(db, { tenantId, userId: hrId }, { companyId: companyA })).active).toBe(2);
    expect((await headcount(db, { tenantId, userId: hrId }, { companyId: companyB })).active).toBe(1);
    expect((await headcount(db, { tenantId, userId: hrId })).active).toBe(3);
  });
});
