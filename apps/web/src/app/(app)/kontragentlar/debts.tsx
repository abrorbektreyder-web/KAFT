// Kontragent kartasidagi ikki tomonlama qarz (hujjatlar va to'lovlardan hisoblangan) — server komponenti.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { DebtSide } from "@kaft/core";
import { dmy, money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function Side({ title, side, base }: { title: string; side: DebtSide; base: "savdo" | "xarid" }) {
  const [t, locale] = await Promise.all([getTranslations("trade"), getLocale()]);
  const totals = Object.entries(side.totals);
  const advance = Object.entries(side.advance);
  const open = side.docs.filter((d) => d.remaining > 0);
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">{title}</p>
      {totals.length === 0 ? <p className="font-medium text-muted-foreground">{t("noDebt")}</p> : (
        <div className="flex flex-wrap items-baseline gap-x-3">
          {totals.map(([cur, v]) => <span key={cur} className="text-xl font-bold tabular-nums">{money(v, cur, locale)}</span>)}
          {side.uzs != null && totals.some(([cur]) => cur !== "UZS") && (
            <span className="text-sm text-muted-foreground tabular-nums">{t("equivalent", { amount: money(side.uzs, "UZS", locale) })}</span>
          )}
        </div>
      )}
      {advance.length > 0 && (
        <p className="text-sm text-muted-foreground">{t("advance")}: {advance.map(([cur, v]) => money(v, cur, locale)).join(", ")}</p>
      )}
      {open.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t pt-2 text-sm">
          <Link href={`/${base}/${d.id}`} className="font-medium tabular-nums hover:underline">{d.number}</Link>
          <span className="text-muted-foreground">{dmy(d.docDate)} · {t("colDue")}: {dmy(d.dueDate)}</span>
          {d.overdue && <span className="font-medium text-bad">{t("overdue", { days: d.overdueDays })}</span>}
          <span className="ml-auto font-semibold tabular-nums">{money(d.remaining, d.currency, locale)}</span>
        </div>
      ))}
    </div>
  );
}

export async function DebtsCard({ debts, action }: { debts: { receivable: DebtSide; payable: DebtSide }; action?: React.ReactNode }) {
  const t = await getTranslations("trade");
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-base">{t("debts")}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <Side title={t("receivable")} side={debts.receivable} base="savdo" />
        <Side title={t("payable")} side={debts.payable} base="xarid" />
      </CardContent>
    </Card>
  );
}
