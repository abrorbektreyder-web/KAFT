// Qarzlar ro'yxati (CTL-05: bosh sahifadagi qarz raqami ortidagi hujjatlar) — kontragent bo'yicha, kartaga o'tish bilan.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { debtSummary, ForbiddenError } from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import { money } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportMenu } from "@/components/export-menu";

export default async function DebtsPage() {
  const ctx = await requireCtx();
  const [t, tc, locale] = await Promise.all([getTranslations("trade"), getTranslations("cp"), getLocale()]);
  const rows = await debtSummary(db, ctx).catch((e) => {
    if (e instanceof ForbiddenError) return null;
    throw e;
  });
  if (!rows) return <p className="text-muted-foreground">{tc("noAccess")}</p>;
  const multi = (totals: Record<string, number>) => Object.entries(totals).map(([c, v]) => money(v, c, locale)).join(" · ");
  const sum = (k: "receivableUzs" | "payableUzs") => rows.reduce((s, r) => s + (r[k] ?? 0), 0);

  return (
    <div className="grid gap-6">
      <Link href="/kontragentlar" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{tc("title")}</Link>
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("debtsTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("debtsSubtitle")}</p>
        </div>
        <ExportMenu kind="debts" />
      </section>
      <Card>
        <CardContent className="pt-2">
          {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("noDebt")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colCounterparty")}</TableHead>
                  <TableHead className="text-right">{t("colReceivable")}</TableHead>
                  <TableHead className="text-right">{t("colPayable")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("colOverdue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.counterpartyId}>
                    <TableCell className="max-w-56 truncate"><Link href={`/kontragentlar/${r.counterpartyId}`} className="font-medium hover:underline">{r.name}</Link></TableCell>
                    <TableCell className="text-right tabular-nums">{multi(r.receivable)}</TableCell>
                    <TableCell className="text-right tabular-nums">{multi(r.payable)}</TableCell>
                    <TableCell className={`hidden text-right tabular-nums sm:table-cell ${r.overdueDays ? "text-bad" : ""}`}>{r.overdueDays ? t("days", { count: r.overdueDays }) : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>{t("total")}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{money(sum("receivableUzs"), "UZS", locale)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{money(sum("payableUzs"), "UZS", locale)}</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
