// Demo tenant uchun pul ma'lumotlari (FIN, 7-hafta): kassalar, 3 haftalik kirim/chiqim, inkassatsiya va ayirboshlash.
import { withTenant, type Db } from '@kaft/db';
import { createCashAccount, createUser, listCategories, rateOn, recordTransaction, transfer, type Ctx } from '@kaft/core';

const so = (n: number) => Math.round(n * 100);

export async function seedDemoMoney(db: Db, ctx: Ctx, opts: { companyIds: [string, string]; today: string }) {
  const day = (n: number) => new Date(Date.parse(opts.today) - n * 86_400_000).toISOString().slice(0, 10);
  const [a, b] = opts.companyIds;
  const cashier = await withTenant(db, ctx.tenantId, (tx) => createUser(tx, { fullName: 'Nodira Kassirova', roles: ['Kassir'] }));
  const start = day(21);

  const acc = async (companyId: string, name: string, type: 'cash' | 'bank' | 'card' | 'payment', currency: string, opening: number, responsibleUserId?: string) =>
    (await createCashAccount(db, ctx, { companyId, name, type, currency, openingBalance: opening, openingOn: start, responsibleUserId })).id;
  const kassaA = await acc(a, 'Asosiy kassa', 'cash', 'UZS', so(18_500_000), cashier.id);
  const bankA = await acc(a, 'Kapitalbank hisob', 'bank', 'UZS', so(146_200_000));
  const payme = await acc(a, 'Payme', 'payment', 'UZS', so(3_400_000));
  const usdA = await acc(a, 'Dollar kassa', 'cash', 'USD', 12_400_00);
  const kassaB = await acc(b, 'Kassa', 'cash', 'UZS', so(9_800_000));
  const bankB = await acc(b, 'Hamkorbank hisob', 'bank', 'UZS', so(212_000_000));
  const cardB = await acc(b, 'Korporativ karta', 'card', 'UZS', so(6_500_000));

  const cats = new Map((await listCategories(db, ctx)).map((c) => [c.name, c.id]));
  const add = (accountId: string, direction: 'in' | 'out', amount: number, category: string, daysAgo: number, basis?: string, note?: string) =>
    recordTransaction(db, ctx, { accountId, direction, amount, categoryId: cats.get(category)!, occurredOn: day(daysAgo), basis, note });

  // Har kuni chakana tushum (kassa va Payme), har hafta ulgurji tushum bankka
  for (let d = 20; d >= 0; d--) {
    await add(kassaA, 'in', so(3_200_000 + ((d * 7919) % 2_400_000)), 'Sotuvdan tushum', d, `Z-hisobot №${400 - d}`);
    if (d % 2 === 0) await add(payme, 'in', so(640_000 + ((d * 3571) % 900_000)), 'Sotuvdan tushum', d);
    if (d % 7 === 3) await add(bankB, 'in', so(48_000_000 + d * 1_150_000), 'Sotuvdan tushum', d, `To‘lov topshiriqnomasi №${80 + d}`);
    if (d % 5 === 1) await add(kassaB, 'in', so(2_100_000 + d * 45_000), 'Sotuvdan tushum', d);
  }
  await add(bankA, 'out', so(18_000_000), 'Ijara', 18, 'Shartnoma №7-IJ', 'Do‘kon ijarasi');
  await add(bankB, 'out', so(9_500_000), 'Ijara', 18, 'Shartnoma №3-IJ', 'Ombor ijarasi');
  await add(bankA, 'out', so(64_300_000), 'Oylik', 10, 'Oylik vedomosti', 'Avgust oyligi');
  await add(bankB, 'out', so(41_800_000), 'Oylik', 10, 'Oylik vedomosti', 'Avgust oyligi');
  await add(bankA, 'out', so(21_400_000), 'Soliqlar', 5, 'Soliq to‘lovi');
  await add(bankA, 'out', so(2_380_000), 'Kommunal xizmatlar', 12);
  await add(bankB, 'out', so(96_000_000), 'Tovar xaridi', 8, 'Shartnoma №21-T', 'Ta’minotchiga to‘lov');
  await add(cardB, 'out', so(4_200_000), 'Transport', 6, undefined, 'Yoqilg‘i');
  await add(cardB, 'out', so(5_000_000), 'Marketing', 4, undefined, 'Instagram reklama');
  await add(kassaA, 'out', so(850_000), 'Boshqa chiqim', 2, undefined, 'Xo‘jalik mollari');
  await add(bankA, 'out', so(310_000), 'Bank xizmatlari', 1);

  // Inkassatsiya: kassadan bankka; ayirboshlash: dollar sotildi
  await transfer(db, ctx, { fromAccountId: kassaA, toAccountId: bankA, amount: so(45_000_000), occurredOn: day(7), basis: 'Inkassatsiya', note: 'Kassadan bankka' });
  await transfer(db, ctx, { fromAccountId: kassaA, toAccountId: bankA, amount: so(38_000_000), occurredOn: day(1), basis: 'Inkassatsiya', note: 'Kassadan bankka' });
  const usdRate = Number((await rateOn(db, 'USD', opts.today)) ?? '12000');
  await transfer(db, ctx, { fromAccountId: usdA, toAccountId: bankA, amount: 2_000_00, toAmount: so(2_000 * usdRate), occurredOn: day(3), note: 'Dollar sotildi' });
  return { accounts: 7 };
}
