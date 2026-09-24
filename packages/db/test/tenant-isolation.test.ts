// AC-7: tenant A foydalanuvchisi tenant B yozuvini hech qanday yo'l bilan ko'ra olmaydi va o'zgartira olmaydi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, withTenant, withAppRole } from '../src/index.ts';
import { companies, departments, tenantModules, tenants } from '../src/schema.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);

let tenantA: string;
let tenantB: string;
let companyB: string;

beforeAll(async () => {
  // Admin ulanish (RLS'dan tashqarida) — faqat test ma'lumotini tayyorlash uchun
  const [a] = await sql`insert into tenants (name, slug) values ('Test A', ${'test-a-' + crypto.randomUUID()}) returning id`;
  const [b] = await sql`insert into tenants (name, slug) values ('Test B', ${'test-b-' + crypto.randomUUID()}) returning id`;
  tenantA = a!.id;
  tenantB = b!.id;
  const [cb] = await sql`insert into companies (tenant_id, name) values (${tenantB}, 'B kompaniyasi') returning id`;
  companyB = cb!.id;
  await sql`insert into companies (tenant_id, name) values (${tenantA}, 'A kompaniyasi')`;
});

afterAll(async () => {
  await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
  await sql.end();
});

describe('tenant izolyatsiyasi (RLS)', () => {
  it('A tenant B kompaniyasini ID orqali so‘rasa — natija bo‘sh', async () => {
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(companies).where(eq(companies.id, companyB)));
    expect(rows).toEqual([]);
  });

  it('A tenant faqat o‘z kompaniyalarini ko‘radi', async () => {
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(companies));
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
  });

  it('A tenant boshqa tenantlar ro‘yxatini ko‘rmaydi', async () => {
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(tenants));
    expect(rows.map((r) => r.id)).toEqual([tenantA]);
  });

  it('A tenant B nomidan yozuv qo‘sha olmaydi', async () => {
    await expect(
      withTenant(db, tenantA, (tx) => tx.insert(companies).values({ tenantId: tenantB, name: 'Yashirin' })),
    ).rejects.toMatchObject({ cause: { code: '42501' } }); // RLS buzilishi
  });

  it('A tenant B kompaniyasini o‘zgartira olmaydi — 0 qator', async () => {
    const res = await withTenant(db, tenantA, (tx) =>
      tx.update(companies).set({ name: 'Buzildi' }).where(eq(companies.id, companyB)).returning(),
    );
    expect(res).toEqual([]);
    const [still] = await sql`select name from companies where id = ${companyB}`;
    expect(still!.name).toBe('B kompaniyasi');
  });

  it('A tenant B kompaniyasini o‘chira olmaydi — 0 qator', async () => {
    const res = await withTenant(db, tenantA, (tx) => tx.delete(companies).where(eq(companies.id, companyB)).returning());
    expect(res).toEqual([]);
  });

  it('A tenant o‘z bo‘limini B kompaniyasiga bog‘lay olmaydi', async () => {
    await expect(
      withTenant(db, tenantA, (tx) => tx.insert(departments).values({ tenantId: tenantA, companyId: companyB, name: 'Aralash' })),
    ).rejects.toMatchObject({ cause: { code: '23503' } }); // tarkibiy FK
  });

  it('tenant konteksti o‘rnatilmagan so‘rov hech narsa qaytarmaydi', async () => {
    const rows = await withAppRole(db, (tx) => tx.select().from(companies));
    expect(rows).toEqual([]);
  });

  it('tenant ID noto‘g‘ri formatda bo‘lsa — xato', async () => {
    await expect(withTenant(db, "' or 1=1 --", (tx) => tx.select().from(companies))).rejects.toThrow();
  });

  it('modul kalitlari ham tenantga ajratilgan', async () => {
    await sql`insert into tenant_modules (tenant_id, module, enabled) values (${tenantB}, 'inv', true)`;
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(tenantModules));
    expect(rows).toEqual([]);
  });
});
