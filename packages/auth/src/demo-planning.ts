// Demo tenant uchun rejali to'lovlar (10-hafta): ijara, oylik, soliq, kredit — to'lov kalendari va prognoz uchun.
import { createScheduledPayment, listCategories, type Ctx } from '@kaft/core';
import type { Db } from '@kaft/db';

const so = (n: number) => Math.round(n * 100);

export async function seedDemoPlanning(db: Db, ctx: Ctx, opts: { companyIds: [string, string]; today: string }) {
  const [a, b] = opts.companyIds;
  const month = opts.today.slice(0, 8);
  const cats = await listCategories(db, ctx, 'out');
  const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? null;
  const plans = [
    { name: 'Do‘kon ijarasi', amount: 18_000_000, day: '05', categoryId: cat('Ijara'), companyId: a },
    { name: 'Ombor ijarasi', amount: 9_500_000, day: '05', categoryId: cat('Ijara'), companyId: b },
    { name: 'Oylik (Savdo Markaz)', amount: 64_300_000, day: '10', categoryId: cat('Oylik'), companyId: a },
    { name: 'Oylik (Distribyutor Plus)', amount: 41_800_000, day: '10', categoryId: cat('Oylik'), companyId: b },
    { name: 'Soliqlar', amount: 21_400_000, day: '20', categoryId: cat('Soliqlar'), companyId: a },
    { name: 'Bank krediti', amount: 35_000_000, day: '25', categoryId: cat('Kredit to‘lovi'), companyId: b },
  ];
  for (const p of plans) {
    await createScheduledPayment(db, ctx, {
      name: p.name, direction: 'out', amount: so(p.amount), currency: 'UZS', startsOn: `${month}${p.day}`, repeat: 'monthly',
      categoryId: p.categoryId, companyId: p.companyId,
    });
  }
  return { scheduled: plans.length };
}
