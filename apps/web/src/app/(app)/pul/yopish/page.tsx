// Kunlik kassa yopish (FIN-08): kassir haqiqiy qoldiqni kiritadi, farq bo'lsa egaga xabar.
import { getLocale, getTranslations } from "next-intl/server";
import { requireCtx } from "@/lib/server";
import { loadClosing } from "@/lib/plan";
import { dmy, money, todayIso } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyTabs } from "../tabs";
import { CloseDayForm } from "../plan-forms";

export default async function ClosingPage() {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("plan"), getLocale()]);
  const data = await loadClosing(ctx);
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;

  return (
    <div className="grid gap-6">
      <MoneyTabs active="/pul/yopish" fullView={data.access.view === "all"} />
      <section>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("closingTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("closingSubtitle")}</p>
      </section>
      {data.access.create && (
        <Card><CardContent className="pt-5">
          {data.accounts.length ? <CloseDayForm accounts={data.accounts} today={todayIso()} /> : <p className="text-sm text-muted-foreground">{t("noAccounts")}</p>}
        </CardContent></Card>
      )}
      <Card>
        <CardContent className="pt-2">
          {data.closings.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("noClosings")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colDate")}</TableHead>
                  <TableHead>{t("fAccount")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("colCounted")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("colSystem")}</TableHead>
                  <TableHead className="text-right">{t("colDiff")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.closings.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="tabular-nums">{dmy(c.date)}</TableCell>
                    <TableCell className="max-w-40 truncate">{c.accountName}{c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{money(c.counted, c.currency, locale)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{money(c.system, c.currency, locale)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${c.diff < 0 ? "text-bad" : c.diff > 0 ? "text-warn" : "text-ok"}`}>
                      {c.diff > 0 ? "+" : ""}{money(c.diff, c.currency, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
