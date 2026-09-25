// «Pul» sahifasi ma'lumotlari (FIN-01…05). Ruxsat yo'q bo'lsa — null.
import { balances, can, finAccess, listCategories, listCounterparties, listTransactions, localName, type Ctx } from "@kaft/core";
import { eq, schema, withTenant } from "@kaft/db";
import { db } from "@/lib/server";

export async function loadMoney(ctx: Ctx, locale: string, companyId?: string) {
  const access = await finAccess(db, ctx);
  if (!access.view) return null;
  const cpView = await withTenant(db, ctx.tenantId, (tx) => can(tx, ctx.userId, "cp", "view"));
  const [bal, txs, cats, org, cps] = await Promise.all([
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
  };
}

export type MoneyData = NonNullable<Awaited<ReturnType<typeof loadMoney>>>;
