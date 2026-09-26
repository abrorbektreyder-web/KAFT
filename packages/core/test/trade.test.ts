// R1, 9-hafta: tovarlar, sotuv (SAL-01/02/05), xarid (PUR-01/05), qarzlar (ko'p valyutali), kredit limiti (CP-05),
// boshlang'ich qarzlar (CP-10). Qarz saqlanmaydi — hujjatlar va to'lovlardan hisoblanadi (PRD 9.1).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { and, createDb, eq, schema, withTenant } from '@kaft/db';
import {
  approveSale, buildOpeningDebtTemplate, cancelPurchase, cancelSale, counterpartyDebts, createCashAccount, createCounterparty,
  createProduct, createPurchase, createSale, createSaleReturn, createTenant, createUser, ForbiddenError, getSale, importOpeningDebts,
  listCategories, listProducts, listSales, loadCbuRates, purchaseReport, recordOpeningDebt, recordTransaction,
} from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
let otherTenantId: string;
let companyId: string;
const u: Record<string, string> = {};
const ctx = (k: string) => ({ tenantId, userId: u[k]! });
const so = (n: number) => n * 100;
const p: Record<string, string> = {};
let uzsKassa: string;
let usdKassa: string;
let incomeCat: string;
let expenseCat: string;

// Umumiy kurslar jadvali — boshqa testlar bilan to'qnashmaydigan sanalar (2002-yil)
const cbu = (date: string, usd: string) => async () => new Response(JSON.stringify([{ Ccy: 'USD', Rate: usd, Nominal: '1', Date: date }]));

beforeAll(async () => {
  tenantId = (await createTenant(db, { name: 'Savdo test', slug: `trade-${crypto.randomUUID()}` })).id;
  otherTenantId = (await createTenant(db, { name: 'Boshqa', slug: `trade2-${crypto.randomUUID()}` })).id;
  await withTenant(db, tenantId, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId, name: 'Savdo Markaz' }).returning();
    companyId = c!.id;
    for (const [k, role] of [['ega', 'Ega'], ['buxgalter', 'Buxgalter'], ['savdo', 'Savdo menejeri'], ['savdo2', 'Savdo menejeri'], ['omborchi', 'Omborchi'], ['hr', 'HR menejer']] as const) {
      u[k] = (await createUser(tx, { fullName: k, roles: [role] })).id;
    }
  });
  await loadCbuRates(db, { on: '2002-01-10', fetch: cbu('10.01.2002', '12500') });
  await loadCbuRates(db, { on: '2002-02-10', fetch: cbu('10.02.2002', '12000') });
  p.suv = (await createProduct(db, ctx('ega'), { name: 'Suv 1,5 l', unit: 'dona', sku: 'SUV-15', prices: { retail: so(5_000), wholesale: so(4_000), special: so(3_500) } })).id;
  p.shakar = (await createProduct(db, ctx('omborchi'), { name: 'Shakar', unit: 'kg', prices: { retail: so(14_000), wholesale: so(12_500) } })).id;
  uzsKassa = (await createCashAccount(db, ctx('ega'), { companyId, name: 'Kassa', type: 'cash', currency: 'UZS' })).id;
  usdKassa = (await createCashAccount(db, ctx('ega'), { companyId, name: 'Dollar', type: 'cash', currency: 'USD' })).id;
  incomeCat = (await listCategories(db, ctx('ega'), 'in'))[0]!.id;
  expenseCat = (await listCategories(db, ctx('ega'), 'out'))[0]!.id;
});

afterAll(async () => {
  await sql`delete from tenants where id in (${tenantId}, ${otherTenantId})`;
  await sql`delete from exchange_rates where rate_date between '2002-01-01' and '2002-12-31'`;
  await sql.end();
});

const customer = async (extra: Record<string, unknown> = {}) =>
  (await createCounterparty(db, ctx('ega'), { name: `Mijoz ${crypto.randomUUID().slice(0, 6)}`, roles: ['customer'], ...extra })).id;
const pay = (counterpartyId: string, amount: number, on: string, opts: { accountId?: string; saleId?: string } = {}) =>
  recordTransaction(db, ctx('ega'), { accountId: opts.accountId ?? uzsKassa, direction: 'in', amount, categoryId: incomeCat, occurredOn: on, counterpartyId, saleId: opts.saleId });

describe('tovarlar', () => {
  it('uch narx turi bilan; ro‘yxatda qidiruv; savdo menejeri tovar qo‘sha olmaydi', async () => {
    expect((await listProducts(db, ctx('savdo'), { q: 'suv' })).map((x) => x.name)).toEqual(['Suv 1,5 l']);
    await expect(createProduct(db, ctx('savdo'), { name: 'X', unit: 'dona', prices: {} })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createProduct(db, ctx('ega'), { name: 'Takror', unit: 'dona', sku: 'SUV-15', prices: {} })).rejects.toThrow(/SKU/);
    await expect(listProducts(db, ctx('hr'))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('sotuv hujjati (SAL-01, SAL-02)', () => {
  it('narx turidan narx olinadi, qo‘lda o‘zgartirish va chegirma; jami, raqam va to‘lov muddati', async () => {
    const cp = await customer({ paymentTermDays: 10 });
    const s = await createSale(db, ctx('ega'), {
      companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'wholesale',
      lines: [{ productId: p.suv!, qty: '100' }, { productId: p.shakar!, qty: '2.5', price: so(13_000), discountPct: 10 }],
    });
    // 100 × 4 000 + 2,5 × 13 000 × 0,9 = 400 000 + 29 250
    expect(s).toMatchObject({ status: 'posted', total: so(429_250), number: expect.stringMatching(/^S-\d{6}$/) });
    const doc = await getSale(db, ctx('ega'), s.id);
    expect(doc).toMatchObject({ dueDate: '2002-01-20', counterpartyId: cp, currency: 'UZS' });
    expect(doc.lines.map((l) => [l.qty, l.price, l.amount])).toEqual([['100', so(4_000), so(400_000)], ['2.5', so(13_000), so(29_250)]]);
    const next = await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '1' }] });
    expect(Number(next.number.slice(2))).toBe(Number(s.number.slice(2)) + 1);
    expect(next.total).toBe(so(5_000));
  });

  it('bo‘sh hujjat, noto‘g‘ri miqdor, narxi yo‘q tovar, mijoz bo‘lmagan kontragent rad etiladi', async () => {
    const cp = await customer();
    const base = { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'retail' as const };
    await expect(createSale(db, ctx('ega'), { ...base, lines: [] })).rejects.toThrow(/tovar/i);
    await expect(createSale(db, ctx('ega'), { ...base, lines: [{ productId: p.suv!, qty: '0' }] })).rejects.toThrow(/miqdor/i);
    await expect(createSale(db, ctx('ega'), { ...base, lines: [{ productId: p.shakar!, qty: '1' }], priceType: 'special' })).rejects.toThrow(/narx/i);
    const supplier = (await createCounterparty(db, ctx('ega'), { name: 'Faqat ta’minotchi', roles: ['supplier'] })).id;
    await expect(createSale(db, ctx('ega'), { ...base, counterpartyId: supplier, lines: [{ productId: p.suv!, qty: '1' }] })).rejects.toThrow(/mijoz/i);
  });

  it('savdo menejeri faqat o‘z mijoziga sotadi va faqat o‘z sotuvlarini ko‘radi', async () => {
    const mine = await customer({ managerUserId: u.savdo });
    const foreign = await customer({ managerUserId: u.savdo2 });
    const s = await createSale(db, ctx('savdo'), { companyId, counterpartyId: mine, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '3' }] });
    await expect(createSale(db, ctx('savdo'), { companyId, counterpartyId: foreign, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '3' }] }))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect((await listSales(db, ctx('savdo'))).map((x) => x.id)).toEqual([s.id]);
    await expect(getSale(db, ctx('savdo2'), s.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('bekor qilish — faqat ega, sabab bilan; hujjat o‘chirilmaydi va o‘zgartirilmaydi', async () => {
    const cp = await customer();
    const s = await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '2' }] });
    await expect(cancelSale(db, ctx('buxgalter'), s.id, 'Xato')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cancelSale(db, ctx('ega'), s.id, ' ')).rejects.toThrow(/sabab/i);
    await expect(withTenant(db, tenantId, (tx) => tx.update(schema.sales).set({ total: 1 }).where(eq(schema.sales.id, s.id))))
      .rejects.toMatchObject({ cause: { code: 'P0001' } });
    await expect(withTenant(db, tenantId, (tx) => tx.delete(schema.saleLines).where(eq(schema.saleLines.saleId, s.id))))
      .rejects.toMatchObject({ cause: { code: '42501' } });
    await cancelSale(db, ctx('ega'), s.id, 'Mijoz voz kechdi');
    expect((await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-10' })).receivable.totals).toEqual({});
  });
});

describe('qaytarish (SAL-05)', () => {
  it('sotilgandan ko‘p qaytarib bo‘lmaydi; qaytarish qarzni kamaytiradi', async () => {
    const cp = await customer();
    const s = await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '10' }] });
    const r = await createSaleReturn(db, ctx('ega'), s.id, { date: '2002-01-11', lines: [{ productId: p.suv!, qty: '4' }] });
    expect(r).toMatchObject({ total: so(20_000), number: expect.stringMatching(/^Q-\d{6}$/) });
    await expect(createSaleReturn(db, ctx('ega'), s.id, { date: '2002-01-12', lines: [{ productId: p.suv!, qty: '7' }] })).rejects.toThrow(/qaytar/i);
    await expect(createSaleReturn(db, ctx('ega'), s.id, { date: '2002-01-12', lines: [{ productId: p.shakar!, qty: '1' }] })).rejects.toThrow(/sotuvda yo‘q/i);
    const d = await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-12' });
    expect(d.receivable.totals).toEqual({ UZS: so(30_000) });
  });
});

describe('qarzlar: ko‘p valyuta va to‘lov taqsimoti', () => {
  it('dollardagi qarz so‘mda to‘lansa — to‘lov kunidagi kurs bilan dollarga o‘giriladi', async () => {
    const cp = await customer();
    await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'USD', priceType: 'retail', lines: [{ productId: p.suv!, qty: '1', price: 1_000_00 }] });
    await pay(cp, so(6_000_000), '2002-02-10'); // 12 000 kursida = 500 $
    const d = await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-02-10' });
    expect(d.receivable.totals).toEqual({ USD: 500_00 });
    expect(d.receivable.docs[0]).toMatchObject({ currency: 'USD', total: 1_000_00, paid: 500_00, remaining: 500_00 });
    expect(d.receivable.uzs).toBe(so(6_000_000)); // 500 $ × 12 000
  });

  it('hujjat tanlanmagan to‘lov eng eski hujjatni yopadi; tanlangani — o‘sha hujjatni; ortiqchasi avans', async () => {
    const cp = await customer();
    const s1 = await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '20' }] }); // 100 000
    const s2 = await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2002-01-11', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '10' }] }); // 50 000
    await pay(cp, so(50_000), '2002-01-12', { saleId: s2.id });
    await pay(cp, so(30_000), '2002-01-12');
    let d = await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-12' });
    expect(d.receivable.docs.map((x) => [x.number, x.remaining])).toEqual([[s1.number, so(70_000)], [s2.number, 0]]);
    await pay(cp, so(100_000), '2002-01-13');
    d = await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-13' });
    expect(d.receivable.totals).toEqual({});
    expect(d.receivable.advance).toEqual({ UZS: so(30_000) });
  });

  it('to‘lov muddati o‘tgan qarz belgilanadi', async () => {
    const cp = await customer({ paymentTermDays: 5 });
    await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '1' }] });
    expect((await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-15' })).receivable.docs[0]).toMatchObject({ overdue: false, overdueDays: 0 });
    expect((await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-20' })).receivable.docs[0]).toMatchObject({ overdue: true, overdueDays: 5 });
  });

  it('boshqa hujjatga to‘lov bog‘lab bo‘lmaydi (boshqa kontragentniki)', async () => {
    const a = await customer();
    const b = await customer();
    const s = await createSale(db, ctx('ega'), { companyId, counterpartyId: a, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '1' }] });
    await expect(pay(b, so(1), '2002-01-10', { saleId: s.id })).rejects.toThrow(/hujjat/i);
  });
});

describe('kredit limiti (CP-05)', () => {
  it('limitdan oshgan sotuv ega tasdig‘ini kutadi, qarzga kirmaydi; tasdiqlangach kuchga kiradi', async () => {
    const cp = await customer({ creditLimit: so(100_000), managerUserId: u.savdo });
    await createSale(db, ctx('savdo'), { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '16' }] }); // 80 000
    const big = await createSale(db, ctx('savdo'), { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '10' }] }); // +50 000 > 100 000
    expect(big.status).toBe('pending');
    expect((await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-10' })).receivable.totals).toEqual({ UZS: so(80_000) });
    const notes = await withTenant(db, tenantId, (tx) => tx.select().from(schema.notifications)
      .where(and(eq(schema.notifications.userId, u.ega!), eq(schema.notifications.kind, 'sale_over_limit'))));
    expect(notes).toHaveLength(1);
    await expect(approveSale(db, ctx('savdo'), big.id)).rejects.toBeInstanceOf(ForbiddenError);
    await approveSale(db, ctx('ega'), big.id);
    expect((await getSale(db, ctx('ega'), big.id)).status).toBe('posted');
    expect((await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-10' })).receivable.totals).toEqual({ UZS: so(130_000) });
  });
});

describe('xarid (PUR-01, PUR-05) va bizning qarz', () => {
  it('xarid ta’minotchidan; to‘lovimiz qarzni kamaytiradi; «kimdan qancha oldik» hisoboti', async () => {
    const sup = (await createCounterparty(db, ctx('ega'), { name: 'Toza Suv', roles: ['supplier'], paymentTermDays: 7 })).id;
    const sup2 = (await createCounterparty(db, ctx('ega'), { name: 'Agro Trade', roles: ['supplier'] })).id;
    const x = await createPurchase(db, ctx('buxgalter'), { companyId, counterpartyId: sup, date: '2002-01-10', currency: 'UZS', lines: [{ productId: p.suv!, qty: '1000', price: so(3_000) }] });
    expect(x).toMatchObject({ total: so(3_000_000), number: expect.stringMatching(/^X-\d{6}$/) });
    await createPurchase(db, ctx('buxgalter'), { companyId, counterpartyId: sup2, date: '2002-01-15', currency: 'USD', lines: [{ productId: p.shakar!, qty: '100', price: 80 }] }); // 80 $
    await createPurchase(db, ctx('buxgalter'), { companyId, counterpartyId: sup, date: '2002-03-01', currency: 'UZS', lines: [{ productId: p.suv!, qty: '10', price: so(3_000) }] });
    await expect(createPurchase(db, ctx('savdo'), { companyId, counterpartyId: sup, date: '2002-01-10', currency: 'UZS', lines: [{ productId: p.suv!, qty: '1', price: 1 }] }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(createPurchase(db, ctx('ega'), { companyId, counterpartyId: await customer(), date: '2002-01-10', currency: 'UZS', lines: [{ productId: p.suv!, qty: '1', price: 1 }] }))
      .rejects.toThrow(/ta’minotchi/i);

    await recordTransaction(db, ctx('ega'), { accountId: uzsKassa, direction: 'out', amount: so(1_000_000), categoryId: expenseCat, occurredOn: '2002-01-20', counterpartyId: sup });
    const d = await counterpartyDebts(db, ctx('ega'), sup, { on: '2002-01-31' });
    expect(d.payable.totals).toEqual({ UZS: so(2_000_000) });
    expect(d.payable.docs[0]).toMatchObject({ overdue: true, dueDate: '2002-01-17' });

    const bySupplier = await purchaseReport(db, ctx('buxgalter'), { from: '2002-01-01', to: '2002-01-31', by: 'supplier' });
    expect(bySupplier.map((r) => [r.name, r.currency, r.total])).toEqual([['Agro Trade', 'USD', 80_00], ['Toza Suv', 'UZS', so(3_000_000)]]);
    const byProduct = await purchaseReport(db, ctx('buxgalter'), { from: '2002-01-01', to: '2002-12-31', by: 'product' });
    expect(byProduct.find((r) => r.name === 'Suv 1,5 l')).toMatchObject({ currency: 'UZS', qty: '1010', total: so(3_030_000) });

    await cancelPurchase(db, ctx('ega'), x.id, 'Qaytarib yuborildi');
    expect((await counterpartyDebts(db, ctx('ega'), sup, { on: '2002-01-31' })).payable.advance).toEqual({ UZS: so(1_000_000) });
  });
});

describe('boshlang‘ich qarzlar (CP-10)', () => {
  it('qo‘lda: bizga qarz va biz qarzdormiz; qarzlarga qo‘shiladi', async () => {
    const cp = (await createCounterparty(db, ctx('ega'), { name: 'Eski hamkor', roles: ['customer', 'supplier'] })).id;
    await recordOpeningDebt(db, ctx('buxgalter'), { counterpartyId: cp, side: 'receivable', amount: 300_00, currency: 'USD', date: '2002-01-01' });
    await recordOpeningDebt(db, ctx('buxgalter'), { counterpartyId: cp, side: 'payable', amount: so(2_000_000), currency: 'UZS', date: '2002-01-01' });
    const d = await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-10' });
    expect(d.receivable.totals).toEqual({ USD: 300_00 });
    expect(d.payable.totals).toEqual({ UZS: so(2_000_000) });
    expect(d.receivable.docs[0]!.number).toMatch(/^B-\d{6}$/);
  });

  it('Excel import: STIR yoki nom bo‘yicha topiladi; xato bo‘lsa hech narsa yozilmaydi', async () => {
    const cp = (await createCounterparty(db, ctx('ega'), { name: 'Import hamkor', roles: ['customer'], stir: '511000111' })).id;
    const fill = async (rows: (string | number | null)[][]) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await buildOpeningDebtTemplate());
      rows.forEach((r) => wb.getWorksheet('Qarzlar')!.addRow(r));
      return Buffer.from(await wb.xlsx.writeBuffer());
    };
    // Kontragent (nomi yoki STIR), Kim qarzdor, Summa, Valyuta, Sana, To'lov muddati
    const bad = await importOpeningDebts(db, ctx('buxgalter'), await fill([
      ['511000111', 'mijoz', 1_500_000, 'UZS', '01.01.2002', null],
      ['Yo‘q hamkor', 'mijoz', 10, 'UZS', '01.01.2002', null],
      ['Import hamkor', 'kim', 10, 'GBP', '01.01.2002', null],
    ]));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.map((e) => [e.row, e.column])).toEqual([[3, 'Kontragent*'], [4, 'Kim qarzdor*'], [4, 'Valyuta*']]);
    expect((await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-10' })).receivable.totals).toEqual({});

    const ok = await importOpeningDebts(db, ctx('buxgalter'), await fill([
      ['511000111', 'mijoz', 1_500_000, 'UZS', '01.01.2002', '15.01.2002'],
      ['Import hamkor', 'biz', 200, 'USD', '01.01.2002', null],
    ]));
    expect(ok).toEqual({ ok: true, imported: 2 });
    const d = await counterpartyDebts(db, ctx('ega'), cp, { on: '2002-01-10' });
    expect(d.receivable.totals).toEqual({ UZS: so(1_500_000) });
    expect(d.payable.totals).toEqual({ USD: 200_00 });
  });
});

describe('izolyatsiya', () => {
  it('boshqa tenant sotuvi ko‘rinmaydi', async () => {
    const cp = await customer();
    const s = await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2002-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: p.suv!, qty: '1' }] });
    const other = await withTenant(db, otherTenantId, (tx) => createUser(tx, { fullName: 'Boshqa', roles: ['Ega'] }));
    await expect(getSale(db, { tenantId: otherTenantId, userId: other.id }, s.id)).rejects.toThrow(/topilmadi/i);
    expect(await listSales(db, { tenantId: otherTenantId, userId: other.id })).toEqual([]);
  });
});
