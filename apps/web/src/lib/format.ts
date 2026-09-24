// O'zbek (lotin) formatlari: sana KK.OO.YYYY, raqam 1 234 567 (PRD 10).
const TZ = "Asia/Tashkent";
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

/** Toshkent vaqti bo'yicha bugungi sana (YYYY-MM-DD) */
export const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

export function tashkentNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23", weekday: "short" })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour) };
}

export function greeting() {
  const h = tashkentNow().hour;
  return h < 5 ? "Xayrli tun" : h < 12 ? "Xayrli tong" : h < 18 ? "Xayrli kun" : "Xayrli kech";
}

/** «Payshanba, 24-sentabr» */
export function longDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}`;
}

export const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export const num = (n: number) => new Intl.NumberFormat("ru-RU").format(n).replace(/ /g, " ");

export function timeAgo(date: Date) {
  const min = Math.round((Date.now() - date.getTime()) / 60_000);
  if (min < 1) return "hozir";
  if (min < 60) return `${min} daq oldin`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} soat oldin`;
  return dmy(date.toISOString().slice(0, 10));
}
