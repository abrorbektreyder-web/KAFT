"use server";
// Savdo, xarid, tovarlar va boshlang'ich qarz amallari. Qoidalar core'da; bu yerda — forma maydonlari va xato matni o'quvchi tilida.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  approveSale, cancelPurchase, cancelSale, createProduct, createPurchase, createSale, createSaleReturn, ForbiddenError, importOpeningDebts,
  PRICE_TYPES, recordOpeningDebt, TradeError, type Ctx, type PriceType,
} from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import { parseMoney } from "@/lib/format";
import type { ActionResult } from "@/components/sheet-form";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
function money(v: string, required: boolean) {
  if (!v) {
    if (required) throw new TradeError("price", "Narx kiritilmagan");
    return undefined;
  }
  const n = parseMoney(v);
  if (n == null) throw new TradeError("price", "Narx noto‘g‘ri");
  return n;
}

async function run(fn: (ctx: Ctx) => Promise<Exclude<ActionResult, null> | void>): Promise<ActionResult> {
  const ctx = await requireCtx();
  const t = await getTranslations("trade");
  let res: Exclude<ActionResult, null> | void;
  try {
    res = await fn(ctx);
  } catch (e) {
    if (e instanceof TradeError) return { ok: false, error: t(`err_${e.code}`) };
    if (e instanceof ForbiddenError) return { ok: false, error: t("err_forbidden") };
    console.error(e);
    return { ok: false, error: t("err_unknown") };
  }
  // Dinamik sahifalar: joriy sahifani yangi ma'lumot bilan qayta chizish (Next 16)
  refresh();
  return res ?? { ok: true };
}

type LineJson = { productId: string; qty: string; price: string; discount?: string };
const lines = (f: FormData) => {
  try {
    return (JSON.parse(str(f, "lines") || "[]") as LineJson[]).filter((l) => l.productId);
  } catch {
    return [];
  }
};

export async function saveSale(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("trade");
  return run(async (ctx) => {
    const priceType = str(f, "priceType") as PriceType;
    const res = await createSale(db, ctx, {
      companyId: str(f, "companyId"), counterpartyId: str(f, "counterpartyId"), date: str(f, "date"), currency: str(f, "currency"),
      priceType: PRICE_TYPES.includes(priceType) ? priceType : "retail", dueDate: str(f, "dueDate") || undefined, note: str(f, "note") || undefined,
      lines: lines(f).map((l) => ({
        productId: l.productId, qty: l.qty, price: money(l.price.trim(), false),
        discountPct: l.discount?.trim() ? Number(l.discount.replace(",", ".")) : undefined,
      })),
    });
    return { ok: true, id: res.id, message: t(res.status === "pending" ? "salePending" : "saleCreated", { number: res.number }) };
  });
}

export async function savePurchase(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("trade");
  return run(async (ctx) => {
    const res = await createPurchase(db, ctx, {
      companyId: str(f, "companyId"), counterpartyId: str(f, "counterpartyId"), date: str(f, "date"), currency: str(f, "currency"),
      dueDate: str(f, "dueDate") || undefined, note: str(f, "note") || undefined,
      lines: lines(f).map((l) => ({ productId: l.productId, qty: l.qty, price: money(l.price.trim(), true)! })),
    });
    return { ok: true, id: res.id, message: t("purchaseCreated", { number: res.number }) };
  });
}

export async function saveReturn(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async (ctx) => {
    const items = f.getAll("productId").map((p, i) => ({ productId: String(p), qty: String(f.getAll("qty")[i] ?? "").trim() })).filter((l) => l.qty);
    await createSaleReturn(db, ctx, str(f, "saleId"), { date: str(f, "date"), lines: items });
  });
}

export async function approveSaleAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("trade");
  return run(async (ctx) => {
    await approveSale(db, ctx, str(f, "id"));
    return { ok: true, message: t("approved") };
  });
}

export async function cancelDocAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async (ctx) => {
    await (str(f, "kind") === "purchase" ? cancelPurchase : cancelSale)(db, ctx, str(f, "id"), str(f, "reason"));
  });
}

export async function saveProduct(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async (ctx) => {
    await createProduct(db, ctx, {
      name: str(f, "name"), unit: str(f, "unit"), sku: str(f, "sku") || null, currency: str(f, "currency") || "UZS",
      prices: { retail: money(str(f, "retail"), false) ?? null, wholesale: money(str(f, "wholesale"), false) ?? null, special: money(str(f, "special"), false) ?? null },
    });
  });
}

export async function saveOpeningDebt(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async (ctx) => {
    const amount = parseMoney(str(f, "amount"));
    if (amount == null) throw new TradeError("amount", "Summa noto‘g‘ri");
    await recordOpeningDebt(db, ctx, {
      counterpartyId: str(f, "counterpartyId"), side: str(f, "side") as "receivable" | "payable", amount,
      currency: str(f, "currency") || "UZS", date: str(f, "date"), dueDate: str(f, "dueDate") || undefined,
    });
  });
}

export async function importDebtsAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("trade");
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: t("err_file") };
  return run(async (ctx) => {
    const res = await importOpeningDebts(db, ctx, await file.arrayBuffer());
    if (res.ok) return { ok: true, message: t("imported", { count: res.imported }) };
    return {
      ok: false, error: t("importErrors", { count: res.errors.length }),
      details: res.errors.slice(0, 20).map((e) => t("rowCol", { row: e.row, column: e.column, message: e.message })),
    };
  });
}
