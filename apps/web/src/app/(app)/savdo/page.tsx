// «Savdo» (SAL-01/05, CP-05): sotuvlar ro'yxati, ega uchun kredit limitidan oshgan sotuvlar.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Package, Plus, Stamp } from "lucide-react";
import { requireCtx } from "@/lib/server";
import { loadSalesPage } from "@/lib/trade";
import { dmy, money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApproveSaleButton } from "./forms";
import { DocTable } from "./doc-list";
import { ExportMenu } from "@/components/export-menu";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function SalesPage({ searchParams }: PageProps<"/savdo">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("trade"), getLocale()]);
  const sp = await searchParams;
  const from = typeof sp.dan === "string" && ISO.test(sp.dan) ? sp.dan : undefined;
  const to = typeof sp.gacha === "string" && ISO.test(sp.gacha) ? sp.gacha : undefined;
  const data = await loadSalesPage(ctx, { from, to });
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const pending = data.sales.filter((s) => s.status === "pending" && !s.cancelledAt);

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("sales")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {from || to ? <>{t("salesPeriod", { from: from ? dmy(from) : "…", to: to ? dmy(to) : "…" })} · <Link href="/savdo" className="underline">{t("sales")}</Link></> : t("salesSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportMenu kind="sales" />
          <Button asChild variant="outline" className="h-10"><Link href="/savdo/tovarlar"><Package />{t("products")}</Link></Button>
          {data.access.salCreate && <Button asChild className="h-10"><Link href="/savdo/yangi"><Plus />{t("newSale")}</Link></Button>}
        </div>
      </section>

      {data.access.salApprove && pending.length > 0 && (
        <Card className="border-warn/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Stamp className="size-4" />{t("pendingList")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {pending.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 border-t pt-3 first:border-t-0 first:pt-0">
                <Link href={`/savdo/${s.id}`} className="font-medium hover:underline">{s.number}</Link>
                <span className="text-sm text-muted-foreground">{s.counterpartyName} · {dmy(s.docDate)}</span>
                <span className="ml-auto font-semibold tabular-nums">{money(s.total, s.currency, locale)}</span>
                <ApproveSaleButton id={s.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="pt-2"><DocTable rows={data.sales} base="savdo" /></CardContent></Card>
    </div>
  );
}
