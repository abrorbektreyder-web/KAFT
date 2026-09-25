// CP-01/02/05/08/10 (R1, 8-hafta): kontragent kartasi, rekvizitlar, kredit limiti, shartnomalar, Excel import.
// Tasdiqlash huquqi yo'q foydalanuvchi (buxgalter, savdo menejeri) tahriri — ega tasdiqlagandan keyin kuchga kiradi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { and, createDb, eq, schema, withTenant } from '@kaft/db';
import {
  approveChange, buildCounterpartyTemplate, COUNTERPARTY_COLUMNS, createCashAccount, createContract, createCounterparty, createTenant,
  createUser, FakeTelegram, ForbiddenError, getCounterparty, importCounterparties, listCategories, listChangeRequests,
  listCounterparties, recordTransaction, rejectChange, runDailyJobs, search, updateContract, updateCounterparty,
} from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
let otherTenantId: string;
let companyId: string;
const u: Record<string, string> = {};
const ctx = (k: string) => ({ tenantId, userId: u[k]! });
let stirSeq = 300_000_000;
const stir = () => String(stirSeq++);

beforeAll(async () => {
  tenantId = (await createTenant(db, { name: 'Kontragent test', slug: `cp-${crypto.randomUUID()}` })).id;
  otherTenantId = (await createTenant(db, { name: 'Boshqa', slug: `cp2-${crypto.randomUUID()}` })).id;
  await withTenant(db, tenantId, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId, name: 'Savdo Markaz' }).returning();
    companyId = c!.id;
    for (const [k, role] of [['ega', 'Ega'], ['direktor', 'Direktor'], ['buxgalter', 'Buxgalter'], ['savdo', 'Savdo menejeri'], ['savdo2', 'Savdo menejeri'], ['kassir', 'Kassir'], ['hr', 'HR menejer']] as const) {
      u[k] = (await createUser(tx, { fullName: k, roles: [role] })).id;
    }
  });
});

afterAll(async () => {
  await sql`delete from tenants where id in (${tenantId}, ${otherTenantId})`;
  await sql.end();
});

const notifs = (userId: string, kind: string) => withTenant(db, tenantId, (tx) => tx.select().from(schema.notifications)
  .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.kind, kind))));

describe('kontragent kartasi va rekvizitlar (CP-01, CP-02)', () => {
  it('bir nechta rol bilan yaratiladi; telefon +998 ko‘rinishiga keltiriladi', async () => {
    const s = stir();
    const { id } = await createCounterparty(db, ctx('ega'), {
      name: 'Oila Market MChJ', roles: ['customer', 'supplier'], stir: s, phone: '90 123 45 67', address: 'Toshkent, Chilonzor 5',
      contactPerson: 'Anvar Qodirov', bankName: 'Kapitalbank', bankMfo: '01088', bankAccount: '20208000900123456001',
      managerUserId: u.savdo, creditLimit: 50_000_000_00, creditCurrency: 'UZS', paymentTermDays: 14,
    });
    const card = await getCounterparty(db, ctx('ega'), id);
    expect(card).toMatchObject({ name: 'Oila Market MChJ', roles: ['customer', 'supplier'], stir: s, phone: '+998901234567', creditLimit: 50_000_000_00, paymentTermDays: 14 });
  });

  it('noto‘g‘ri STIR, MFO, hisob raqami, rol rad etiladi; STIR takrorlanmaydi', async () => {
    const base = { name: 'Tekshiruv', roles: ['customer' as const] };
    await expect(createCounterparty(db, ctx('ega'), { ...base, stir: '12345678' })).rejects.toThrow(/STIR/);
    await expect(createCounterparty(db, ctx('ega'), { ...base, bankMfo: '123' })).rejects.toThrow(/MFO/);
    await expect(createCounterparty(db, ctx('ega'), { ...base, bankAccount: '123' })).rejects.toThrow(/hisob raqami/i);
    await expect(createCounterparty(db, ctx('ega'), { ...base, roles: [] })).rejects.toThrow(/rol/i);
    await expect(createCounterparty(db, ctx('ega'), { ...base, roles: ['boss' as never] })).rejects.toThrow(/rol/i);
    const s = stir();
    await createCounterparty(db, ctx('ega'), { ...base, stir: s });
    await expect(createCounterparty(db, ctx('buxgalter'), { ...base, name: 'Boshqa nom', stir: s })).rejects.toThrow(/STIR.*bor/i);
  });

  it('buxgalter yaratadi; direktor va kassir faqat ko‘radi; HR ko‘rmaydi', async () => {
    const { id } = await createCounterparty(db, ctx('buxgalter'), { name: 'Buxgalter mijozi', roles: ['wholesale'] });
    expect((await getCounterparty(db, ctx('direktor'), id)).name).toBe('Buxgalter mijozi');
    expect((await getCounterparty(db, ctx('kassir'), id)).name).toBe('Buxgalter mijozi');
    await expect(createCounterparty(db, ctx('direktor'), { name: 'X', roles: ['customer'] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createCounterparty(db, ctx('kassir'), { name: 'X', roles: ['customer'] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateCounterparty(db, ctx('direktor'), id, { name: 'Y' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCounterparty(db, ctx('hr'), id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('savdo menejeri faqat o‘z mijozlarini ko‘radi; yaratganda mas’ul — o‘zi', async () => {
    const { id: mine } = await createCounterparty(db, ctx('savdo2'), { name: 'Savdo2 mijozi', roles: ['customer'], managerUserId: u.savdo });
    const { id: foreign } = await createCounterparty(db, ctx('ega'), { name: 'Begona mijoz', roles: ['customer'] });
    expect((await getCounterparty(db, ctx('savdo2'), mine)).managerUserId).toBe(u.savdo2);
    const list = await listCounterparties(db, ctx('savdo2'));
    expect(list.map((c) => c.id)).toEqual([mine]);
    await expect(getCounterparty(db, ctx('savdo2'), foreign)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('ro‘yxat: nom/STIR bo‘yicha qidiruv va rol filtri', async () => {
    const s = stir();
    await createCounterparty(db, ctx('ega'), { name: 'Qidiruvbop Ta’minot', roles: ['supplier'], stir: s });
    expect((await listCounterparties(db, ctx('ega'), { q: 'qidiruvbop' })).map((c) => c.name)).toEqual(['Qidiruvbop Ta’minot']);
    expect((await listCounterparties(db, ctx('ega'), { q: s })).map((c) => c.stir)).toEqual([s]);
    const suppliers = await listCounterparties(db, ctx('ega'), { role: 'supplier' });
    expect(suppliers.every((c) => c.roles.includes('supplier'))).toBe(true);
  });

  it('boshqa tenant kontragenti ko‘rinmaydi', async () => {
    const { id } = await createCounterparty(db, ctx('ega'), { name: 'Maxfiy hamkor', roles: ['customer'] });
    const otherEga = await withTenant(db, otherTenantId, (tx) => createUser(tx, { fullName: 'Boshqa ega', roles: ['Ega'] }));
    await expect(getCounterparty(db, { tenantId: otherTenantId, userId: otherEga.id }, id)).rejects.toThrow(/topilmadi/i);
    expect(await listCounterparties(db, { tenantId: otherTenantId, userId: otherEga.id })).toEqual([]);
  });

  it('global qidiruvda kontragent chiqadi (CORE-09)', async () => {
    await createCounterparty(db, ctx('ega'), { name: 'Globalbek Savdo', roles: ['customer'], managerUserId: u.savdo });
    expect((await search(db, ctx('ega'), 'globalbek')).map((h) => [h.type, h.title])).toContainEqual(['counterparty', 'Globalbek Savdo']);
    expect(await search(db, ctx('savdo2'), 'globalbek')).toEqual([]);
  });
});

describe('tahrir va egasining tasdig‘i', () => {
  it('ega tahriri darhol kuchga kiradi, audit jurnalida eski/yangi qiymat', async () => {
    const { id } = await createCounterparty(db, ctx('ega'), { name: 'Ega tahriri', roles: ['customer'], creditLimit: 10_000_00 });
    expect(await updateCounterparty(db, ctx('ega'), id, { creditLimit: 20_000_00 })).toEqual({ applied: true });
    expect((await getCounterparty(db, ctx('ega'), id)).creditLimit).toBe(20_000_00);
    const [log] = await withTenant(db, tenantId, (tx) => tx.select().from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityId, id), eq(schema.auditLog.action, 'update'))));
    expect(log).toMatchObject({ oldValue: { creditLimit: 10_000_00 }, newValue: { creditLimit: 20_000_00 } });
  });

  it('buxgalter tahriri — so‘rov; ega tasdiqlagach kuchga kiradi, ikkalasiga xabar', async () => {
    const { id } = await createCounterparty(db, ctx('ega'), { name: 'Limit mijoz', roles: ['customer'], creditLimit: 50_000_000_00, bankAccount: '20208000900123456001' });
    const res = await updateCounterparty(db, ctx('buxgalter'), id, { creditLimit: 500_000_000_00, bankAccount: '20208000900123456999', name: 'Limit mijoz' });
    expect(res).toMatchObject({ applied: false, requestId: expect.any(String) });
    // Karta o'zgarmagan
    expect((await getCounterparty(db, ctx('ega'), id))).toMatchObject({ creditLimit: 50_000_000_00, bankAccount: '20208000900123456001' });
    // So'rovda faqat haqiqatan o'zgargan maydonlar
    const [reqRow] = await listChangeRequests(db, ctx('ega'), { entityId: id });
    expect(reqRow).toMatchObject({ status: 'pending', entity: 'counterparty', entityName: 'Limit mijoz', requestedBy: u.buxgalter });
    expect(reqRow!.changes).toEqual({
      creditLimit: { from: 50_000_000_00, to: 500_000_000_00 },
      bankAccount: { from: '20208000900123456001', to: '20208000900123456999' },
    });
    expect(await notifs(u.ega!, 'change_request')).toHaveLength(1);

    // Kutilayotgan so'rov bor ekan — ikkinchisi rad etiladi; buxgalter o'zi tasdiqlay olmaydi
    await expect(updateCounterparty(db, ctx('buxgalter'), id, { creditLimit: 1 })).rejects.toThrow(/kutilayotgan/i);
    await expect(approveChange(db, ctx('buxgalter'), res.requestId!)).rejects.toBeInstanceOf(ForbiddenError);

    await approveChange(db, ctx('ega'), res.requestId!);
    expect(await getCounterparty(db, ctx('ega'), id)).toMatchObject({ creditLimit: 500_000_000_00, bankAccount: '20208000900123456999' });
    expect((await listChangeRequests(db, ctx('ega'), { entityId: id }))[0]).toMatchObject({ status: 'approved', decidedBy: u.ega });
    expect(await notifs(u.buxgalter!, 'change_decided')).toHaveLength(1);
    await expect(approveChange(db, ctx('ega'), res.requestId!)).rejects.toThrow(/hal qilingan/i);
  });

  it('rad etish: sabab majburiy, karta o‘zgarmaydi', async () => {
    const { id } = await createCounterparty(db, ctx('ega'), { name: 'Rad mijoz', roles: ['customer'], paymentTermDays: 7 });
    const { requestId } = await updateCounterparty(db, ctx('buxgalter'), id, { paymentTermDays: 90 });
    await expect(rejectChange(db, ctx('ega'), requestId!, ' ')).rejects.toThrow(/sabab/i);
    await rejectChange(db, ctx('ega'), requestId!, 'Muddat juda uzun');
    expect((await getCounterparty(db, ctx('ega'), id)).paymentTermDays).toBe(7);
    expect((await listChangeRequests(db, ctx('ega'), { entityId: id }))[0]).toMatchObject({ status: 'rejected', decisionReason: 'Muddat juda uzun' });
  });

  it('so‘rovdan keyin karta boshqacha o‘zgargan bo‘lsa — tasdiqlab bo‘lmaydi', async () => {
    const { id } = await createCounterparty(db, ctx('ega'), { name: 'Ziddiyat', roles: ['customer'], creditLimit: 100 });
    const { requestId } = await updateCounterparty(db, ctx('buxgalter'), id, { creditLimit: 200 });
    await updateCounterparty(db, ctx('ega'), id, { creditLimit: 300 });
    await expect(approveChange(db, ctx('ega'), requestId!)).rejects.toThrow(/o‘zgargan/i);
    expect((await getCounterparty(db, ctx('ega'), id)).creditLimit).toBe(300);
  });

  it('savdo menejeri o‘z mijozini tahrirlasa ham tasdiq kerak; o‘zgarishsiz tahrir so‘rov yaratmaydi', async () => {
    const { id } = await createCounterparty(db, ctx('savdo'), { name: 'Savdo o‘zi', roles: ['customer'] });
    expect(await updateCounterparty(db, ctx('savdo'), id, { name: 'Savdo o‘zi' })).toEqual({ applied: true });
    expect((await updateCounterparty(db, ctx('savdo'), id, { phone: '901112233' })).applied).toBe(false);
  });
});

describe('shartnomalar (CP-08)', () => {
  it('kartada ko‘rinadi; tugashiga 30 kun qolganda ega va mas’ul menejerga eslatma (uz/ru)', async () => {
    const { id } = await createCounterparty(db, ctx('ega'), { name: 'Shartnomali MChJ', roles: ['supplier'], managerUserId: u.savdo });
    await createContract(db, ctx('buxgalter'), id, { number: '21-T', signedOn: '2026-01-10', endsOn: '2026-12-31', amount: 900_000_000_00, currency: 'UZS' });
    const card = await getCounterparty(db, ctx('ega'), id);
    expect(card.contracts).toMatchObject([{ number: '21-T', endsOn: '2026-12-31', amount: 900_000_000_00 }]);

    await runDailyJobs(db, { telegram: new FakeTelegram(), on: '2026-11-30', tenantIds: [tenantId] });
    await runDailyJobs(db, { telegram: new FakeTelegram(), on: '2026-12-01', tenantIds: [tenantId] });
    const [n] = await notifs(u.savdo!, 'cp_contract_end');
    expect(n).toMatchObject({ body: 'Shartnomali MChJ — shartnoma №21-T muddati 31.12.2026 da tugaydi', link: `/kontragentlar/${id}` });
    expect(await notifs(u.ega!, 'cp_contract_end')).toHaveLength(1);
    const { localize } = await import('../src/index.ts');
    expect(localize(n!, 'ru').body).toBe('Shartnomali MChJ — срок договора №21-T истекает 31.12.2026');
  });

  it('shartnomani buxgalter tahrirlasa — tasdiq orqali', async () => {
    const { id } = await createCounterparty(db, ctx('ega'), { name: 'Shartnoma tahriri', roles: ['customer'] });
    const c = await createContract(db, ctx('ega'), id, { number: '5', signedOn: '2026-02-01', amount: 1_000_00, currency: 'USD' });
    const { requestId } = await updateContract(db, ctx('buxgalter'), c.id, { amount: 9_000_00 });
    expect((await getCounterparty(db, ctx('ega'), id)).contracts[0]!.amount).toBe(1_000_00);
    await approveChange(db, ctx('ega'), requestId!);
    expect((await getCounterparty(db, ctx('ega'), id)).contracts[0]!.amount).toBe(9_000_00);
  });
});

describe('pul bilan bog‘lanish (CP-03 360°)', () => {
  it('kirimda kontragent tanlanadi va kartada to‘lov sifatida ko‘rinadi; begona kontragent rad etiladi', async () => {
    const { id } = await createCounterparty(db, ctx('ega'), { name: 'To‘lovchi', roles: ['customer'] });
    const acc = await createCashAccount(db, ctx('ega'), { companyId, name: 'Kassa', type: 'cash', currency: 'UZS' });
    const cat = (await listCategories(db, ctx('ega'), 'in'))[0]!;
    await recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'in', amount: 5_000_00, categoryId: cat.id, occurredOn: '2026-09-20', counterpartyId: id });
    const card = await getCounterparty(db, ctx('ega'), id);
    expect(card.payments).toMatchObject([{ direction: 'in', amount: 5_000_00, accountName: 'Kassa' }]);
    await expect(recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'in', amount: 1, categoryId: cat.id, occurredOn: '2026-09-20', counterpartyId: crypto.randomUUID() }))
      .rejects.toThrow(/kontragent/i);
  });
});

describe('Excel import (CP-10, INT-01)', () => {
  async function fill(rows: (string | number | null)[][]) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildCounterpartyTemplate());
    const ws = wb.getWorksheet('Kontragentlar')!;
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  // Nomi, Rollar, STIR, Telefon, Manzil, Mas'ul shaxs, Bank, MFO, Hisob raqami, Kredit limiti, To'lov muddati
  const row = (i: number): (string | number | null)[] => [
    `Import MChJ ${i}`, i % 2 ? 'mijoz' : 'ta’minotchi, mijoz', String(400_000_000 + i), `90${String(2000000 + i)}`, 'Toshkent',
    null, 'Hamkorbank', '00083', `2020800090000000${String(1000 + i)}`, 10_000_000, 30,
  ];

  it('shablonda ustunlar bor', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildCounterpartyTemplate());
    expect((wb.getWorksheet('Kontragentlar')!.getRow(1).values as string[]).slice(1)).toEqual(COUNTERPARTY_COLUMNS.map((c) => c.title));
  });

  it('100 ta kontragent xatosiz import qilinadi', async () => {
    const res = await importCounterparties(db, ctx('buxgalter'), await fill(Array.from({ length: 100 }, (_, i) => row(i))));
    expect(res).toEqual({ ok: true, imported: 100 });
    const [c] = await listCounterparties(db, ctx('ega'), { q: String(400_000_000 + 2) });
    expect(c).toMatchObject({ name: 'Import MChJ 2', roles: ['supplier', 'customer'], creditLimit: 10_000_000_00, paymentTermDays: 30 });
  }, 90_000);

  it('xatolar qator va ustun bilan; hech narsa yozilmaydi', async () => {
    const noName = row(500); noName[0] = null;
    const badRole = row(501); badRole[1] = 'do‘st';
    const badStir = row(502); badStir[2] = '123';
    const dup = row(503); dup[2] = String(400_000_000 + 5); // oldingi importda bor
    const res = await importCounterparties(db, ctx('buxgalter'), await fill([noName, badRole, badStir, dup, row(504)]));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.map((e) => [e.row, e.column])).toEqual([[2, 'Nomi*'], [3, 'Rollar*'], [4, 'STIR'], [5, 'STIR']]);
    expect(await listCounterparties(db, ctx('ega'), { q: 'Import MChJ 504' })).toEqual([]);
  });

  it('import faqat to‘liq huquqli rolga', async () => {
    await expect(importCounterparties(db, ctx('savdo'), await fill([row(600)]))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
