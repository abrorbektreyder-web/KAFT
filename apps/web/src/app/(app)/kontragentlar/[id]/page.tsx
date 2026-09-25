// Kontragent kartasi (CP-02/03/05/08): rekvizitlar, kredit va to'lov, shartnomalar, to'lovlar, kutilayotgan tasdiq.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Clock } from "lucide-react";
import { CpError } from "@kaft/core";
import { requireCtx } from "@/lib/server";
import { loadCounterpartyCard } from "@/lib/counterparties";
import { dmy, money } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractSheet, CounterpartySheet, DecisionButtons } from "../forms";
import { ChangeList } from "../changes";

export default async function CounterpartyPage({ params }: PageProps<"/kontragentlar/[id]">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("cp"), getLocale()]);
  const { id } = await params;
  const data = await loadCounterpartyCard(ctx, id).catch((e) => {
    if (e instanceof CpError && e.code === "notFound") notFound();
    throw e;
  });
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const { card, access } = data;
  const manager = data.users.find((u) => u.id === card.managerUserId)?.name;
  const rows: [string, string | null | undefined][] = [
    [t("f_stir"), card.stir], [t("f_phone"), card.phone], [t("f_address"), card.address], [t("f_contactPerson"), card.contactPerson],
    [t("f_bankName"), card.bankName], [t("f_bankMfo"), card.bankMfo], [t("f_bankAccount"), card.bankAccount], [t("f_managerUserId"), manager],
  ];
  const pending = card.pendingRequest;

  return (
    <div className="grid gap-6">
      <Link href="/kontragentlar" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("title")}</Link>
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{card.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1">{card.roles.map((r) => <Badge key={r} variant="outline">{t(`role_${r}` as "role_customer")}</Badge>)}</div>
        </div>
        {access.update && <CounterpartySheet initial={card} users={data.users} canAssign={access.full} />}
      </section>

      {pending && (
        <Alert className="border-warn/50">
          <Clock />
          <AlertTitle>{t("pendingTitle")}</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>{pending.entityName} · {t("pendingBy", { name: data.requester, date: dmy(pending.requestedAt.toISOString().slice(0, 10)) })}</p>
            <ChangeList changes={pending.changes} users={data.users} currency={card.creditCurrency} />
            {access.approver && <DecisionButtons requestId={pending.id} />}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("requisites")}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="truncate text-sm font-medium tabular-nums">{value || t("empty_value")}</dd>
                </div>
              ))}
            </dl>
            {card.note && <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">{card.note}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("terms")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("f_creditLimit")}</p>
              <p className="text-xl font-semibold tabular-nums">{card.creditLimit != null ? money(card.creditLimit, card.creditCurrency, locale) : t("noLimit")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("f_paymentTermDays")}</p>
              <p className="font-medium">{card.paymentTermDays != null ? t("days", { count: card.paymentTermDays }) : t("empty_value")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("salesLater")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{t("contracts")}</CardTitle>
          {access.create && <ContractSheet counterpartyId={card.id} />}
        </CardHeader>
        <CardContent className="grid">
          {card.contracts.length === 0 && <p className="text-sm text-muted-foreground">{t("noContracts")}</p>}
          {card.contracts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-t py-3 text-sm first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="font-medium">№{c.number} · {dmy(c.signedOn)}</p>
                <p className="text-xs text-muted-foreground">{c.endsOn ? t("until", { date: dmy(c.endsOn) }) : t("open")}</p>
              </div>
              {c.amount != null && <span className="font-semibold tabular-nums">{money(c.amount, c.currency, locale)}</span>}
              {access.update && <ContractSheet counterpartyId={card.id} initial={c} />}
            </div>
          ))}
        </CardContent>
      </Card>

      {card.payments && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("payments")}</CardTitle></CardHeader>
          <CardContent className="grid">
            {card.payments.length === 0 && <p className="text-sm text-muted-foreground">{t("noPayments")}</p>}
            {card.payments.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 border-t py-3 text-sm first:border-t-0 ${p.cancelledAt ? "line-through opacity-60" : ""}`}>
                <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{dmy(p.occurredOn)}</span>
                <span className="min-w-0 flex-1 truncate">{[p.accountName, p.basis, p.note].filter(Boolean).join(" · ")}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${p.direction === "in" ? "text-ok" : ""}`}>
                  {p.direction === "in" ? "+" : "−"}{money(p.amount, p.currency, locale)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
