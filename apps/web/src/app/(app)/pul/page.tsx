// «Pul» (FIN-01…05, R1): qoldiq har kassa, kompaniya va jami bo'yicha (so'mda va $ ekvivalentida), kirim/chiqim, o'tkazma.
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, Wallet } from "lucide-react";
import { requireCtx } from "@/lib/server";
import { loadMoney } from "@/lib/money";
import { dmy, money, todayIso } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountSheet, CancelSheet, TransactionSheet, TransferSheet } from "./forms";
import { MoneyTabs } from "./tabs";

export default async function MoneyPage({ searchParams }: PageProps<"/pul">) {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("money"), getLocale()]);
  const { kompaniya } = await searchParams;
  const data = await loadMoney(ctx, locale, typeof kompaniya === "string" ? kompaniya : undefined);
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;

  const today = todayIso();
  const open = data.accounts.filter((a) => !a.isArchived);
  const canWrite = !!data.access.create && open.length > 0;
  const rateLine = Object.entries(data.rates).filter(([c, r]) => c !== "UZS" && r)
    .map(([c, r]) => `${money(100, c, locale)} = ${money(Math.round(Number(r) * 100), "UZS", locale)}`).join(" · ");

  return (
    <div className="grid gap-6">
      <MoneyTabs active="/pul" fullView={data.access.view === "all"} />
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("asOf", { date: dmy(data.on) })}{rateLine && <> · {t("cbuRates")}: <span className="tabular-nums">{rateLine}</span></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <>
              <TransactionSheet direction="in" accounts={open} categories={data.categories} counterparties={data.counterparties} docs={data.docs} today={today} />
              <TransactionSheet direction="out" accounts={open} categories={data.categories} counterparties={data.counterparties} docs={data.docs} today={today} />
              {open.length > 1 && <TransferSheet accounts={open} today={today} />}
            </>
          )}
          {data.access.manage && <AccountSheet companies={data.allCompanies} users={data.users} today={today} />}
        </div>
      </section>

      {data.missingRates.length > 0 && (
        <Alert><AlertTriangle /><AlertDescription>{t("missingRates", { currencies: data.missingRates.join(", ") })}</AlertDescription></Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("total")}>
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="grid gap-1 pt-5">
            <span className="text-sm opacity-80">{t("total")}</span>
            <span className="text-2xl font-bold tabular-nums">{data.total.uzs != null ? money(data.total.uzs, "UZS", locale) : "—"}</span>
            {data.total.usd != null && <span className="text-sm tabular-nums opacity-80">{t("approxUsd", { amount: money(data.total.usd, "USD", locale) })}</span>}
          </CardContent>
        </Card>
        {data.companies.length > 1 && data.companies.map((c) => (
          <Card key={c.companyId}>
            <CardContent className="grid gap-1 pt-5">
              <span className="truncate text-sm text-muted-foreground">{c.name}</span>
              <span className="text-xl font-semibold tabular-nums">{c.uzs != null ? money(c.uzs, "UZS", locale) : "—"}</span>
              {c.usd != null && <span className="text-sm text-muted-foreground tabular-nums">{t("approxUsd", { amount: money(c.usd, "USD", locale) })}</span>}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" />{t("accounts")}</CardTitle></CardHeader>
        <CardContent>
          {data.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noAccounts")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colAccount")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("colCompany")}</TableHead>
                  <TableHead className="text-right">{t("colBalance")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("colUzs")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accounts.map((a) => (
                  <TableRow key={a.id} className={a.isArchived ? "opacity-60" : undefined}>
                    <TableCell>
                      <span className="font-medium">{a.name}</span>
                      <Badge variant="outline" className="ml-2 text-muted-foreground">{t(`type_${a.type}`)}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{a.companyName}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${a.balance < 0 ? "text-bad" : ""}`}>{money(a.balance, a.currency, locale)}</TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                      {a.currency === "UZS" ? "" : a.uzs != null ? money(a.uzs, "UZS", locale) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("recent")}</CardTitle></CardHeader>
        <CardContent className="grid">
          {data.transactions.length === 0 && <p className="text-sm text-muted-foreground">{t("noTransactions")}</p>}
          {data.transactions.map((tr) => {
            const label = tr.kind === "transfer" ? t("transfer") : tr.kind === "opening" ? t("opening") : tr.category ?? (tr.direction === "in" ? t("income") : t("expense"));
            const cancelled = !!tr.cancelledAt;
            return (
              <div key={tr.id} className="flex items-center gap-3 border-t py-3 text-sm first:border-t-0">
                <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{dmy(tr.occurredOn)}</span>
                <div className={`min-w-0 flex-1 ${cancelled ? "line-through opacity-60" : ""}`}>
                  <p className="truncate font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">{[tr.accountName, tr.basis, tr.note].filter(Boolean).join(" · ")}</p>
                  {cancelled && <p className="text-xs text-bad no-underline">{t("cancelled", { reason: tr.cancelReason ?? "" })}</p>}
                </div>
                <span className={`shrink-0 text-right font-semibold tabular-nums ${cancelled ? "text-muted-foreground line-through" : tr.direction === "in" ? "text-ok" : ""}`}>
                  {tr.direction === "in" ? "+" : "−"}{money(tr.amount, tr.currency, locale)}
                </span>
                {data.access.cancel && !cancelled ? <CancelSheet id={tr.id} /> : <span className="size-8 shrink-0" />}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
