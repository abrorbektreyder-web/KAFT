// «Xarid» (PUR-01/05): xaridlar ro'yxati va «kimdan qancha oldik» hisoboti.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Package, Plus } from "lucide-react";
import { requireCtx } from "@/lib/server";
import { loadPurchasesPage } from "@/lib/trade";
import { money, todayIso } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocTable } from "../savdo/doc-list";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function PurchasesPage({ searchParams }: PageProps<"/xarid">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("trade"), getLocale()]);
  const sp = await searchParams;
  const today = todayIso();
  const from = typeof sp.dan === "string" && ISO.test(sp.dan) ? sp.dan : `${today.slice(0, 8)}01`;
  const to = typeof sp.gacha === "string" && ISO.test(sp.gacha) ? sp.gacha : today;
  const by = sp.kesim === "product" ? "product" : "supplier";
  const data = await loadPurchasesPage(ctx, { from, to, by });
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("purchases")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("purchasesSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10"><Link href="/savdo/tovarlar"><Package />{t("products")}</Link></Button>
          {data.access.purCreate && <Button asChild className="h-10"><Link href="/xarid/yangi"><Plus />{t("newPurchase")}</Link></Button>}
        </div>
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("report")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <form className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5"><Label htmlFor="r-from">{t("from")}</Label><Input id="r-from" name="dan" type="date" defaultValue={from} className="h-10" /></div>
            <div className="grid gap-1.5"><Label htmlFor="r-to">{t("to")}</Label><Input id="r-to" name="gacha" type="date" defaultValue={to} className="h-10" /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-by">{t("reportBy")}</Label>
              <select id="r-by" name="kesim" defaultValue={by} className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                <option value="supplier">{t("by_supplier")}</option>
                <option value="product">{t("by_product")}</option>
              </select>
            </div>
            <Button type="submit" variant="outline" className="h-10">{t("show")}</Button>
          </form>
          {!data.report?.length ? <p className="text-sm text-muted-foreground">{t("noData")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{by === "supplier" ? t("colCounterparty") : t("fProduct")}</TableHead>
                  {by === "product" && <TableHead className="text-right">{t("qtySum")}</TableHead>}
                  <TableHead className="hidden text-right sm:table-cell">{t("docs")}</TableHead>
                  <TableHead className="text-right">{t("colTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.report.map((r) => (
                  <TableRow key={`${r.id}-${r.currency}`}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    {by === "product" && <TableCell className="text-right tabular-nums">{r.qty}</TableCell>}
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.docs}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{money(r.total, r.currency, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card><CardContent className="pt-2"><DocTable rows={data.purchases} base="xarid" /></CardContent></Card>
    </div>
  );
}
