// Demo tenant uchun savdo va xarid (9-hafta): tovarlar, sotuvlar (so'm va $), qaytarish, xaridlar, to'lovlar,
// kredit limitidan oshgan sotuv (tasdiq kutadi) va boshlang'ich qarzlar. Kontragentlar va kassalar oldindan bo'lishi kerak.
import { eq, schema, withTenant, type Db } from '@kaft/db';
import {
  createProduct, createPurchase, createSale, createSaleReturn, listCategories, recordOpeningDebt, recordTransaction, type Ctx,
} from '@kaft/core';

const so = (n: number) => Math.round(n * 100);

export async function seedDemoTrade(db: Db, ctx: Ctx, opts: { companyIds: [string, string]; today: string }) {
  const day = (n: number) => new Date(Date.parse(opts.today) - n * 86_400_000).toISOString().slice(0, 10);
  const [a, b] = opts.companyIds;
  const { cps, accounts } = await withTenant(db, ctx.tenantId, async (tx) => ({
    cps: new Map((await tx.select({ id: schema.counterparties.id, name: schema.counterparties.name }).from(schema.counterparties)).map((c) => [c.name, c.id])),
    accounts: new Map((await tx.select({ id: schema.cashAccounts.id, name: schema.cashAccounts.name }).from(schema.cashAccounts)
      .where(eq(schema.cashAccounts.isArchived, false))).map((x) => [x.name, x.id])),
  }));
  const cp = (name: string) => cps.get(name)!;

  const P: [string, string, number, number, number | null][] = [
    ['Suv «Toza» 1,5 l', 'dona', 5_000, 4_200, 3_900],
    ['Suv «Toza» 0,5 l', 'dona', 3_000, 2_500, null],
    ['Shakar', 'kg', 14_000, 12_800, 12_300],
    ['Un, oliy nav', 'kg', 7_500, 6_900, null],
    ['Paxta yog‘i 1 l', 'dona', 24_000, 22_000, 21_000],
    ['Choy «Ahmad» 100 g', 'dona', 18_000, 16_000, null],
    ['Konfet «Shirin»', 'kg', 42_000, 38_000, 36_000],
    ['Guruch «Lazer»', 'kg', 21_000, 19_500, null],
  ];
  const prod: string[] = [];
  for (const [name, unit, retail, wholesale, special] of P) {
    prod.push((await createProduct(db, ctx, { name, unit, prices: { retail: so(retail), wholesale: so(wholesale), special: special ? so(special) : null } })).id);
  }

  const sale = (counterparty: string, daysAgo: number, companyId: string, priceType: 'retail' | 'wholesale' | 'special', lines: [number, string][], currency = 'UZS', prices?: number[]) =>
    createSale(db, ctx, {
      companyId, counterpartyId: cp(counterparty), date: day(daysAgo), currency, priceType,
      lines: lines.map(([i, qty], k) => ({ productId: prod[i]!, qty, price: prices?.[k] })),
    });
  const s1 = await sale('Baraka Savdo XK', 19, b, 'wholesale', [[0, '1200'], [2, '500'], [4, '120']]);
  await sale('Mega Distribution MChJ', 16, b, 'wholesale', [[3, '2000'], [7, '800']]);
  await sale('Oila Market MChJ', 14, a, 'retail', [[0, '300'], [1, '400'], [5, '60']]);
  await sale('Yangi Hayot Supermarket', 12, a, 'retail', [[6, '45'], [2, '150']]);
  await sale('Mega Distribution MChJ', 9, b, 'wholesale', [[0, '2500'], [4, '300']], 'USD', [33, 1_750]);
  await sale('Baraka Savdo XK', 6, b, 'special', [[0, '1500'], [2, '700'], [6, '80']]);
  await sale('Shirin Qandolat MChJ', 3, a, 'retail', [[6, '20']]);
  await createSaleReturn(db, ctx, s1.id, { date: day(15), lines: [{ productId: prod[0]!, qty: '100' }] });
  // Limitdan oshgan sotuv — ega tasdig'ini kutadi
  await sale('Shirin Qandolat MChJ', 1, a, 'retail', [[6, '700'], [4, '200']]);

  const purchase = (counterparty: string, daysAgo: number, companyId: string, lines: [number, string, number][], currency = 'UZS') =>
    createPurchase(db, ctx, { companyId, counterpartyId: cp(counterparty), date: day(daysAgo), currency, lines: lines.map(([i, qty, price]) => ({ productId: prod[i]!, qty, price })) });
  await purchase('Toza Suv MChJ', 20, b, [[0, '5000', so(2_800)], [1, '3000', so(1_700)]]);
  await purchase('Agro Food Trade', 17, b, [[3, '6000', so(5_900)], [7, '2000', so(16_800)]]);
  await purchase('Shirin Qandolat MChJ', 11, a, [[6, '300', so(31_000)]]);
  await purchase('Toza Suv MChJ', 5, b, [[0, '4000', 22]], 'USD');

  // To'lovlar: mijozlardan kirim, ta'minotchilarga chiqim (qolgani — qarz)
  const cats = await listCategories(db, ctx);
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  const pay = (account: string, direction: 'in' | 'out', counterparty: string, amount: number, daysAgo: number, basis?: string) =>
    recordTransaction(db, ctx, {
      accountId: accounts.get(account)!, direction, amount, occurredOn: day(daysAgo), counterpartyId: cp(counterparty), basis,
      categoryId: cat(direction === 'in' ? 'Qarz qaytarildi' : 'Tovar xaridi'),
    });
  await pay('Hamkorbank hisob', 'in', 'Baraka Savdo XK', so(4_000_000), 10, 'To‘lov topshiriqnomasi №311');
  await pay('Hamkorbank hisob', 'in', 'Mega Distribution MChJ', so(9_000_000), 8, 'To‘lov topshiriqnomasi №88');
  await pay('Asosiy kassa', 'in', 'Oila Market MChJ', so(1_500_000), 7);
  await pay('Hamkorbank hisob', 'out', 'Toza Suv MChJ', so(10_000_000), 12, 'To‘lov topshiriqnomasi №45');
  await pay('Hamkorbank hisob', 'out', 'Agro Food Trade', so(20_000_000), 9, 'To‘lov topshiriqnomasi №52');

  // Boshlang'ich qarzlar (tizimga o'tishdan oldingi)
  await recordOpeningDebt(db, ctx, { counterpartyId: cp('Yangi Hayot Supermarket'), side: 'receivable', amount: so(3_250_000), currency: 'UZS', date: day(40), dueDate: day(25) });
  await recordOpeningDebt(db, ctx, { counterpartyId: cp('Logistic Plus MChJ'), side: 'payable', amount: 1_200_00, currency: 'USD', date: day(35), dueDate: day(20) });
  return { products: prod.length };
}
