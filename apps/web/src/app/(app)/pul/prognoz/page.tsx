// Kassa uzilishi prognozi (FIN-07): 30 kun, kunma-kun; manfiy kun — qizil bayroq.
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireCtx } from "@/lib/server";
import { loadForecast } from "@/lib/plan";
import { dmy, money } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyTabs } from "../tabs";

export default async function ForecastPage() {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("plan"), getLocale()]);
  const data = await loadForecast(ctx);
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const f = data.forecast;
  const m = (n: number) => money(n, "UZS", locale);
  // Harakat bo'lgan kunlar va manfiy kunlar ko'rsatiladi — 30 qatorli bo'sh jadval o'rniga
  const rows = f.days.filter((d) => d.inflow || d.outflow || d.balance < 0);

  return (
    <div className="grid gap-6">
      <MoneyTabs active="/pul/prognoz" fullView />
      <section>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("forecastTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("forecastSubtitle")}</p>
      </section>

      {f.firstNegative ? (
        <Alert variant="destructive" className="border-bad/50"><AlertTriangle /><AlertTitle>{t("gapOn", { date: dmy(f.firstNegative) })}</AlertTitle><AlertDescription /></Alert>
      ) : (
        <Alert className="border-ok/40"><CheckCircle2 className="text-ok" /><AlertTitle>{t("noGap")}</AlertTitle><AlertDescription /></Alert>
      )}
      {f.missingRates.length > 0 && <Alert><AlertDescription>{t("missingRates", { currencies: f.missingRates.join(", ") })}</AlertDescription></Alert>}

      <section className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="grid gap-1 pt-5"><span className="text-sm text-muted-foreground">{t("startBalance")}</span><span className="text-xl font-bold tabular-nums">{m(f.start)}</span></CardContent></Card>
        <Card><CardContent className="grid gap-1 pt-5"><span className="text-sm text-muted-foreground">{t("minBalance")}</span><span className={`text-xl font-bold tabular-nums ${f.minBalance < 0 ? "text-bad" : ""}`}>{m(f.minBalance)}</span></CardContent></Card>
        {f.overdueReceivableDocs > 0 && (
          <Card><CardContent className="grid gap-1 pt-5 text-sm text-muted-foreground">
            {t("overdueNote", { count: f.overdueReceivableDocs, amount: f.overdueReceivableUzs != null ? m(f.overdueReceivableUzs) : "—" })}
          </CardContent></Card>
        )}
      </section>

      <Card>
        <CardContent className="pt-2">
          {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("noItems")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colDate")}</TableHead>
                  <TableHead className="text-right">{t("colIn")}</TableHead>
                  <TableHead className="text-right">{t("colOut")}</TableHead>
                  <TableHead className="text-right">{t("colBalance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.date} className={d.balance < 0 ? "bg-bad/5" : undefined}>
                    <TableCell className="tabular-nums">{dmy(d.date)}</TableCell>
                    <TableCell className="text-right text-ok tabular-nums">{d.inflow ? `+${m(d.inflow)}` : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.outflow ? `−${m(d.outflow)}` : ""}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${d.balance < 0 ? "text-bad" : ""}`}>{m(d.balance)}</TableCell>
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
