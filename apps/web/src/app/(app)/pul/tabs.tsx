// «Pul» bo'limi ichki navigatsiyasi (server komponenti). Kalendar, prognoz, foyda-zarar — pulni to'liq ko'ra oladiganlarga.
import Link from "next/link";
import { getTranslations } from "next-intl/server";

const TABS = [
  { href: "/pul", key: "tabBalance", all: false },
  { href: "/pul/kalendar", key: "tabCalendar", all: true },
  { href: "/pul/prognoz", key: "tabForecast", all: true },
  { href: "/pul/yopish", key: "tabClosing", all: false },
  { href: "/pul/foyda-zarar", key: "tabPl", all: true },
] as const;

export async function MoneyTabs({ active, fullView }: { active: (typeof TABS)[number]["href"]; fullView: boolean }) {
  const t = await getTranslations("plan");
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0" aria-label={t("tabBalance")}>
      {TABS.filter((x) => fullView || !x.all).map((x) => (
        <Link key={x.href} href={x.href} aria-current={active === x.href ? "page" : undefined}
          className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${active === x.href ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {t(x.key)}
        </Link>
      ))}
    </nav>
  );
}
