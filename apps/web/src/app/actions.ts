"use server";
import { cookies, headers } from "next/headers";
import { eq, schema, withTenant } from "@kaft/db";
import { resolveSession } from "@kaft/auth";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/i18n/request";
import { auth, db } from "@/lib/server";

/** Interfeys tilini almashtiradi; kirgan foydalanuvchida profilga ham yoziladi (Telegram xabarlari uchun). */
export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  try {
    const ctx = await resolveSession(db, auth, await headers(), { requireTwoFactor: false });
    await withTenant(db, ctx.tenantId, (tx) => tx.update(schema.users).set({ locale }).where(eq(schema.users.id, ctx.userId)));
  } catch {
    // Kirmagan (masalan kirish sahifasi) — faqat cookie
  }
}
