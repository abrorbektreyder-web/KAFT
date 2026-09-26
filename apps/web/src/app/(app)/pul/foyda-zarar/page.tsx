// Boshqaruv foyda-zarar (FIN-10): tushum − tannarx − xarajatlar, oy va kompaniya bo'yicha, so'mda.
import { getLocale, getTranslations } from "next-intl/server";
import { localName } from "@kaft/core";
import { requireCtx } from "@/lib/server";
import { loadPl } from "@/lib/plan";
import { money, todayIso } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyTabs } from "../tabs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

export default async function PlPage({ searchParams }: PageProps<"/pul/foyda-zarar">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("plan"), getLocale()]);
  const sp = await searchParams;
  const today = todayIso();
  const from = typeof sp.dan === "string" && ISO.test(sp.dan) ? sp.dan : `${today.slice(0, 5)}01-01`;
  const to = typeof sp.gacha === "string" && ISO.test(sp.gacha) ? sp.gacha : today;
  const companyId = typeof sp.kompaniya === "string" && sp.kompaniya ? sp.kompaniya : undefined;
  const data = await loadPl(ctx, { from, to, companyId });
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const { pl } = data;
  const m = (n: number) => money(n, "UZS", locale);
  const monthName = (ym: string) => {
    const [y, mo] = ym.split("-").map(Number) as [number, number];
    return locale === "ru"
      ? new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1)))
      : `${UZ_MONTHS[mo - 1]} ${y}`;
  };
  const cols = [["revenue", "revenue"], ["cogs", "cogs"], ["gross", "gross"], ["expenses", "expenses"], ["net", "net"]] as const;

  return (
    <div className="grid gap-6">
      <MoneyTabs active="/pul/foyda-zarar" fullView />
      <section>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("plTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("plSubtitle")}</p>
      </section>

      <form className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5"><Label htmlFor="pl-from">{t("from")}</Label><Input id="pl-from" name="dan" type="date" defaultValue={from} className="h-10" /></div>
        <div className="grid gap-1.5"><Label htmlFor="pl-to">{t("to")}</Label><Input id="pl-to" name="gacha" type="date" defaultValue={to} className="h-10" /></div>
        {data.companies.length > 1 && (
          <div className="grid gap-1.5">
            <Label htmlFor="pl-co">{t("allCompanies")}</Label>
            <select id="pl-co" name="kompaniya" defaultValue={companyId ?? ""} className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm">
              <option value="">{t("allCompanies")}</option>
              {data.companies.map((c) => <option key={c.id} value={c.id}>{localName(c, locale)}</option>)}
            </select>
          </div>
        )}
        <Button type="submit" variant="outline" className="h-10">{t("show")}</Button>
      </form>

      {pl.totals.cogsUnknownLines > 0 && <Alert><AlertDescription>{t("cogsUnknown", { count: pl.totals.cogsUnknownLines })}</AlertDescription></Alert>}
      {pl.missingRates.length > 0 && <Alert><AlertDescription>{t("missingRates", { currencies: pl.missingRates.join(", ") })}</AlertDescription></Alert>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cols.map(([key]) => (
          <Card key={key} className={key === "net" ? "bg-primary text-primary-foreground" : undefined}>
            <CardContent className="grid gap-1 pt-5">
              <span className={`text-sm ${key === "net" ? "opacity-80" : "text-muted-foreground"}`}>{t(key)}</span>
              <span className={`text-xl font-bold tabular-nums ${key !== "net" && pl.totals[key] < 0 ? "text-bad" : ""}`}>{m(pl.totals[key])}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="pt-2">
          {pl.months.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("noPl")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("month")}</TableHead>
                  <TableHead className="text-right">{t("revenue")}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{t("cogs")}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{t("gross")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("expenses")}</TableHead>
                  <TableHead className="text-right">{t("net")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pl.months.map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">{monthName(r.month)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m(r.revenue)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{m(r.cogs)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{m(r.gross)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{m(r.expenses)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${r.net < 0 ? "text-bad" : ""}`}>{m(r.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {pl.months.length > 1 && (
                <TableFooter>
                  <TableRow>
                    <TableCell>{t("net")}</TableCell>
                    <TableCell className="text-right tabular-nums">{m(pl.totals.revenue)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{m(pl.totals.cogs)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{m(pl.totals.gross)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{m(pl.totals.expenses)}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{m(pl.totals.net)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </CardContent>
      </Card>

      {pl.expenses.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("byCategory")}</CardTitle></CardHeader>
          <CardContent className="grid">
            {pl.expenses.map((e) => (
              <div key={e.categoryId} className="flex items-center justify-between gap-3 border-t py-2.5 text-sm first:border-t-0">
                <span>{localName(e, locale)}</span>
                <span className="font-semibold tabular-nums">{m(e.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">{t("plNote")}</p>
    </div>
  );
}
