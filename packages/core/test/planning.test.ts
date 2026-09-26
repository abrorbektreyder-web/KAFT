// R1, 10-hafta: to'lov kalendari (FIN-06), kassa uzilishi prognozi (FIN-07), kunlik kassa yopish (FIN-08),
// boshqaruv foyda-zarar (FIN-10). Egasi qarorlari (2026-09-26): muddati o'tgan mijoz qarzi prognozga kirmaydi (alohida);
// tannarx — sotuv sanasigacha bo'lgan xaridlarning o'rtacha narxi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, createDb, eq, schema, withTenant } from '@kaft/db';
import {
  cashForecast, closeCashDay, createCashAccount, createCounterparty, createProduct, createPurchase, createSale, createSaleReturn,
  createScheduledPayment, createTenant, createUser, FakeTelegram, ForbiddenError, listCategories, listClosings, loadCbuRates,
  occurrences, paymentCalendar, profitAndLoss, recordTransaction, runDailyJobs,
} from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
const so = (n: number) => n * 100;
const u: Record<string, string> = {};
let companyId: string;

type Fixture = { tenantId: string; companyId: string; ega: string; buxgalter: string; kassir: string; direktor: string };

async function newTenant(name: string) {
  const t = await createTenant(db, { name, slug: `plan-${crypto.randomUUID()}` });
  const ids = await withTenant(db, t.id, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId: t.id, name: 'Savdo Markaz' }).returning();
    const out: Record<string, string> = { companyId: c!.id };
    for (const [k, role] of [['ega', 'Ega'], ['buxgalter', 'Buxgalter'], ['kassir', 'Kassir'], ['direktor', 'Direktor']] as const) {
      out[k] = (await createUser(tx, { fullName: k, roles: [role] })).id;
    }
    return out;
  });
  return { tenantId: t.id, ...ids } as Fixture;
}

let T: Fixture;
const ctx = (k: keyof Fixture) => ({ tenantId: T.tenantId, userId: T[k] });
const tenants: string[] = [];

beforeAll(async () => {
  T = await newTenant('Reja test');
  tenants.push(T.tenantId);
  companyId = T.companyId;
  Object.assign(u, T);
  // Umumiy kurslar — boshqa testlarga tegmaydigan sana (2003-yil)
  await loadCbuRates(db, { on: '2003-01-02', fetch: async () => new Response(JSON.stringify([{ Ccy: 'USD', Rate: '10000', Nominal: '1', Date: '02.01.2003' }])) });
});

afterAll(async () => {
  for (const id of tenants) await sql`delete from tenants where id = ${id}`;
  await sql`delete from exchange_rates where rate_date between '2003-01-01' and '2003-12-31'`;
  await sql.end();
});

describe('takrorlanuvchi to‘lovlar (sof mantiq)', () => {
  it('har oy — oy oxiridan oshsa oxirgi kunga; har hafta; bir martalik; tugash sanasi', () => {
    expect(occurrences({ startsOn: '2003-01-31', repeat: 'monthly', endsOn: null }, '2003-01-01', '2003-04-30'))
      .toEqual(['2003-01-31', '2003-02-28', '2003-03-31', '2003-04-30']);
    expect(occurrences({ startsOn: '2003-01-06', repeat: 'weekly', endsOn: '2003-01-27' }, '2003-01-10', '2003-02-28'))
      .toEqual(['2003-01-13', '2003-01-20', '2003-01-27']);
    expect(occurrences({ startsOn: '2003-01-15', repeat: 'once', endsOn: null }, '2003-01-01', '2003-01-31')).toEqual(['2003-01-15']);
    expect(occurrences({ startsOn: '2003-01-15', repeat: 'once', endsOn: null }, '2003-01-16', '2003-01-31')).toEqual([]);
  });
});

describe('to‘lov kalendari va kassa uzilishi prognozi (FIN-06, FIN-07)', () => {
  it('kirim — mijoz qarzi muddatida; chiqim — ta’minotchi qarzi va takroriy to‘lovlar; manfiy kun — qizil bayroq', async () => {
    const X = await newTenant('Prognoz');
    tenants.push(X.tenantId);
    const c = { tenantId: X.tenantId, userId: X.ega };
    await createCashAccount(db, c, { companyId: X.companyId, name: 'Bank', type: 'bank', currency: 'UZS', openingBalance: so(10_000_000), openingOn: '2003-01-01' });
    const prod = (await createProduct(db, c, { name: 'Tovar', unit: 'dona', prices: { retail: so(1_000) } })).id;
    const customer = (await createCounterparty(db, c, { name: 'Mijoz', roles: ['customer'] })).id;
    const late = (await createCounterparty(db, c, { name: 'Kechikkan', roles: ['customer'] })).id;
    const supplier = (await createCounterparty(db, c, { name: 'Ta’minotchi', roles: ['supplier'] })).id;
    // Mijoz 4 mln — 12-yanvarda; kechikkan mijoz 2 mln — muddati 1-yanvarda o'tgan; ta'minotchiga 5 mln — 10-yanvarda; dollar: 100 $ — 8-yanvarda
    await createSale(db, c, { companyId: X.companyId, counterpartyId: customer, date: '2003-01-02', dueDate: '2003-01-12', currency: 'UZS', priceType: 'retail', lines: [{ productId: prod, qty: '4000' }] });
    await createSale(db, c, { companyId: X.companyId, counterpartyId: customer, date: '2003-01-02', dueDate: '2003-01-08', currency: 'USD', priceType: 'retail', lines: [{ productId: prod, qty: '1', price: 100_00 }] });
    await createSale(db, c, { companyId: X.companyId, counterpartyId: late, date: '2002-12-20', dueDate: '2003-01-01', currency: 'UZS', priceType: 'retail', lines: [{ productId: prod, qty: '2000' }] });
    await createPurchase(db, c, { companyId: X.companyId, counterpartyId: supplier, date: '2003-01-02', dueDate: '2003-01-10', currency: 'UZS', lines: [{ productId: prod, qty: '1', price: so(5_000_000) }] });
    const rentCat = (await listCategories(db, c, 'out')).find((x) => x.name === 'Ijara')!.id;
    await createScheduledPayment(db, c, { name: 'Do‘kon ijarasi', direction: 'out', amount: so(8_000_000), currency: 'UZS', categoryId: rentCat, startsOn: '2003-01-05', repeat: 'monthly', companyId: X.companyId });
    await expect(createScheduledPayment(db, { tenantId: X.tenantId, userId: X.kassir }, { name: 'X', direction: 'out', amount: 1, currency: 'UZS', startsOn: '2003-01-05', repeat: 'once' }))
      .rejects.toBeInstanceOf(ForbiddenError);

    const cal = await paymentCalendar(db, c, { from: '2003-01-03', to: '2003-02-01' });
    expect(cal.items.map((i) => [i.date, i.direction, i.source, i.uzs])).toEqual([
      ['2003-01-05', 'out', 'scheduled', so(8_000_000)],
      ['2003-01-08', 'in', 'receivable', so(1_000_000)],
      ['2003-01-10', 'out', 'payable', so(5_000_000)],
      ['2003-01-12', 'in', 'receivable', so(4_000_000)],
    ]);
    expect(cal.overdueReceivable).toMatchObject({ uzs: so(2_000_000), docs: 1 });

    const f = await cashForecast(db, c, { on: '2003-01-03', days: 30 });
    expect(f.start).toBe(so(10_000_000));
    expect(f.days).toHaveLength(30);
    const day = (d: string) => f.days.find((x) => x.date === d)!;
    expect(day('2003-01-05').balance).toBe(so(2_000_000));
    expect(day('2003-01-08').balance).toBe(so(3_000_000));
    expect(day('2003-01-10')).toMatchObject({ outflow: so(5_000_000), balance: so(-2_000_000) });
    expect(day('2003-01-12').balance).toBe(so(2_000_000));
    expect(f.firstNegative).toBe('2003-01-10');
    expect(f.overdueReceivableUzs).toBe(so(2_000_000));

    // Kunlik ish: egaga bir marta xabar (qayta ishga tushirish takrorlamaydi)
    await runDailyJobs(db, { telegram: new FakeTelegram(), on: '2003-01-03', tenantIds: [X.tenantId] });
    await runDailyJobs(db, { telegram: new FakeTelegram(), on: '2003-01-03', tenantIds: [X.tenantId] });
    const notes = await withTenant(db, X.tenantId, (tx) => tx.select().from(schema.notifications)
      .where(and(eq(schema.notifications.userId, X.ega!), eq(schema.notifications.kind, 'cash_gap'))));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.body).toContain('10.01.2003');

    await expect(cashForecast(db, { tenantId: X.tenantId, userId: X.kassir }, { on: '2003-01-03' })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await cashForecast(db, { tenantId: X.tenantId, userId: X.direktor }, { on: '2003-01-03' })).firstNegative).toBe('2003-01-10');
  }, 240_000);
});

describe('kunlik kassa yopish (FIN-08)', () => {
  it('kassir o‘z kassasini yopadi; farq bo‘lsa egaga xabar; kuniga bir marta; yozuv o‘zgarmaydi', async () => {
    const mine = await createCashAccount(db, ctx('ega'), { companyId, name: 'Kassa 1', type: 'cash', currency: 'UZS', responsibleUserId: u.kassir, openingBalance: so(500_000), openingOn: '2003-01-02' });
    const other = await createCashAccount(db, ctx('ega'), { companyId, name: 'Kassa 2', type: 'cash', currency: 'UZS' });
    const inc = (await listCategories(db, ctx('ega'), 'in'))[0]!.id;
    await recordTransaction(db, ctx('kassir'), { accountId: mine.id, direction: 'in', amount: so(300_000), categoryId: inc, occurredOn: '2003-01-03' });

    expect(await closeCashDay(db, ctx('kassir'), { accountId: mine.id, date: '2003-01-03', counted: so(800_000) })).toMatchObject({ system: so(800_000), diff: 0 });
    await expect(closeCashDay(db, ctx('kassir'), { accountId: mine.id, date: '2003-01-03', counted: so(800_000) })).rejects.toThrow(/yopilgan/i);
    const res = await closeCashDay(db, ctx('kassir'), { accountId: mine.id, date: '2003-01-04', counted: so(750_000), note: 'Qaytim xato' });
    expect(res).toMatchObject({ system: so(800_000), diff: so(-50_000) });
    const notes = await withTenant(db, T.tenantId, (tx) => tx.select().from(schema.notifications)
      .where(and(eq(schema.notifications.userId, u.ega!), eq(schema.notifications.kind, 'cash_diff'))));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.body).toContain('Kassa 1');

    await expect(closeCashDay(db, ctx('kassir'), { accountId: other.id, date: '2003-01-03', counted: 0 })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listClosings(db, ctx('kassir'))).map((x) => [x.date, x.diff])).toEqual([['2003-01-04', so(-50_000)], ['2003-01-03', 0]]);
    await expect(withTenant(db, T.tenantId, (tx) => tx.update(schema.cashClosings).set({ counted: 1 }).where(eq(schema.cashClosings.accountId, mine.id))))
      .rejects.toMatchObject({ cause: { code: '42501' } });
  });
});

describe('boshqaruv foyda-zarar (FIN-10)', () => {
  it('tushum − tannarx (o‘rtacha xarid narxi) − xarajatlar; «Tovar xaridi» xarajatga kirmaydi; qaytarish ayriladi', async () => {
    const X = await newTenant('Foyda');
    tenants.push(X.tenantId);
    const c = { tenantId: X.tenantId, userId: X.ega };
    const acc = await createCashAccount(db, c, { companyId: X.companyId, name: 'Bank', type: 'bank', currency: 'UZS' });
    const a = (await createProduct(db, c, { name: 'A', unit: 'dona', prices: { retail: so(5_000) } })).id;
    const b = (await createProduct(db, c, { name: 'B', unit: 'dona', prices: { retail: so(2_000) } })).id;
    const cust = (await createCounterparty(db, c, { name: 'Mijoz', roles: ['customer'] })).id;
    const sup = (await createCounterparty(db, c, { name: 'Ta’minotchi', roles: ['supplier'] })).id;
    await createPurchase(db, c, { companyId: X.companyId, counterpartyId: sup, date: '2003-01-02', currency: 'UZS', lines: [{ productId: a, qty: '100', price: so(3_000) }] });
    await createPurchase(db, c, { companyId: X.companyId, counterpartyId: sup, date: '2003-01-03', currency: 'UZS', lines: [{ productId: a, qty: '100', price: so(4_000) }] });
    // A: 10 × 5 000 (tannarx 3 500); B: xaridi yo'q — tannarx noma'lum; dollar: A 1 × 1 $ (10 000 so'm)
    const s = await createSale(db, c, { companyId: X.companyId, counterpartyId: cust, date: '2003-01-10', currency: 'UZS', priceType: 'retail', lines: [{ productId: a, qty: '10' }, { productId: b, qty: '5' }] });
    await createSale(db, c, { companyId: X.companyId, counterpartyId: cust, date: '2003-01-11', currency: 'USD', priceType: 'retail', lines: [{ productId: a, qty: '1', price: 1_00 }] });
    await createSaleReturn(db, c, s.id, { date: '2003-01-12', lines: [{ productId: a, qty: '2' }] });
    const cats = await listCategories(db, c, 'out');
    const cat = (n: string) => cats.find((x) => x.name === n)!.id;
    await recordTransaction(db, c, { accountId: acc.id, direction: 'out', amount: so(10_000), categoryId: cat('Ijara'), occurredOn: '2003-01-15' });
    await recordTransaction(db, c, { accountId: acc.id, direction: 'out', amount: so(700_000), categoryId: cat('Tovar xaridi'), occurredOn: '2003-01-15', counterpartyId: sup });
    await recordTransaction(db, c, { accountId: acc.id, direction: 'out', amount: so(1_000), categoryId: cat('Transport'), occurredOn: '2003-02-01' });

    const pl = await profitAndLoss(db, c, { from: '2003-01-01', to: '2003-01-31' });
    // Tushum: 50 000 + 10 000 (B) + 10 000 ($) − 10 000 (qaytarish) = 60 000
    // Tannarx: 10×3 500 + 1×3 500 − 2×3 500 = 31 500 (B — noma'lum)
    expect(pl.totals).toMatchObject({ revenue: so(60_000), cogs: so(31_500), gross: so(28_500), expenses: so(10_000), net: so(18_500), cogsUnknownLines: 1 });
    expect(pl.expenses).toEqual([{ categoryId: cat('Ijara'), name: 'Ijara', nameRu: 'Аренда', amount: so(10_000) }]);
    expect(pl.months.map((m) => m.month)).toEqual(['2003-01']);

    await expect(profitAndLoss(db, { tenantId: X.tenantId, userId: X.kassir }, { from: '2003-01-01', to: '2003-01-31' })).rejects.toBeInstanceOf(ForbiddenError);
  }, 240_000);
});
