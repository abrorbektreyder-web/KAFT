// «Pul» ichki sahifalari: to'lov kalendari, prognoz, kassa yopish, foyda-zarar. Ruxsat yo'q bo'lsa — null.
import {
  balances, cashForecast, finAccess, listCategories, listClosings, listScheduledPayments, localName, paymentCalendar, profitAndLoss, type Ctx,
} from "@kaft/core";
import { schema, withTenant } from "@kaft/db";
import { db } from "@/lib/server";

export async function loadCalendar(ctx: Ctx, locale: string) {
  const access = await finAccess(db, ctx);
  if (access.view !== "all") return null;
  const [cal, schedules, cats] = await Promise.all([paymentCalendar(db, ctx), listScheduledPayments(db, ctx), listCategories(db, ctx)]);
  return {
    access, ...cal, schedules,
    categories: cats.map((c) => ({ id: c.id, name: localName(c, locale), direction: c.direction as "in" | "out" })),
  };
}

export async function loadForecast(ctx: Ctx) {
  const access = await finAccess(db, ctx);
  if (access.view !== "all") return null;
  return { access, forecast: await cashForecast(db, ctx) };
}

export async function loadClosing(ctx: Ctx) {
  const access = await finAccess(db, ctx);
  if (!access.view) return null;
  const [bal, closings] = await Promise.all([balances(db, ctx), listClosings(db, ctx)]);
  return {
    access, closings,
    accounts: access.create ? bal.accounts.filter((a) => !a.isArchived).map((a) => ({ id: a.id, name: a.name, currency: a.currency })) : [],
  };
}

export async function loadPl(ctx: Ctx, opts: { from: string; to: string; companyId?: string }) {
  const access = await finAccess(db, ctx);
  if (access.view !== "all") return null;
  const [pl, companies] = await Promise.all([
    profitAndLoss(db, ctx, opts),
    withTenant(db, ctx.tenantId, (tx) => tx.select({ id: schema.companies.id, name: schema.companies.name, nameRu: schema.companies.nameRu }).from(schema.companies)),
  ]);
  return { access, pl, companies };
}
