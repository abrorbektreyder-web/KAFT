// «Pul» sahifasi ma'lumotlari (FIN-01…05). Ruxsat yo'q bo'lsa — null.
import { balances, can, finAccess, listCategories, listCounterparties, listPurchases, listSales, listTransactions, localName, type Ctx } from "@kaft/core";
import { eq, schema, withTenant } from "@kaft/db";
import { db } from "@/lib/server";

export async function loadMoney(ctx: Ctx, locale: string, companyId?: string) {
  const access = await finAccess(db, ctx);
  if (!access.view) return null;
  const [cpView, salView, purView] = await withTenant(db, ctx.tenantId, (tx) => Promise.all([
    can(tx, ctx.userId, "cp", "view"), can(tx, ctx.userId, "sal", "view"), can(tx, ctx.userId, "pur", "view"),
  ]));
  const [bal, txs, cats, org, cps, sales, purchases] = await Promise.all([
    balances(db, ctx, { companyId }),
    listTransactions(db, ctx, { limit: 30 }),
    listCategories(db, ctx),
    withTenant(db, ctx.tenantId, async (tx) => ({
      companies: await tx.select({ id: schema.companies.id, name: schema.companies.name, nameRu: schema.companies.nameRu }).from(schema.companies),
      users: access.manage
        ? await tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users).where(eq(schema.users.isBlocked, false)).orderBy(schema.users.fullName)
        : [],
    })),
    access.create && cpView ? listCounterparties(db, ctx, { limit: 500 }) : Promise.resolve([]),
    access.create && salView ? listSales(db, ctx, { status: "posted", limit: 300 }) : Promise.resolve([]),
    access.create && purView ? listPurchases(db, ctx, { limit: 300 }) : Promise.resolve([]),
  ]);
  const allCompanies = org.companies.map((c) => ({ id: c.id, name: localName(c, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale));
  const companyName = new Map(allCompanies.map((c) => [c.id, c.name]));
  return {
    access,
    ...bal,
    accounts: bal.accounts.map((a) => ({ ...a, companyName: companyName.get(a.companyId) ?? "" })),
    companies: bal.companies.map((c) => ({ ...c, name: companyName.get(c.companyId) ?? "" })),
    transactions: txs
      .filter((t) => !companyId || t.companyId === companyId)
      .map((t) => ({ ...t, category: t.categoryName ? localName({ name: t.categoryName, nameRu: t.categoryNameRu }, locale) : null })),
    categories: cats.map((c) => ({ id: c.id, direction: c.direction as "in" | "out", name: localName(c, locale) })),
    allCompanies,
    users: org.users,
    counterparties: cps.filter((c) => !c.isArchived).map((c) => ({ id: c.id, name: c.name })),
    // To'lovni bog'lash uchun hujjatlar: kirim — sotuv/boshlang'ich qarz, chiqim — xarid
    docs: [
      ...sales.filter((s) => !s.cancelledAt && s.kind !== "return").map((s) => ({ id: s.id, number: s.number, counterpartyId: s.counterpartyId, direction: "in" as const })),
      ...purchases.filter((p) => !p.cancelledAt && p.status === "posted").map((p) => ({ id: p.id, number: p.number, counterpartyId: p.counterpartyId, direction: "out" as const })),
    ],
  };
}

export type MoneyData = NonNullable<Awaited<ReturnType<typeof loadMoney>>>;
