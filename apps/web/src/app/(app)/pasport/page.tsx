// Kompaniya pasporti (CORE-12): strategik tavsif; kim ko'rishi maxfiylik darajasiga bog'liq.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { can, ForbiddenError, getCompanyProfile, localName } from "@kaft/core";
import { schema, withTenant } from "@kaft/db";
import { db, requireCtx } from "@/lib/server";
import { dmy } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileSheet } from "./form";
import { PROFILE_FIELDS } from "./fields";

export default async function PassportPage({ searchParams }: PageProps<"/pasport">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("passport"), getLocale()]);
  const { kompaniya } = await searchParams;
  const { companies, canEdit } = await withTenant(db, ctx.tenantId, async (tx) => ({
    companies: await tx.select({ id: schema.companies.id, name: schema.companies.name, nameRu: schema.companies.nameRu }).from(schema.companies),
    canEdit: (await can(tx, ctx.userId, "settings", "update")) === "all",
  }));
  const list = companies.map((c) => ({ id: c.id, name: localName(c, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale));
  const company = list.find((c) => c.id === kompaniya) ?? list[0];
  if (!company) return <p className="text-muted-foreground">{t("empty")}</p>;
  const profile = await getCompanyProfile(db, ctx, company.id).catch((e) => {
    if (e instanceof ForbiddenError) return "forbidden" as const;
    throw e;
  });

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canEdit && profile !== "forbidden" && <ProfileSheet companyId={company.id} profile={profile} />}
      </section>
      {list.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label={t("company")}>
          {list.map((c) => (
            <Link key={c.id} href={`/pasport?kompaniya=${c.id}`} aria-current={c.id === company.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${c.id === company.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      {profile === "forbidden" ? (
        <Card className="border-dashed shadow-none"><CardContent className="flex items-center gap-2 pt-5 text-sm text-muted-foreground"><Lock className="size-4" />{t("noAccess")}</CardContent></Card>
      ) : !profile ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline"><Lock className="size-3" />{t(`vis_${profile.visibility as "owner"}`)}</Badge>
            <span>{t("updated", { date: dmy(profile.updatedAt.toISOString().slice(0, 10)) })}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {PROFILE_FIELDS.filter((k) => profile[k]).map((k) => (
              <Card key={k} className={k === "strategy" ? "md:col-span-2" : undefined}>
                <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t(k)}</CardTitle></CardHeader>
                <CardContent className="text-sm whitespace-pre-line">{profile[k]}</CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
