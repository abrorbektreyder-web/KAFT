// To'lov kalendari (FIN-06): 30 kunlik kutilayotgan kirim/chiqim va rejali to'lovlar.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireCtx } from "@/lib/server";
import { loadCalendar } from "@/lib/plan";
import { dmy, money, todayIso } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyTabs } from "../tabs";
import { ScheduleSheet, StopScheduleButton } from "../plan-forms";

export default async function CalendarPage() {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("plan"), getLocale()]);
  const data = await loadCalendar(ctx, locale);
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const dates = [...new Set(data.items.map((i) => i.date))];

  return (
    <div className="grid gap-6">
      <MoneyTabs active="/pul/kalendar" fullView />
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("calendarTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("calendarSubtitle")} · {dmy(data.from)} – {dmy(data.to)}</p>
        </div>
        {data.access.manage && <ScheduleSheet categories={data.categories} today={todayIso()} />}
      </section>

      {data.overdueReceivable.docs > 0 && (
        <Alert><AlertDescription>
          {t("overdueNote", { count: data.overdueReceivable.docs, amount: data.overdueReceivable.uzs != null ? money(data.overdueReceivable.uzs, "UZS", locale) : "—" })}
        </AlertDescription></Alert>
      )}

      <Card>
        <CardContent className="grid pt-2">
          {dates.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("noItems")}</p>}
          {dates.map((d) => (
            <div key={d} className="grid gap-2 border-t py-3 first:border-t-0">
              <p className="text-sm font-semibold tabular-nums">{dmy(d)}</p>
              {data.items.filter((i) => i.date === d).map((i, n) => (
                <div key={`${d}-${n}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <Badge variant="outline" className="text-muted-foreground">{t(`src_${i.source}`)}</Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {i.counterpartyId && i.source !== "scheduled" ? <Link href={`/kontragentlar/${i.counterpartyId}`} className="hover:underline">{i.name}</Link> : i.name}
                    {i.docNumber && <span className="text-muted-foreground"> · {i.docNumber}</span>}
                    {i.overdue && <span className="text-bad"> · {t("overdueToday")}</span>}
                  </span>
                  <span className={`font-semibold tabular-nums ${i.direction === "in" ? "text-ok" : ""}`}>
                    {i.direction === "in" ? "+" : "−"}{money(i.amount, i.currency, locale)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("schedules")}</CardTitle></CardHeader>
        <CardContent className="grid">
          {data.schedules.length === 0 && <p className="text-sm text-muted-foreground">{t("noSchedules")}</p>}
          {data.schedules.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2.5 text-sm first:border-t-0">
              <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
              <span className="text-muted-foreground">{t(`rep_${s.repeat}` as "rep_once")} · {dmy(s.startsOn)}{s.endsOn ? ` – ${dmy(s.endsOn)}` : ""}</span>
              <span className={`font-semibold tabular-nums ${s.direction === "in" ? "text-ok" : ""}`}>{s.direction === "in" ? "+" : "−"}{money(s.amount, s.currency, locale)}</span>
              {data.access.manage && <StopScheduleButton id={s.id} />}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
