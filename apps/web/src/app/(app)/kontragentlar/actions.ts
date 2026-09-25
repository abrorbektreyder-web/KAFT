"use server";
// Kontragent amallari. Qoidalar va ruxsat core'da; bu yerda — forma maydonlari va xato matni o'quvchi tilida.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  approveChange, COUNTERPARTY_ROLES, CpError, createContract, createCounterparty, ForbiddenError, importCounterparties, rejectChange,
  updateContract, updateCounterparty, type CounterpartyInput, type CounterpartyRole, type Ctx,
} from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import { parseMoney } from "@/lib/format";
import type { ActionResult } from "@/components/sheet-form";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const nullable = (f: FormData, k: string) => str(f, k) || null;
function money(f: FormData, k: string) {
  const v = str(f, k);
  if (!v) return null;
  if (/^0+([.,]0+)?$/.test(v)) return 0;
  const n = parseMoney(v);
  if (n == null) throw new CpError("amount", "Summa noto‘g‘ri");
  return n;
}
function int(f: FormData, k: string) {
  const v = str(f, k);
  if (!v) return null;
  if (!/^\d+$/.test(v)) throw new CpError("term", "Butun son kiriting");
  return Number(v);
}

async function run(fn: (ctx: Ctx) => Promise<Exclude<ActionResult, null> | void>): Promise<ActionResult> {
  const ctx = await requireCtx();
  const t = await getTranslations("cp");
  let res: Exclude<ActionResult, null> | void;
  try {
    res = await fn(ctx);
  } catch (e) {
    if (e instanceof CpError) return { ok: false, error: t(`err_${e.code}`) };
    if (e instanceof ForbiddenError) return { ok: false, error: t("err_forbidden") };
    console.error(e);
    return { ok: false, error: t("err_unknown") };
  }
  // Dinamik sahifalar: joriy sahifani yangi ma'lumot bilan qayta chizish (Next 16)
  refresh();
  return res ?? { ok: true };
}

function fields(f: FormData): CounterpartyInput {
  return {
    name: str(f, "name"),
    roles: f.getAll("roles").map(String).filter((r): r is CounterpartyRole => (COUNTERPARTY_ROLES as readonly string[]).includes(r)),
    stir: nullable(f, "stir"), address: nullable(f, "address"), contactPerson: nullable(f, "contactPerson"), phone: nullable(f, "phone"),
    bankName: nullable(f, "bankName"), bankMfo: nullable(f, "bankMfo"), bankAccount: nullable(f, "bankAccount"),
    creditLimit: money(f, "creditLimit"), creditCurrency: str(f, "creditCurrency") || "UZS", paymentTermDays: int(f, "paymentTermDays"),
    note: nullable(f, "note"),
    ...(f.has("managerUserId") ? { managerUserId: str(f, "managerUserId") && str(f, "managerUserId") !== "none" ? str(f, "managerUserId") : null } : {}),
  };
}

export async function saveCounterparty(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("cp");
  const id = str(f, "id");
  return run(async (ctx) => {
    if (!id) return { ok: true, id: (await createCounterparty(db, ctx, fields(f))).id };
    const res = await updateCounterparty(db, ctx, id, fields(f));
    return { ok: true, id, message: res.applied ? t("saved") : t("sentForApproval") };
  });
}

export async function saveContract(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("cp");
  return run(async (ctx) => {
    const input = {
      number: str(f, "number"), signedOn: str(f, "signedOn"), endsOn: nullable(f, "endsOn"),
      amount: money(f, "amount"), currency: str(f, "currency") || "UZS", note: nullable(f, "note"),
    };
    const id = str(f, "id");
    if (!id) {
      await createContract(db, ctx, str(f, "counterpartyId"), input);
      return { ok: true };
    }
    const res = await updateContract(db, ctx, id, input);
    return { ok: true, message: res.applied ? t("saved") : t("sentForApproval") };
  });
}

export async function approveRequest(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("cp");
  return run(async (ctx) => {
    await approveChange(db, ctx, str(f, "id"));
    return { ok: true, message: t("approved") };
  });
}

export async function rejectRequest(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("cp");
  return run(async (ctx) => {
    await rejectChange(db, ctx, str(f, "id"), str(f, "reason"));
    return { ok: true, message: t("rejected") };
  });
}

export async function importFile(_: ActionResult, f: FormData): Promise<ActionResult> {
  const t = await getTranslations("cp");
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: t("err_file") };
  return run(async (ctx) => {
    const res = await importCounterparties(db, ctx, await file.arrayBuffer());
    if (res.ok) return { ok: true, message: t("imported", { count: res.imported }) };
    return {
      ok: false, error: t("importErrors", { count: res.errors.length }),
      details: res.errors.slice(0, 20).map((e) => t("rowCol", { row: e.row, column: e.column, message: e.message })),
    };
  });
}
