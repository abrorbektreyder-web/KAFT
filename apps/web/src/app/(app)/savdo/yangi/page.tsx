// Yangi sotuv hujjati (SAL-01/02).
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { requireCtx } from "@/lib/server";
import { loadDocForm } from "@/lib/trade";
import { todayIso } from "@/lib/format";
import { DocForm } from "../doc-form";

export default async function NewSalePage() {
  const ctx = await requireCtx();
  const t = await getTranslations("trade");
  const data = await loadDocForm(ctx, "sale");
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  return (
    <div className="grid gap-5">
      <Link href="/savdo" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("sales")}</Link>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("newSale")}</h1>
      {data.products.length === 0 ? <p className="text-muted-foreground">{t("noProducts")}</p> : <DocForm mode="sale" {...data} today={todayIso()} />}
    </div>
  );
}
