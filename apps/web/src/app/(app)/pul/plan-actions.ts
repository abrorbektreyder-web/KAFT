"use server";
// Rejali to'lovlar va kunlik kassa yopish amallari (FIN-06, FIN-08).
import { refresh } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import {
  closeCashDay, createScheduledPayment, deactivateScheduledPayment, ForbiddenError, PlanError, type Ctx, type Repeat,
} from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import { money, parseMoney } from "@/lib/format";
import type { ActionResult } from "@/components/sheet-form";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optId = (f: FormData, k: string) => (str(f, k) && str(f, k) !== "none" ? str(f, k) : null);

async function run(fn: (ctx: Ctx) => Promise<Exclude<ActionResult, null> | void>): Promise<ActionResult> {
  const ctx = await requireCtx();
  const [t, tm] = await Promise.all([getTranslations("plan"), getTranslations("money")]);
  let res: Exclude<ActionResult, null> | void;
  try {
    res = await fn(ctx);
  } catch (e) {
    if (e instanceof PlanError) return { ok: false, error: t(`err_${e.code}`) };
    if (e instanceof ForbiddenError) return { ok: false, error: tm("err_forbidden") };
    console.error(e);
    return { ok: false, error: tm("err_unknown") };
  }
  refresh();
  return res ?? { ok: true };
}

export async function addSchedule(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async (ctx) => {
    const amount = parseMoney(str(f, "amount"));
    if (amount == null) throw new PlanError("amount", "Summa noto‘g‘ri");
    await createScheduledPayment(db, ctx, {
      name: str(f, "name"), direction: str(f, "direction") as "in" | "out", amount, currency: str(f, "currency") || "UZS",
      startsOn: str(f, "startsOn"), repeat: str(f, "repeat") as Repeat, endsOn: str(f, "endsOn") || null, categoryId: optId(f, "categoryId"),
    });
  });
}

export async function stopSchedule(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("plan");
  return run(async (ctx) => {
    await deactivateScheduledPayment(db, ctx, str(f, "id"));
    return { ok: true, message: t("stopped") };
  });
}

export async function closeDay(_: ActionResult, f: FormData): Promise<ActionResult> {
  const [t, locale] = await Promise.all([getTranslations("plan"), getLocale()]);
  return run(async (ctx) => {
    const raw = str(f, "counted");
    const counted = /^0+([.,]0+)?$/.test(raw) ? 0 : parseMoney(raw);
    if (counted == null) throw new PlanError("amount", "Summa noto‘g‘ri");
    const res = await closeCashDay(db, ctx, { accountId: str(f, "accountId"), date: str(f, "date"), counted, note: str(f, "note") || undefined });
    const currency = str(f, "currency") || "UZS";
    return { ok: true, message: res.diff ? t("closedDiff", { diff: `${res.diff > 0 ? "+" : ""}${money(res.diff, currency, locale)}` }) : t("closed") };
  });
}
