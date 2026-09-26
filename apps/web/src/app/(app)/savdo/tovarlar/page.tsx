// Tovarlar (oddiy katalog, SAL-02 narx turlari). To'liq ombor — R2.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Search } from "lucide-react";
import { requireCtx } from "@/lib/server";
import { loadProductsPage } from "@/lib/trade";
import { money } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductSheet } from "../forms";

export default async function ProductsPage({ searchParams }: PageProps<"/savdo/tovarlar">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("trade"), getLocale()]);
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const data = await loadProductsPage(ctx, query || undefined);
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const price = (v: number | null, cur: string) => (v != null ? money(v, cur, locale) : t("noPrice"));

  return (
    <div className="grid gap-5">
      <Link href="/savdo" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("sales")}</Link>
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("products")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("productsSubtitle")}</p>
        </div>
        {data.access.productCreate && <ProductSheet />}
      </section>
      <form className="relative max-w-md" role="search">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" defaultValue={query} aria-label={t("fName")} placeholder={`${t("fName")}, SKU`} className="h-11 bg-card pl-9" />
      </form>
      <Card>
        <CardContent className="pt-2">
          {data.products.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("noProducts")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fName")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("fUnit")}</TableHead>
                  <TableHead className="text-right">{t("price_retail")}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{t("price_wholesale")}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{t("price_special")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell><span className="font-medium">{p.name}</span>{p.sku && <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{p.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{price(p.priceRetail, p.currency)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{price(p.priceWholesale, p.currency)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{price(p.priceSpecial, p.currency)}</TableCell>
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
