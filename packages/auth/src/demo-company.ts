// Demo tenant uchun kompaniya pasporti (CORE-12) va shtat jadvali (HR-09).
import { and, eq, isNull, schema, withTenant, type Db } from '@kaft/db';
import { saveCompanyProfile, setStaffingPlan, type Ctx } from '@kaft/core';

export async function seedDemoCompany(db: Db, ctx: Ctx, opts: { companyIds: [string, string] }) {
  const [a, b] = opts.companyIds;
  await saveCompanyProfile(db, ctx, a, {
    industry: 'Oziq-ovqat va ichimliklar chakana savdosi', businessModel: 'Do‘kon tarmog‘i + Payme orqali onlayn buyurtma',
    products: 'Ichimlik suvi, shakar, un, yog‘, choy, qandolat', customerProfile: 'Mahalla oilalari, kichik ofislar; o‘rtacha chek 85 000 so‘m',
    funnel: 'Instagram va Telegram → do‘kon / yetkazib berish → takroriy xarid (sodiqlik kartasi)', advantage: '2 soat ichida yetkazish, har doim yangi mahsulot',
    notSegment: 'Restoran va kafe (ulgurji — Distribyutor Plus orqali)', strategy: '2027: Toshkentda 3 ta yangi do‘kon\nOnlayn savdo ulushini 25% ga yetkazish',
    visibility: 'managers',
  });
  await saveCompanyProfile(db, ctx, b, {
    industry: 'Oziq-ovqat ulgurji distribyutsiyasi', businessModel: 'Ishlab chiqaruvchilardan olib, do‘kon va supermarketlarga yetkazish',
    products: 'Suv, un, guruch, yog‘ — 8 ta asosiy SKU', customerProfile: 'Viloyatlardagi do‘kon va supermarketlar', funnel: 'Agentlar tashrifi → buyurtma → yetkazish → 14–30 kunlik nasiya',
    advantage: 'Nasiya muddati va o‘z transporti', notSegment: 'Chakana xaridorlar', strategy: 'Qarz muddatini 21 kundan 14 kunga tushirish', visibility: 'owner',
  });
  // Lavozimlar: bo'limga qarab (demo xodimlarida lavozim bo'lmasa biriktiriladi)
  const POS: Record<string, [string, string]> = {
    'Chakana savdo': ['Sotuvchi', 'Продавец'], Kassa: ['Kassir', 'Кассир'], 'Ulgurji savdo': ['Savdo agenti', 'Торговый агент'], Ombor: ['Omborchi', 'Кладовщик'],
  };
  await withTenant(db, ctx.tenantId, async (tx) => {
    const depts = await tx.select().from(schema.departments);
    for (const d of depts) {
      const pos = POS[d.name];
      if (!pos) continue;
      const [p] = await tx.insert(schema.positions).values({ tenantId: ctx.tenantId, companyId: d.companyId, name: pos[0], nameRu: pos[1] })
        .onConflictDoNothing().returning();
      const positionId = p?.id ?? (await tx.select({ id: schema.positions.id }).from(schema.positions)
        .where(and(eq(schema.positions.companyId, d.companyId), eq(schema.positions.name, pos[0]))))[0]!.id;
      await tx.update(schema.employees).set({ positionId }).where(and(eq(schema.employees.departmentId, d.id), isNull(schema.employees.positionId)));
    }
  });
  // Shtat rejasi: har bo'limda mavjud lavozimlar bo'yicha (haqiqiydan +1 — bo'sh o'rin ko'rinsin)
  const rows = await withTenant(db, ctx.tenantId, (tx) => tx.select({ departmentId: schema.employees.departmentId, positionId: schema.employees.positionId })
    .from(schema.employees).where(eq(schema.employees.tenantId, ctx.tenantId)));
  const counts = new Map<string, number>();
  for (const r of rows) if (r.departmentId && r.positionId) counts.set(`${r.departmentId}:${r.positionId}`, (counts.get(`${r.departmentId}:${r.positionId}`) ?? 0) + 1);
  for (const [k, n] of counts) {
    const [departmentId, positionId] = k.split(':') as [string, string];
    await setStaffingPlan(db, ctx, { departmentId, positionId, planned: n + 1 });
  }
  return { plans: counts.size };
}
