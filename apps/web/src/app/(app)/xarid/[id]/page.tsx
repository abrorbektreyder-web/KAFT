// Xarid hujjati (PUR-01): qatorlar va jami; bekor qilish.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { TradeError } from "@kaft/core";
import { requireCtx } from "@/lib/server";
import { loadPurchase } from "@/lib/trade";
import { dmy, money } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CancelDocSheet } from "../../savdo/forms";
import { DocStatus } from "../../savdo/doc-list";

export default async function PurchasePage({ params }: PageProps<"/xarid/[id]">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("trade"), getLocale()]);
  const { id } = await params;
  const data = await loadPurchase(ctx, id).catch((e) => {
    if (e instanceof TradeError && e.code === "notFound") notFound();
    throw e;
  });
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const { purchase: p, access } = data;
  const m = (n: number) => money(n, p.currency, locale);

  return (
    <div className="grid gap-5">
      <Link href="/xarid" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("purchases")}</Link>
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t(`kind_${p.kind}` as "kind_purchase")}</p>
          <h1 className="text-2xl font-bold tracking-tight tabular-nums md:text-3xl">{p.number}</h1>
          <p className="mt-1 text-sm">
            <Link href={`/kontragentlar/${p.counterpartyId}`} className="font-medium hover:underline">{p.counterpartyName}</Link>
            <span className="text-muted-foreground"> · {dmy(p.docDate)} · {t("colDue")}: {dmy(p.dueDate)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DocStatus status={p.status} cancelled={!!p.cancelledAt} />
          {!p.cancelledAt && access.purCancel && <CancelDocSheet id={p.id} kind="purchase" />}
        </div>
      </section>
      {p.cancelledAt && <p className="text-sm text-bad">{t("cancelled", { reason: p.cancelReason ?? "" })}</p>}

      {p.lines.length > 0 ? (
        <Card>
          <CardContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fProduct")}</TableHead>
                  <TableHead className="text-right">{t("fQty")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("fPrice")}</TableHead>
                  <TableHead className="text-right">{t("fAmount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.productName}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.qty} {l.unit}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{m(l.price)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{m(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="hidden sm:table-cell">{t("total")}</TableCell>
                  <TableCell colSpan={2} className="sm:hidden">{t("total")}</TableCell>
                  <TableCell className="text-right text-base font-bold tabular-nums">{m(p.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      ) : <p className="text-2xl font-bold tabular-nums">{m(p.total)}</p>}
      {p.note && <p className="text-sm text-muted-foreground">{p.note}</p>}
    </div>
  );
}
