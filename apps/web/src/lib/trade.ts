// «Savdo», «Xarid», «Tovarlar» sahifalari ma'lumotlari. Ruxsat yo'q bo'lsa — null.
import {
  can, getPurchase, getSale, listCounterparties, listProducts, listPurchases, listSales, purchaseReport, type Ctx,
} from "@kaft/core";
import { schema, withTenant } from "@kaft/db";
import { db } from "@/lib/server";

export async function tradeAccess(ctx: Ctx) {
  const [salView, salCreate, salCancel, salApprove, purView, purCreate, purCancel, invCreate, cpCreate] = await withTenant(db, ctx.tenantId, (tx) => Promise.all([
    can(tx, ctx.userId, "sal", "view"), can(tx, ctx.userId, "sal", "create"), can(tx, ctx.userId, "sal", "cancel"), can(tx, ctx.userId, "sal", "approve"),
    can(tx, ctx.userId, "pur", "view"), can(tx, ctx.userId, "pur", "create"), can(tx, ctx.userId, "pur", "cancel"),
    can(tx, ctx.userId, "inv", "create"), can(tx, ctx.userId, "cp", "create"),
  ]));
  return {
    salView, salCreate, salCancel: salCancel === "all", salApprove: salApprove === "all",
    purView, purCreate: purCreate === "all", purCancel: purCancel === "all",
    productCreate: [salCreate, purCreate, invCreate].includes("all"), openingDebts: cpCreate === "all",
  };
}

const companies = (ctx: Ctx) => withTenant(db, ctx.tenantId, (tx) =>
  tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).orderBy(schema.companies.name));

const productOptions = async (ctx: Ctx) => (await listProducts(db, ctx)).map((p) => ({
  id: p.id, name: p.name, unit: p.unit, currency: p.currency, prices: { retail: p.priceRetail, wholesale: p.priceWholesale, special: p.priceSpecial },
}));

export async function loadSalesPage(ctx: Ctx, period?: { from?: string; to?: string }) {
  const access = await tradeAccess(ctx);
  if (!access.salView) return null;
  return { access, sales: await listSales(db, ctx, { limit: 300, ...period }) };
}

/** Yangi hujjat formasi: kompaniyalar, mos rolli kontragentlar (kartadagi to'lov muddati bilan), tovarlar. */
export async function loadDocForm(ctx: Ctx, mode: "sale" | "purchase") {
  const access = await tradeAccess(ctx);
  if (mode === "sale" ? !access.salCreate : !access.purCreate) return null;
  const roles = mode === "sale" ? ["customer", "wholesale"] : ["supplier"];
  const [cps, products, comps] = await Promise.all([listCounterparties(db, ctx, { limit: 1000 }), productOptions(ctx), companies(ctx)]);
  return {
    companies: comps,
    products,
    counterparties: cps.filter((c) => !c.isArchived && c.roles.some((r) => roles.includes(r))).map((c) => ({ id: c.id, name: c.name, termDays: c.paymentTermDays, wholesale: c.roles.includes("wholesale") })),
  };
}

export async function loadSale(ctx: Ctx, id: string) {
  const access = await tradeAccess(ctx);
  if (!access.salView) return null;
  return { access, sale: await getSale(db, ctx, id) };
}

export async function loadPurchasesPage(ctx: Ctx, report?: { from: string; to: string; by: "supplier" | "product" }) {
  const access = await tradeAccess(ctx);
  if (!access.purView) return null;
  const [purchases, rows] = await Promise.all([listPurchases(db, ctx, { limit: 300 }), report ? purchaseReport(db, ctx, report) : Promise.resolve(null)]);
  return { access, purchases, report: rows };
}

export async function loadPurchase(ctx: Ctx, id: string) {
  const access = await tradeAccess(ctx);
  if (!access.purView) return null;
  return { access, purchase: await getPurchase(db, ctx, id) };
}

export async function loadProductsPage(ctx: Ctx, q?: string) {
  const access = await tradeAccess(ctx);
  if (!access.salView && !access.purView) return null;
  return { access, products: await listProducts(db, ctx, { q }) };
}
