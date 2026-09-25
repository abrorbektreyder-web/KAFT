// FIN-01…05 (R1, 7-hafta): kassalar, kirim/chiqim, o'tkazma va ayirboshlash, Markaziy bank kursi, pul qoldig'i.
// Summalar tiyin/sentda (butun son). Qoldiq saqlanmaydi — hujjatlardan hisoblanadi (PRD 9.1).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, eq, schema, withTenant } from '@kaft/db';
import {
  balances, cancelTransaction, createCashAccount, createCategory, createTenant, createUser, finAccess, ForbiddenError,
  listCategories, listTransactions, loadCbuRates, rateOn, recordTransaction, transfer,
} from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
let otherTenantId: string;
let companyA: string;
let companyB: string;
const u: Record<string, string> = {};
const cat: Record<string, string> = {};

// Umumiy kurslar jadvali boshqa testlar bilan to'qnashmasligi uchun o'tmishdagi sanalar
const RATE_DAY = '2001-03-01';
const cbu = (date: string, rows: [string, string, string][]) =>
  async () => new Response(JSON.stringify(rows.map(([Ccy, Rate, Nominal]) => ({ Ccy, Rate, Nominal, Date: date }))));

const so = (n: number) => n * 100; // so'm → tiyin
const ctx = (k: string) => ({ tenantId, userId: u[k]! });

beforeAll(async () => {
  const t = await createTenant(db, { name: 'Pul test', slug: `pul-${crypto.randomUUID()}` });
  tenantId = t.id;
  otherTenantId = (await createTenant(db, { name: 'Boshqa', slug: `pul2-${crypto.randomUUID()}` })).id;
  await withTenant(db, tenantId, async (tx) => {
    const cs = await tx.insert(schema.companies).values([{ tenantId, name: 'Savdo Markaz' }, { tenantId, name: 'Distribyutor Plus' }]).returning();
    companyA = cs[0]!.id;
    companyB = cs[1]!.id;
    for (const [k, role] of [['ega', 'Ega'], ['direktor', 'Direktor'], ['buxgalter', 'Buxgalter'], ['kassir', 'Kassir'], ['kassir2', 'Kassir'], ['hr', 'HR menejer']] as const) {
      u[k] = (await createUser(tx, { fullName: k, roles: [role] })).id;
    }
  });
  await loadCbuRates(db, { on: RATE_DAY, fetch: cbu('01.03.2001', [['USD', '12500.00', '1'], ['EUR', '13500.50', '1'], ['RUB', '1400.00', '10']]) });
  const cats = await listCategories(db, ctx('ega'));
  for (const c of cats) cat[c.name] = c.id;
});

afterAll(async () => {
  await sql`delete from tenants where id in (${tenantId}, ${otherTenantId})`;
  await sql`delete from exchange_rates where rate_date < '2002-01-01'`;
  await sql.end();
});

describe('xarajat moddalari', () => {
  it('yangi tenantda standart kirim va chiqim moddalari bor, ruscha nomi bilan', async () => {
    const cats = await listCategories(db, ctx('ega'));
    expect(cats).toContainEqual(expect.objectContaining({ name: 'Ijara', nameRu: 'Аренда', direction: 'out' }));
    expect(cats).toContainEqual(expect.objectContaining({ name: 'Sotuvdan tushum', direction: 'in' }));
  });

  it('ega o‘z moddasini qo‘shadi, kassir qo‘sha olmaydi', async () => {
    const c = await createCategory(db, ctx('ega'), { name: 'Qadoqlash', nameRu: 'Упаковка', direction: 'out' });
    expect(c.id).toBeTruthy();
    await expect(createCategory(db, ctx('kassir'), { name: 'Boshqa narsa', direction: 'out' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('kassalar va kirim/chiqim (FIN-01, FIN-02)', () => {
  it('kassa ochiladi: boshlang‘ich qoldiq bilan; kassir kassa ocha olmaydi', async () => {
    const acc = await createCashAccount(db, ctx('ega'), {
      companyId: companyA, name: 'Asosiy kassa', type: 'cash', currency: 'UZS', responsibleUserId: u.kassir, openingBalance: so(5_000_000), openingOn: '2001-02-01',
    });
    const b = await balances(db, ctx('ega'), { on: RATE_DAY });
    expect(b.accounts.find((a) => a.id === acc.id)).toMatchObject({ balance: so(5_000_000), currency: 'UZS', type: 'cash' });
    await expect(createCashAccount(db, ctx('kassir'), { companyId: companyA, name: 'X', type: 'cash', currency: 'UZS' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('noma’lum valyuta va noto‘g‘ri summa rad etiladi', async () => {
    await expect(createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Y', type: 'cash', currency: 'GBP' })).rejects.toThrow(/valyuta/i);
    const acc = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Summa test', type: 'bank', currency: 'UZS' });
    for (const amount of [0, -100, 10.5]) {
      await expect(recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'in', amount, categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-10' }))
        .rejects.toThrow(/summa/i);
    }
  });

  it('kirim va chiqim qoldiqni o‘zgartiradi; modda yo‘nalishi mos bo‘lishi shart', async () => {
    const acc = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Bank UZS', type: 'bank', currency: 'UZS' });
    await recordTransaction(db, ctx('buxgalter'), { accountId: acc.id, direction: 'in', amount: so(2_000_000), categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-10', basis: 'Chek №12' });
    await recordTransaction(db, ctx('buxgalter'), { accountId: acc.id, direction: 'out', amount: so(700_000), categoryId: cat.Ijara!, occurredOn: '2001-02-11' });
    await expect(recordTransaction(db, ctx('buxgalter'), { accountId: acc.id, direction: 'out', amount: so(1), categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-11' }))
      .rejects.toThrow(/modda/i);

    const b = await balances(db, ctx('ega'), { on: RATE_DAY });
    expect(b.accounts.find((a) => a.id === acc.id)?.balance).toBe(so(1_300_000));
    // Sanagacha bo'lgan qoldiq: 10-fevral holatida chiqim hali yo'q
    const early = await balances(db, ctx('ega'), { on: '2001-02-10' });
    expect(early.accounts.find((a) => a.id === acc.id)?.balance).toBe(so(2_000_000));
  });

  it('valyutali operatsiyada kurs: standart — Markaziy bank, qo‘lda o‘zgartirsa shunisi saqlanadi', async () => {
    const acc = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Dollar kassa', type: 'cash', currency: 'USD' });
    const a = await recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'in', amount: 100_00, categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-03-01' });
    const b = await recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'in', amount: 50_00, categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-03-01', rate: '12600' });
    const rows = await withTenant(db, tenantId, (tx) => tx.select({ id: schema.cashTransactions.id, rate: schema.cashTransactions.rate }).from(schema.cashTransactions));
    expect(Number(rows.find((r) => r.id === a.id)!.rate)).toBe(12500);
    expect(Number(rows.find((r) => r.id === b.id)!.rate)).toBe(12600);
  });
});

describe('o‘tkazma va ayirboshlash', () => {
  it('kassalararo o‘tkazma: bir kassadan chiqadi, boshqasiga kiradi, jami o‘zgarmaydi', async () => {
    const from = await createCashAccount(db, ctx('ega'), { companyId: companyB, name: 'B kassa', type: 'cash', currency: 'UZS', openingBalance: so(1_000_000), openingOn: '2001-02-01' });
    const to = await createCashAccount(db, ctx('ega'), { companyId: companyB, name: 'B bank', type: 'bank', currency: 'UZS' });
    const before = await balances(db, ctx('ega'), { on: RATE_DAY, companyId: companyB });
    await transfer(db, ctx('ega'), { fromAccountId: from.id, toAccountId: to.id, amount: so(400_000), occurredOn: '2001-02-15', note: 'Inkassatsiya' });
    const after = await balances(db, ctx('ega'), { on: RATE_DAY, companyId: companyB });
    expect(after.accounts.find((a) => a.id === from.id)?.balance).toBe(so(600_000));
    expect(after.accounts.find((a) => a.id === to.id)?.balance).toBe(so(400_000));
    expect(after.total.uzs).toBe(before.total.uzs);
  });

  it('valyuta ayirboshlash: dollar sotildi — so‘m kassaga kirdi, summa yo‘qolmaydi', async () => {
    const usd = await createCashAccount(db, ctx('ega'), { companyId: companyB, name: 'B dollar', type: 'cash', currency: 'USD', openingBalance: 1_000_00, openingOn: '2001-02-01' });
    const uzs = await createCashAccount(db, ctx('ega'), { companyId: companyB, name: 'B so‘m', type: 'cash', currency: 'UZS' });
    await expect(transfer(db, ctx('ega'), { fromAccountId: usd.id, toAccountId: uzs.id, amount: 200_00, occurredOn: '2001-03-01' })).rejects.toThrow(/kiruvchi summa/i);

    const before = await balances(db, ctx('ega'), { on: RATE_DAY, companyId: companyB });
    await transfer(db, ctx('ega'), { fromAccountId: usd.id, toAccountId: uzs.id, amount: 200_00, toAmount: so(2_500_000), occurredOn: '2001-03-01' });
    const after = await balances(db, ctx('ega'), { on: RATE_DAY, companyId: companyB });
    expect(after.accounts.find((a) => a.id === usd.id)?.balance).toBe(800_00);
    expect(after.accounts.find((a) => a.id === uzs.id)?.balance).toBe(so(2_500_000));
    // Markaziy bank kursida ayirboshlangan — so'm ekvivalentidagi jami o'zgarmaydi
    expect(after.total.uzs).toBe(before.total.uzs);
  });

  it('o‘tkazmani bekor qilsa ikkala tomoni ham bekor bo‘ladi', async () => {
    const from = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'O‘tkazma A', type: 'cash', currency: 'UZS', openingBalance: so(100_000), openingOn: '2001-02-01' });
    const to = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'O‘tkazma B', type: 'cash', currency: 'UZS' });
    const t = await transfer(db, ctx('ega'), { fromAccountId: from.id, toAccountId: to.id, amount: so(30_000), occurredOn: '2001-02-20' });
    await cancelTransaction(db, ctx('ega'), t.outId, 'Xato kassa tanlangan');
    const b = await balances(db, ctx('ega'), { on: RATE_DAY });
    expect(b.accounts.find((a) => a.id === from.id)?.balance).toBe(so(100_000));
    expect(b.accounts.find((a) => a.id === to.id)?.balance).toBe(0);
  });
});

describe('bekor qilish (CORE-07)', () => {
  it('bekor qilingan hujjat qoldiqqa kirmaydi; sabab majburiy; yozuv o‘chmaydi', async () => {
    const acc = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Bekor kassa', type: 'cash', currency: 'UZS' });
    const tr = await recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'in', amount: so(90_000), categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-12' });
    await expect(cancelTransaction(db, ctx('ega'), tr.id, ' ')).rejects.toThrow(/sabab/i);
    await cancelTransaction(db, ctx('ega'), tr.id, 'Ikki marta kiritilgan');
    await expect(cancelTransaction(db, ctx('ega'), tr.id, 'Yana')).rejects.toThrow(/allaqachon/i);

    const b = await balances(db, ctx('ega'), { on: RATE_DAY });
    expect(b.accounts.find((a) => a.id === acc.id)?.balance).toBe(0);
    const [row] = await withTenant(db, tenantId, (tx) => tx.select().from(schema.cashTransactions).where(eq(schema.cashTransactions.id, tr.id)));
    expect(row).toMatchObject({ cancelReason: 'Ikki marta kiritilgan' });
  });

  it('ilova pul hujjatini o‘chira ham, summasini o‘zgartira ham olmaydi', async () => {
    const acc = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Himoya kassa', type: 'cash', currency: 'UZS' });
    const tr = await recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'in', amount: so(10), categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-12' });
    await expect(withTenant(db, tenantId, (tx) => tx.delete(schema.cashTransactions).where(eq(schema.cashTransactions.id, tr.id))))
      .rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(withTenant(db, tenantId, (tx) => tx.update(schema.cashTransactions).set({ amount: so(1_000_000) }).where(eq(schema.cashTransactions.id, tr.id))))
      .rejects.toMatchObject({ cause: { code: 'P0001' } });
  });

  it('buxgalter kirita oladi, lekin bekor qila olmaydi (PRD 8: Y)', async () => {
    const acc = await createCashAccount(db, ctx('buxgalter'), { companyId: companyA, name: 'Buxgalter bank', type: 'bank', currency: 'UZS' });
    const tr = await recordTransaction(db, ctx('buxgalter'), { accountId: acc.id, direction: 'in', amount: so(5), categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-12' });
    await expect(cancelTransaction(db, ctx('buxgalter'), tr.id, 'Sabab')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('ruxsatlar va izolyatsiya', () => {
  it('kassir faqat o‘z kassasini ko‘radi va faqat unga yozadi', async () => {
    const mine = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Kassir2 kassasi', type: 'cash', currency: 'UZS', responsibleUserId: u.kassir2 });
    const notMine = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Boshqa kassa', type: 'cash', currency: 'UZS' });

    const b = await balances(db, ctx('kassir2'), { on: RATE_DAY });
    expect(b.accounts.map((a) => a.id)).toEqual([mine.id]);
    await recordTransaction(db, ctx('kassir2'), { accountId: mine.id, direction: 'in', amount: so(1), categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-12' });
    await expect(recordTransaction(db, ctx('kassir2'), { accountId: notMine.id, direction: 'in', amount: so(1), categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-12' }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(transfer(db, ctx('kassir2'), { fromAccountId: notMine.id, toAccountId: mine.id, amount: so(1), occurredOn: '2001-02-12' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('operatsiyalar ro‘yxati: yangisi tepada, modda bilan; kassir faqat o‘z kassasinikini ko‘radi', async () => {
    const mine = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Ro‘yxat kassa', type: 'cash', currency: 'UZS', responsibleUserId: u.kassir });
    await recordTransaction(db, ctx('kassir'), { accountId: mine.id, direction: 'in', amount: so(11), categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-13' });
    await recordTransaction(db, ctx('kassir'), { accountId: mine.id, direction: 'out', amount: so(3), categoryId: cat.Transport!, occurredOn: '2001-02-14', note: 'Taksi' });
    const list = await listTransactions(db, ctx('kassir'));
    const own = new Set((await balances(db, ctx('kassir'), { on: RATE_DAY })).accounts.map((a) => a.id));
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((t) => own.has(t.accountId))).toBe(true);
    expect(list.every((t) => t.accountName)).toBe(true);
    expect(list[0]).toMatchObject({ direction: 'out', amount: so(3), categoryName: 'Transport', categoryNameRu: 'Транспорт', note: 'Taksi' });
    const all = await listTransactions(db, ctx('ega'), { limit: 500 });
    expect(all.length).toBeGreaterThan(list.length);
  });

  it('ruxsatlar xulosasi: kassir — o‘ziniki, ega — hammasi va bekor qilish, HR — yo‘q', async () => {
    expect(await finAccess(db, ctx('kassir'))).toEqual({ view: 'own', create: 'own', cancel: null, manage: false });
    expect(await finAccess(db, ctx('ega'))).toEqual({ view: 'all', create: 'all', cancel: 'all', manage: true });
    expect(await finAccess(db, ctx('hr'))).toEqual({ view: null, create: null, cancel: null, manage: false });
  });

  it('direktor ko‘radi, lekin kirita olmaydi; HR pul modulini ko‘rmaydi', async () => {
    const acc = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Direktor test', type: 'cash', currency: 'UZS' });
    expect((await balances(db, ctx('direktor'), { on: RATE_DAY })).accounts.some((a) => a.id === acc.id)).toBe(true);
    await expect(recordTransaction(db, ctx('direktor'), { accountId: acc.id, direction: 'in', amount: so(1), categoryId: cat['Sotuvdan tushum']!, occurredOn: '2001-02-12' }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(balances(db, ctx('hr'), { on: RATE_DAY })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('boshqa tenant kassasi ko‘rinmaydi va unga yozib bo‘lmaydi', async () => {
    const acc = await createCashAccount(db, ctx('ega'), { companyId: companyA, name: 'Maxfiy kassa', type: 'cash', currency: 'UZS' });
    const otherEga = await withTenant(db, otherTenantId, (tx) => createUser(tx, { fullName: 'Boshqa ega', roles: ['Ega'] }));
    const other = { tenantId: otherTenantId, userId: otherEga.id };
    expect((await balances(db, other, { on: RATE_DAY })).accounts).toEqual([]);
    const otherCats = await listCategories(db, other);
    await expect(recordTransaction(db, other, { accountId: acc.id, direction: 'in', amount: so(1), categoryId: otherCats.find((c) => c.direction === 'in')!.id, occurredOn: '2001-02-12' }))
      .rejects.toThrow(/topilmadi/i);
  });
});

describe('pul qoldig‘i va kurslar (FIN-03, FIN-04)', () => {
  it('Markaziy bank kurslari yuklanadi: nominal hisobga olinadi, takror yuklash xavfsiz, dam olish kuni — oxirgi kurs', async () => {
    expect(await rateOn(db, 'USD', RATE_DAY)).toBe('12500');
    expect(await rateOn(db, 'RUB', RATE_DAY)).toBe('140'); // 10 rubl = 1400 so'm
    expect(await rateOn(db, 'UZS', RATE_DAY)).toBe('1');
    const again = await loadCbuRates(db, { on: RATE_DAY, fetch: cbu('01.03.2001', [['USD', '99999', '1']]) });
    expect(again).toBe(0);
    expect(await rateOn(db, 'USD', RATE_DAY)).toBe('12500');
    // Shanba so'ralsa bank juma kursini qaytaradi — o'sha sana bilan saqlanadi
    await loadCbuRates(db, { on: '2001-06-02', fetch: cbu('01.06.2001', [['USD', '12800', '1']]) });
    expect(await rateOn(db, 'USD', '2001-06-03')).toBe('12800');
    expect(await rateOn(db, 'USD', '2001-05-31')).toBe('12500');
  });

  it('kompaniya va jami bo‘yicha so‘mda va dollar ekvivalentida', async () => {
    const t = await createTenant(db, { name: 'Jami test', slug: `jami-${crypto.randomUUID()}` });
    try {
      const { ega, cA, cB } = await withTenant(db, t.id, async (tx) => {
        const cs = await tx.insert(schema.companies).values([{ tenantId: t.id, name: 'A' }, { tenantId: t.id, name: 'B' }]).returning();
        return { ega: (await createUser(tx, { fullName: 'Ega', roles: ['Ega'] })).id, cA: cs[0]!.id, cB: cs[1]!.id };
      });
      const c = { tenantId: t.id, userId: ega };
      await createCashAccount(db, c, { companyId: cA, name: 'A so‘m', type: 'cash', currency: 'UZS', openingBalance: so(25_000_000), openingOn: '2001-02-01' });
      await createCashAccount(db, c, { companyId: cA, name: 'A dollar', type: 'bank', currency: 'USD', openingBalance: 1_000_00, openingOn: '2001-02-01' });
      await createCashAccount(db, c, { companyId: cB, name: 'B yevro', type: 'card', currency: 'EUR', openingBalance: 100_00, openingOn: '2001-02-01' });

      const b = await balances(db, c, { on: RATE_DAY });
      const a = b.companies.find((x) => x.companyId === cA)!;
      expect(a.uzs).toBe(so(25_000_000 + 12_500_000));
      expect(a.usd).toBe(3_000_00); // 37,5 mln so'm / 12 500
      expect(b.companies.find((x) => x.companyId === cB)!.uzs).toBe(so(1_350_050));
      expect(b.total.uzs).toBe(so(25_000_000 + 12_500_000 + 1_350_050));
      expect(b.missingRates).toEqual([]);
      // Kurs yo'q sana — ekvivalent hisoblanmaydi, sababi ko'rsatiladi
      const noRate = await balances(db, c, { on: '2001-02-15' });
      expect(noRate.missingRates.sort()).toEqual(['EUR', 'USD']);
      expect(noRate.total.usd).toBeNull();
    } finally {
      await sql`delete from tenants where id = ${t.id}`;
    }
  });
});
