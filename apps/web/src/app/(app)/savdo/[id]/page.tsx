// Sotuv hujjati (SAL-01/05): qatorlar, jami, qaytarishlar; tasdiqlash, bekor qilish, qaytarish.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Clock } from "lucide-react";
import { TradeError } from "@kaft/core";
import { requireCtx } from "@/lib/server";
import { loadSale } from "@/lib/trade";
import { dmy, money, todayIso } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApproveSaleButton, CancelDocSheet, ReturnSheet } from "../forms";
import { DocStatus } from "../doc-list";

export default async function SalePage({ params }: PageProps<"/savdo/[id]">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("trade"), getLocale()]);
  const { id } = await params;
  const data = await loadSale(ctx, id).catch((e) => {
    if (e instanceof TradeError && e.code === "notFound") notFound();
    throw e;
  });
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const { sale, access } = data;
  const live = !sale.cancelledAt;
  const m = (n: number) => money(n, sale.currency, locale);

  return (
    <div className="grid gap-5">
      <Link href="/savdo" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("sales")}</Link>
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t(`kind_${sale.kind}` as "kind_sale")}</p>
          <h1 className="text-2xl font-bold tracking-tight tabular-nums md:text-3xl">{sale.number}</h1>
          <p className="mt-1 text-sm">
            <Link href={`/kontragentlar/${sale.counterpartyId}`} className="font-medium hover:underline">{sale.counterpartyName}</Link>
            <span className="text-muted-foreground"> · {dmy(sale.docDate)} · {t("colDue")}: {dmy(sale.dueDate)}{sale.priceType ? ` · ${t(`price_${sale.priceType}` as "price_retail")}` : ""}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DocStatus status={sale.status} cancelled={!live} />
          {live && sale.status === "pending" && access.salApprove && <ApproveSaleButton id={sale.id} />}
          {live && sale.kind === "sale" && sale.status === "posted" && access.salCreate && <ReturnSheet saleId={sale.id} lines={sale.lines} today={todayIso()} />}
          {live && access.salCancel && <CancelDocSheet id={sale.id} kind="sale" />}
        </div>
      </section>

      {live && sale.status === "pending" && (
        <Alert className="border-warn/50"><Clock /><AlertTitle>{t("pendingTitle")}</AlertTitle><AlertDescription /></Alert>
      )}
      {!live && <p className="text-sm text-bad">{t("cancelled", { reason: sale.cancelReason ?? "" })}</p>}

      {sale.lines.length > 0 && (
        <Card>
          <CardContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fProduct")}</TableHead>
                  <TableHead className="text-right">{t("fQty")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("fPrice")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("fDiscount")}</TableHead>
                  <TableHead className="text-right">{t("fAmount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.productName}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.qty} {l.unit}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{m(l.price)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{l.discountPct ? `${l.discountPct}%` : ""}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{m(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="hidden sm:table-cell">{t("total")}</TableCell>
                  <TableCell className="sm:hidden">{t("total")}</TableCell>
                  <TableCell className="text-right text-base font-bold tabular-nums">{m(sale.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}
      {sale.lines.length === 0 && <p className="text-2xl font-bold tabular-nums">{m(sale.total)}</p>}

      {sale.returns.length > 0 && (
        <Card>
          <CardContent className="grid pt-4">
            <p className="mb-2 text-sm font-semibold">{t("returns")}</p>
            {sale.returns.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 border-t py-2 text-sm first:border-t-0 ${r.cancelledAt ? "line-through opacity-60" : ""}`}>
                <Link href={`/savdo/${r.id}`} className="font-medium tabular-nums hover:underline">{r.number}</Link>
                <span className="text-muted-foreground">{dmy(r.docDate)}</span>
                <span className="ml-auto font-semibold tabular-nums">−{m(r.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {sale.note && <p className="text-sm text-muted-foreground">{sale.note}</p>}
    </div>
  );
}
