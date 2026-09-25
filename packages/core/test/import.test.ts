// HR-11 / INT-01: xodimlarni Excel shablonidan import. Tayyorlik mezoni (PRD 13.2, 3-hafta):
// 100 xodimli Excel 1 daqiqada xatosiz import qilinadi. Xato bo'lsa — qator va ustun ko'rsatiladi, hech narsa yozilmaydi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createDb, eq, schema, withTenant } from '@kaft/db';
import { buildEmployeeTemplate, createTenant, createUser, EMPLOYEE_COLUMNS, ForbiddenError, importEmployees, localName } from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
let companyId: string;
let hrId: string;
let savdoId: string;

beforeAll(async () => {
  const t = await createTenant(db, { name: 'Import test', slug: `import-${crypto.randomUUID()}` });
  tenantId = t.id;
  await withTenant(db, tenantId, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId, name: 'Distribyutor Plus' }).returning();
    companyId = c!.id;
    hrId = (await createUser(tx, { fullName: 'HR', roles: ['HR menejer'] })).id;
    savdoId = (await createUser(tx, { fullName: 'Savdo', roles: ['Savdo menejeri'] })).id;
  });
});

afterAll(async () => {
  await sql`delete from tenants where id = ${tenantId}`;
  await sql.end();
});

/** Shablonni ochib, qatorlarni to'ldirib, faylni qaytaradi — foydalanuvchi qiladigandek. */
async function fillTemplate(rows: (string | number | Date | null)[][]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildEmployeeTemplate());
  const ws = wb.getWorksheet('Xodimlar')!;
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const ctx = () => ({ tenantId, userId: hrId });
const row = (i: number): (string | null)[] => [
  `Familiya${i}`, `Ism${i}`, 'Otaevich', `${String((i % 28) + 1).padStart(2, '0')}.03.1990`, `90${String(1000000 + i)}`,
  i % 2 ? 'Savdo bo‘limi' : 'Ombor', i % 3 ? 'Menejer' : 'Omborchi', '01.09.2024', 'Mehnat shartnomasi',
  `AB${String(1000000 + i)}`, String(30000000000000 + i), `8600${String(100000000000 + i)}`,
];

describe('Excel import', () => {
  it('shablonda PRD ustunlari bor', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildEmployeeTemplate());
    const header = (wb.getWorksheet('Xodimlar')!.getRow(1).values as string[]).slice(1);
    expect(header).toEqual(EMPLOYEE_COLUMNS.map((c) => c.title));
  });

  it('100 xodim 1 daqiqada xatosiz import qilinadi', async () => {
    const file = await fillTemplate(Array.from({ length: 100 }, (_, i) => row(i)));
    const started = Date.now();
    const res = await importEmployees(db, ctx(), file, { companyId });
    const ms = Date.now() - started;

    expect(res).toEqual({ ok: true, imported: 100 });
    expect(ms).toBeLessThan(60_000);

    const count = await withTenant(db, tenantId, (tx) => tx.$count(schema.employees));
    expect(count).toBe(100);
    const depts = await withTenant(db, tenantId, (tx) => tx.select({ name: schema.departments.name }).from(schema.departments));
    expect(depts.map((d) => d.name).sort()).toEqual(['Ombor', 'Savdo bo‘limi']);
    const [e] = await withTenant(db, tenantId, (tx) => tx.select().from(schema.employees).where(eq(schema.employees.lastName, 'Familiya7')));
    expect(e).toMatchObject({ phone: '+998901000007', birthDate: '1990-03-08', hiredAt: '2024-09-01' });
  }, 90_000);

  it('xatolar qator va ustun bilan ko‘rsatiladi, hech narsa yozilmaydi', async () => {
    const good = row(500);
    const noName = [...row(501)]; noName[1] = null;
    const badDate = [...row(502)]; badDate[3] = '31.02.1990';
    const badPhone = [...row(503)]; badPhone[4] = '12345';
    const badJshshir = [...row(504)]; badJshshir[10] = '123';
    const dupJshshir = [...row(505)]; dupJshshir[10] = good[10]!;
    const file = await fillTemplate([good, noName, badDate, badPhone, badJshshir, dupJshshir]);

    const res = await importEmployees(db, ctx(), file, { companyId });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const got = res.errors.map((e) => `${e.row}:${e.column}`);
    expect(got).toEqual(['3:Ism*', '4:Tug‘ilgan sana', '5:Telefon', '6:JShShIR', '7:JShShIR']);
    expect(res.errors[4]!.message).toMatch(/takror/i);

    const rows = await withTenant(db, tenantId, (tx) => tx.select().from(schema.employees).where(eq(schema.employees.lastName, 'Familiya500')));
    expect(rows).toEqual([]);
  });

  it('bazada bor JShShIR qayta import qilinmaydi', async () => {
    const file = await fillTemplate([row(7)]);
    const res = await importEmployees(db, ctx(), file, { companyId });
    expect(res).toMatchObject({ ok: false, errors: [{ row: 2, column: 'JShShIR' }] });
  });

  it('bo‘sh fayl — tushunarli xato', async () => {
    const res = await importEmployees(db, ctx(), await fillTemplate([]), { companyId });
    expect(res).toMatchObject({ ok: false, errors: [{ row: 0, message: expect.stringMatching(/bo‘sh/) }] });
  });

  it('kadrlarga huquqi yo‘q rol import qila olmaydi', async () => {
    await expect(importEmployees(db, { tenantId, userId: savdoId }, await fillTemplate([row(900)]), { companyId }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('ruscha nomlar (CORE-08)', () => {
  it('rus tilida ruscha nom, bo‘lmasa asl nom', () => {
    expect(localName({ name: 'Kassa', nameRu: 'Касса' }, 'ru')).toBe('Касса');
    expect(localName({ name: 'Kassa', nameRu: 'Касса' }, 'uz')).toBe('Kassa');
    expect(localName({ name: 'Ombor', nameRu: null }, 'ru')).toBe('Ombor');
  });

  it('importda ruscha bo‘lim/lavozim nomi saqlanadi, bor bo‘limda bo‘sh bo‘lsa to‘ldiriladi', async () => {
    const fresh = [...row(900), 'Розничная торговля', 'Продавец'];
    fresh[5] = 'Chakana savdo'; fresh[6] = 'Sotuvchi';
    const existing = [...row(902), 'Склад', null]; // «Ombor» oldingi testda ruscha nomsiz yaratilgan
    const res = await importEmployees(db, ctx(), await fillTemplate([fresh, existing]), { companyId });
    expect(res).toEqual({ ok: true, imported: 2 });

    const depts = await withTenant(db, tenantId, (tx) => tx.select({ name: schema.departments.name, nameRu: schema.departments.nameRu }).from(schema.departments));
    expect(depts).toContainEqual({ name: 'Chakana savdo', nameRu: 'Розничная торговля' });
    expect(depts).toContainEqual({ name: 'Ombor', nameRu: 'Склад' });
    const [pos] = await withTenant(db, tenantId, (tx) => tx.select({ nameRu: schema.positions.nameRu }).from(schema.positions).where(eq(schema.positions.name, 'Sotuvchi')));
    expect(pos?.nameRu).toBe('Продавец');
  }, 60_000);
});
