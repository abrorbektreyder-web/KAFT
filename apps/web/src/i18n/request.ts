// CORE-08: o'zbek (lotin) va rus interfeysi — foydalanuvchi o'zi tanlaydi (cookie), standart — o'zbek.
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["uz", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "kaft-locale";

export async function resolveLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (saved === "uz" || saved === "ru") return saved;
  // Tanlov yo'q — brauzer tili rus bo'lsa rus, aks holda o'zbek
  const accept = (await headers()).get("accept-language") ?? "";
  return /^ru\b/i.test(accept) ? "ru" : "uz";
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, timeZone: "Asia/Tashkent", messages: (await import(`../../messages/${locale}.json`)).default };
});
