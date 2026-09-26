"use server";
// Kompaniya pasportini saqlash (CORE-12) — faqat ega.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ForbiddenError, saveCompanyProfile, type ProfileVisibility } from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import type { ActionResult } from "@/components/sheet-form";
import { PROFILE_FIELDS } from "./fields";

export async function saveProfile(_: ActionResult, f: FormData): Promise<ActionResult> {
  const ctx = await requireCtx();
  const t = await getTranslations("money");
  try {
    const visibility = String(f.get("visibility") ?? "owner") as ProfileVisibility;
    await saveCompanyProfile(db, ctx, String(f.get("companyId")), {
      ...Object.fromEntries(PROFILE_FIELDS.map((k) => [k, String(f.get(k) ?? "")])), visibility,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: t("err_forbidden") };
    console.error(e);
    return { ok: false, error: t("err_unknown") };
  }
  refresh();
  return { ok: true };
}
