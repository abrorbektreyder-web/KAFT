// Formatlar (PRD 10): sana KK.OO.YYYY, raqam 1 234 567, vaqt zonasi Asia/Tashkent; uz/ru.
const TZ = "Asia/Tashkent";
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

/** Toshkent vaqti bo'yicha bugungi sana (YYYY-MM-DD) */
export const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** Kun qismiga qarab salomlashish kaliti (home.greet*) */
export function greetingKey(): "greetNight" | "greetMorning" | "greetDay" | "greetEvening" {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 5 ? "greetNight" : h < 12 ? "greetMorning" : h < 18 ? "greetDay" : "greetEvening";
}

/** uz: «Payshanba, 24-sentabr» · ru: «Четверг, 24 сентября» */
export function longDate(iso: string, locale: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (locale === "ru") {
    const s = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return `${UZ_WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}-${UZ_MONTHS[d.getUTCMonth()]}`;
}

export const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export const num = (n: number) => new Intl.NumberFormat("ru-RU").format(n).replace(/ /g, " ");

/** Nisbiy vaqt; t — common tarjimasi (timeNow, minutesAgo, hoursAgo) */
export function timeAgo(date: Date, t: (key: "timeNow" | "minutesAgo" | "hoursAgo", v?: { n: number }) => string) {
  const min = Math.round((Date.now() - date.getTime()) / 60_000);
  if (min < 1) return t("timeNow");
  if (min < 60) return t("minutesAgo", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("hoursAgo", { n: h });
  return dmy(new Date(date.getTime() + 5 * 3_600_000).toISOString().slice(0, 10));
}
