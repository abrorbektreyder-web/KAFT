// Operatsiyalar ro'yxati (CTL-05): foyda-zarardagi modda yoki davr ortidagi pul hujjatlari.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { finAccess, listCategories, listTransactions, localName } from "@kaft/core";
import { db, requireCtx } from "@/lib/server";
import { dmy, money } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExportMenu } from "@/components/export-menu";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function OperationsPage({ searchParams }: PageProps<"/pul/operatsiyalar">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("money"), getLocale()]);
  const access = await finAccess(db, ctx);
  if (!access.view) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const sp = await searchParams;
  const categoryId = typeof sp.modda === "string" && sp.modda ? sp.modda : undefined;
  const from = typeof sp.dan === "string" && ISO.test(sp.dan) ? sp.dan : undefined;
  const to = typeof sp.gacha === "string" && ISO.test(sp.gacha) ? sp.gacha : undefined;
  const [rows, cats] = await Promise.all([listTransactions(db, ctx, { categoryId, from, to, limit: 500 }), listCategories(db, ctx)]);
  const cat = categoryId ? cats.find((c) => c.id === categoryId) : undefined;

  return (
    <div className="grid gap-6">
      <Link href="/pul" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("title")}</Link>
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("opsTitle")}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {cat && <Badge variant="outline">{t("opsCategory", { name: localName(cat, locale) })}</Badge>}
            {(from || to) && <Badge variant="outline">{t("opsPeriod", { from: from ? dmy(from) : "…", to: to ? dmy(to) : "…" })}</Badge>}
            {(cat || from || to) && <Link href="/pul/operatsiyalar" className="text-muted-foreground underline">{t("opsAll")}</Link>}
          </div>
        </div>
        <ExportMenu kind="transactions" />
      </section>
      <Card>
        <CardContent className="grid pt-2">
          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("opsEmpty")}</p>}
          {rows.map((tr) => {
            const label = tr.kind === "transfer" ? t("transfer") : tr.kind === "opening" ? t("opening")
              : tr.categoryName ? localName({ name: tr.categoryName, nameRu: tr.categoryNameRu }, locale) : tr.direction === "in" ? t("income") : t("expense");
            return (
              <div key={tr.id} className={`flex items-center gap-3 border-t py-3 text-sm first:border-t-0 ${tr.cancelledAt ? "line-through opacity-60" : ""}`}>
                <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{dmy(tr.occurredOn)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">{[tr.accountName, tr.basis, tr.note].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${tr.direction === "in" ? "text-ok" : ""}`}>{tr.direction === "in" ? "+" : "−"}{money(tr.amount, tr.currency, locale)}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
