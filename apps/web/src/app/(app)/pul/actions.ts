"use server";
// Pul sahifasi amallari. Ruxsat va qoidalar core'da tekshiriladi; bu yerda — forma maydonlari va xato matni (o'quvchi tilida).
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  cancelTransaction, createCashAccount, FinError, ForbiddenError, recordTransaction, transfer, type AccountType, type Ctx, type Direction,
} from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import { parseMoney } from "@/lib/format";
import type { ActionResult } from "@/components/sheet-form";


const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || undefined;
function amount(f: FormData, k: string) {
  const n = parseMoney(str(f, k));
  if (n == null) throw new FinError("amount", "Summa noto‘g‘ri");
  return n;
}
const rate = (f: FormData) => opt(f, "rate")?.replace(/\s/g, "").replace(",", ".");

async function run(fn: (ctx: Ctx) => Promise<unknown>): Promise<ActionResult> {
  const ctx = await requireCtx();
  const t = await getTranslations("money");
  try {
    await fn(ctx);
  } catch (e) {
    if (e instanceof FinError) return { ok: false, error: t(`err_${e.code}`) };
    if (e instanceof ForbiddenError) return { ok: false, error: t("err_forbidden") };
    console.error(e);
    return { ok: false, error: t("err_unknown") };
  }
  // Dinamik sahifalar: joriy sahifani yangi ma'lumot bilan qayta chizish (Next 16)
  refresh();
  return { ok: true };
}

export async function addTransaction(_: ActionResult, f: FormData) {
  return run((ctx) => recordTransaction(db, ctx, {
    accountId: str(f, "accountId"), direction: str(f, "direction") as Direction, amount: amount(f, "amount"), categoryId: str(f, "categoryId"),
    occurredOn: str(f, "occurredOn"), rate: rate(f), basis: opt(f, "basis"), note: opt(f, "note"),
    counterpartyId: str(f, "counterpartyId") && str(f, "counterpartyId") !== "none" ? str(f, "counterpartyId") : undefined,
  }));
}

export async function addTransfer(_: ActionResult, f: FormData) {
  return run((ctx) => transfer(db, ctx, {
    fromAccountId: str(f, "fromAccountId"), toAccountId: str(f, "toAccountId"), amount: amount(f, "amount"),
    toAmount: str(f, "toAmount") ? amount(f, "toAmount") : undefined, occurredOn: str(f, "occurredOn"), basis: opt(f, "basis"), note: opt(f, "note"),
  }));
}

export async function addAccount(_: ActionResult, f: FormData) {
  const responsible = str(f, "responsibleUserId");
  return run((ctx) => createCashAccount(db, ctx, {
    companyId: str(f, "companyId"), name: str(f, "name"), type: str(f, "type") as AccountType, currency: str(f, "currency"),
    responsibleUserId: responsible && responsible !== "none" ? responsible : undefined,
    openingBalance: str(f, "openingBalance") ? amount(f, "openingBalance") : undefined, openingOn: opt(f, "openingOn"),
  }));
}

export async function cancelTx(_: ActionResult, f: FormData) {
  return run((ctx) => cancelTransaction(db, ctx, str(f, "id"), str(f, "reason")));
}
