// Server qatlami: baza, auth va joriy foydalanuvchi konteksti. Faqat serverda import qilinadi.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createDb, type Db } from "@kaft/db";
import { ConsoleMailer, createAuth, resolveSession, TwoFactorRequiredError, UnauthorizedError, type Auth } from "@kaft/auth";

// Dev rejimida qayta yuklanishda ulanishlar ko'payib ketmasin
const g = globalThis as unknown as { kaft?: { db: Db; auth: Auth; mailer: ConsoleMailer } };

function init() {
  const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;
  if (!DATABASE_URL || !BETTER_AUTH_SECRET) throw new Error("DATABASE_URL va BETTER_AUTH_SECRET kerak (.env.local)");
  const { db } = createDb(DATABASE_URL);
  const mailer = new ConsoleMailer();
  const auth = createAuth({ db, mailer, baseURL: BETTER_AUTH_URL ?? "http://localhost:3000", secret: BETTER_AUTH_SECRET });
  return { db, auth, mailer };
}

export const { db, auth, mailer } = (g.kaft ??= init());

/** Himoyalangan sahifa uchun: sessiya → tenant/foydalanuvchi. Yo'q bo'lsa — kirishga, 2FA kerak bo'lsa — sozlashga. */
export async function requireCtx() {
  try {
    // Dev'da vaqtincha o'chirish mumkin: KAFT_REQUIRE_2FA=false. Prod'da qator bo'lmasa — majburiy
    return await resolveSession(db, auth, await headers(), { requireTwoFactor: process.env.KAFT_REQUIRE_2FA !== "false" });
  } catch (e) {
    if (e instanceof TwoFactorRequiredError) redirect("/2fa-sozlash");
    if (e instanceof UnauthorizedError) redirect("/kirish");
    throw e;
  }
}
