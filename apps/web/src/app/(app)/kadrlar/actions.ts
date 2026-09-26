"use server";
// Shtat jadvali: bo'lim × lavozim uchun rejadagi o'rinlar (HR-09).
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ForbiddenError, setStaffingPlan } from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import type { ActionResult } from "@/components/sheet-form";

export async function savePlan(_: ActionResult, f: FormData): Promise<ActionResult> {
  const ctx = await requireCtx();
  const t = await getTranslations("money");
  const planned = Number(String(f.get("planned") ?? "").trim());
  if (!Number.isInteger(planned) || planned < 0) return { ok: false, error: t("err_amount") };
  try {
    await setStaffingPlan(db, ctx, { departmentId: String(f.get("departmentId")), positionId: String(f.get("positionId")), planned });
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: t("err_forbidden") };
    console.error(e);
    return { ok: false, error: t("err_unknown") };
  }
  refresh();
  return { ok: true };
}
