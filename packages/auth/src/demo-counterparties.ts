// Demo tenant uchun kontragentlar (CP, 8-hafta): mijozlar, ulgurji hamkorlar, ta'minotchilar va shartnomalar.
import type { Db } from '@kaft/db';
import { createContract, createCounterparty, type CounterpartyRole, type Ctx } from '@kaft/core';

const so = (n: number) => Math.round(n * 100);

const LIST: { name: string; roles: CounterpartyRole[]; stir: string; phone: string; address: string; contact: string; bank: string; mfo: string; limit?: number; term?: number }[] = [
  { name: 'Oila Market MChJ', roles: ['customer'], stir: '305112447', phone: '901234501', address: 'Toshkent, Chilonzor 9-kvartal', contact: 'Anvar Qodirov', bank: 'Kapitalbank', mfo: '01088', limit: 80_000_000, term: 14 },
  { name: 'Baraka Savdo XK', roles: ['wholesale'], stir: '306774120', phone: '901234502', address: 'Samarqand, Registon ko‘chasi 12', contact: 'Dilshod Rahimov', bank: 'Hamkorbank', mfo: '00083', limit: 250_000_000, term: 30 },
  { name: 'Mega Distribution MChJ', roles: ['wholesale', 'customer'], stir: '307009815', phone: '901234503', address: 'Andijon, Bobur shoh 45', contact: 'Sherzod Aliyev', bank: 'Ipoteka bank', mfo: '00873', limit: 400_000_000, term: 21 },
  { name: 'Toza Suv MChJ', roles: ['supplier'], stir: '302556781', phone: '901234504', address: 'Toshkent viloyati, Zangiota', contact: 'Rustam Nazarov', bank: 'Asaka bank', mfo: '00873', term: 10 },
  { name: 'Agro Food Trade', roles: ['supplier'], stir: '303881290', phone: '901234505', address: 'Farg‘ona, Mustaqillik 3', contact: 'Gulnora Yusupova', bank: 'Kapitalbank', mfo: '01088', term: 15 },
  { name: 'Shirin Qandolat MChJ', roles: ['supplier', 'customer'], stir: '304447123', phone: '901234506', address: 'Toshkent, Yunusobod 4', contact: 'Madina Karimova', bank: 'Hamkorbank', mfo: '00083', limit: 30_000_000, term: 7 },
  { name: 'Yangi Hayot Supermarket', roles: ['customer'], stir: '308120556', phone: '901234507', address: 'Namangan, Navoiy 20', contact: 'Otabek Ergashev', bank: 'Aloqabank', mfo: '00401', limit: 60_000_000, term: 14 },
  { name: 'Logistic Plus MChJ', roles: ['supplier'], stir: '309334870', phone: '901234508', address: 'Toshkent, Sergeli 7', contact: 'Jasur Mirzayev', bank: 'Kapitalbank', mfo: '01088', term: 5 },
];

export async function seedDemoCounterparties(db: Db, ctx: Ctx, opts: { today: string }) {
  const day = (n: number) => new Date(Date.parse(opts.today) + n * 86_400_000).toISOString().slice(0, 10);
  const ids: string[] = [];
  for (const [i, c] of LIST.entries()) {
    const { id } = await createCounterparty(db, ctx, {
      name: c.name, roles: c.roles, stir: c.stir, phone: c.phone, address: c.address, contactPerson: c.contact, bankName: c.bank, bankMfo: c.mfo,
      bankAccount: `2020800090${String(1000000000 + i * 7919).slice(0, 10)}`, creditLimit: c.limit ? so(c.limit) : null, paymentTermDays: c.term ?? null,
    });
    ids.push(id);
  }
  // Shartnomalar: biri 30 kundan keyin tugaydi — kunlik ish eslatma yuboradi
  await createContract(db, ctx, ids[1]!, { number: 'UL-14', signedOn: day(-200), endsOn: day(30), amount: so(1_200_000_000), currency: 'UZS' });
  await createContract(db, ctx, ids[2]!, { number: 'MD-2026/03', signedOn: day(-120), endsOn: day(245), amount: so(2_500_000_000), currency: 'UZS' });
  await createContract(db, ctx, ids[3]!, { number: '21-T', signedOn: day(-90), endsOn: day(90), amount: 150_000_00, currency: 'USD' });
  await createContract(db, ctx, ids[4]!, { number: 'AF-7', signedOn: day(-30), amount: so(400_000_000), currency: 'UZS' });
  return { counterparties: ids.length };
}
