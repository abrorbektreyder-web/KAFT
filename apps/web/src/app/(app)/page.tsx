// Bosh sahifa v1 (PRD 7, R0): kompaniya almashtirgich, «Kim qayerda», eslatmalar, qidiruv.
// Pul/savdo/nazorat bloklari o'z relizida haqiqiy ma'lumot bilan ulanadi — hozir soxta raqam ko'rsatilmaydi.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, BellRing, CheckCircle2, Lock, UserX } from "lucide-react";
import { requireCtx } from "@/lib/server";
import { loadShell, loadTeam } from "@/lib/dashboard";
import { dmy, greetingKey, longDate, num, timeAgo, todayIso } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUSES = ["active", "vacation", "maternity", "sick", "trip"] as const;
const STATUS_COLOR: Record<(typeof STATUSES)[number], string> = {
  active: "bg-[#3B6BF5]", vacation: "bg-[#5E5CE6]", maternity: "bg-[#BF5AF2]", sick: "bg-warn", trip: "bg-[#2E90B8]",
};
const ABSENCE_STATUS = { vacation: "vacation", maternity: "maternity", sick: "sick", business_trip: "trip" } as const;

function Locked({ title, release, hint }: { title: string; release: string; hint: string }) {
  return (
    <Card className="border-dashed bg-muted/40 shadow-none">
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Badge variant="outline" className="gap-1 text-muted-foreground"><Lock className="size-3" />{release}</Badge>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const ctx = await requireCtx();
  const [t, tc, ts, locale] = await Promise.all([getTranslations("home"), getTranslations("common"), getTranslations("status"), getLocale()]);
  const { kompaniya } = await searchParams;
  const companyId = typeof kompaniya === "string" ? kompaniya : undefined;
  const [shell, team] = await Promise.all([loadShell(ctx, locale), loadTeam(ctx, locale, companyId)]);
  const today = todayIso();
  const firstName = shell.user.name.split(" ")[0] ?? "";
  const scope = companyId
    ? shell.companies.find((c) => c.id === companyId)?.name
    : shell.companies.length > 1 ? t("allCompaniesScope", { count: shell.companies.length }) : shell.companies[0]?.name;

  return (
    <div className="grid gap-8">
      <section>
        <p className="text-sm font-medium text-muted-foreground">{longDate(today, locale)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{t(greetingKey(), { name: firstName })}</h1>
        {scope && <p className="mt-1 text-sm text-muted-foreground">{scope}</p>}
      </section>

      {/* R0'da kadr ogohlantirishlari; KPI qizil bayroqlari R2'da qo'shiladi */}
      <section aria-labelledby="attention">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="attention" className="text-lg font-semibold">{t("attention")}</h2>
          <span className="text-sm text-muted-foreground">{t("flagsLater")}</span>
        </div>
        {team && team.alerts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {team.alerts.slice(0, 4).map((a) => (
              <Card key={`${a.departmentId}-${a.from}`} className="border-l-4 border-l-bad">
                <CardContent className="grid gap-1.5 pt-5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-bad uppercase"><AlertTriangle className="size-3.5" />{t("hrTag")}</span>
                  <p className="font-semibold">{t("deptAlert", { department: a.department, count: a.absent })}</p>
                  <p className="text-sm text-muted-foreground">{dmy(a.from)}{a.to !== a.from ? ` – ${dmy(a.to)}` : ""} · {t("deptSize", { count: a.headcount })}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="shadow-none"><CardContent className="flex items-center gap-2 pt-5 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-ok" />{t("allClear")}</CardContent></Card>
        )}
      </section>

      <Locked title={t("money")} release="R1" hint={t("moneyHint")} />

      <section aria-labelledby="directions">
        <h2 id="directions" className="mb-3 text-lg font-semibold">{t("directions")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {team && (
            <Card>
              <CardHeader className="flex items-center justify-between gap-2"><CardTitle className="text-base">{t("team")}</CardTitle><Badge className="bg-ok-soft text-ok">{t("realData")}</Badge></CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">{t("atWorkToday")}</span><span className="text-2xl font-bold tabular-nums">{num(team.counts.active)} / {num(team.staff)}</span></div>
                <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">{t("notAtWork")}</span><span className="text-lg font-semibold tabular-nums">{num(team.staff - team.counts.active)}</span></div>
              </CardContent>
            </Card>
          )}
          <Locked title={t("sales")} release="R1" hint={t("salesHint")} />
          <Locked title={t("finance")} release="R1" hint={t("financeHint")} />
          <Locked title={t("clients")} release="R1" hint={t("clientsHint")} />
          <Locked title={t("operations")} release="R2" hint={t("operationsHint")} />
          <Locked title={t("marketing")} release="R1" hint={t("marketingHint")} />
        </div>
      </section>

      <section aria-label={t("reminders")} className="grid gap-3 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><BellRing className="size-4" />{t("reminders")}</CardTitle>
            {shell.unread > 0 && <Badge className="bg-bad text-white">{shell.unread}</Badge>}
          </CardHeader>
          <CardContent className="grid gap-3">
            {shell.notifications.length === 0 && <p className="text-sm text-muted-foreground">{t("noReminders")}</p>}
            {shell.notifications.slice(0, 5).map((n) => (
              <div key={n.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                <p className="text-xs text-muted-foreground">{n.title} · {timeAgo(new Date(n.createdAt), tc)}</p>
                <p className="text-sm font-medium">{n.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Locked title={t("aTasks")} release="R2" hint={t("aTasksHint")} />
        <Locked title={t("pending")} release="R2" hint={t("pendingHint")} />
      </section>

      {team && (
        <section aria-label={t("whoWhere")} className="grid gap-3 xl:grid-cols-[5fr_7fr]">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{t("whoWhere")}</CardTitle>
              <span className="text-sm text-muted-foreground tabular-nums">{t("employees", { count: num(team.staff) })}</span>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {STATUSES.filter((k) => team.counts[k]).map((k) => (
                  <span key={k} className={STATUS_COLOR[k]} style={{ flex: team.counts[k] }} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STATUSES.map((k) => (
                  <div key={k} className="rounded-lg bg-muted/60 px-3 py-2">
                    <p className="text-xl font-bold tabular-nums">{num(team.counts[k])}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`size-2 rounded-full ${STATUS_COLOR[k]}`} />{ts(k)}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("statusAuto")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base"><UserX className="size-4" />{t("absentToday")}</CardTitle>
              <span className="text-sm text-muted-foreground">{t("people", { count: team.absentToday.length })}</span>
            </CardHeader>
            <CardContent className="grid gap-2.5">
              {team.absentToday.length === 0 && <p className="text-sm text-muted-foreground">{t("allAtWork")}</p>}
              {team.absentToday.slice(0, 8).map((a) => (
                <div key={`${a.employeeId}-${a.startsOn}`} className="flex items-center justify-between gap-3 border-t pt-2.5 text-sm first:border-t-0 first:pt-0">
                  <span className="min-w-0"><span className="font-medium">{a.name}</span>{a.department && <span className="text-muted-foreground"> · {a.department}</span>}</span>
                  <span className="shrink-0 text-right text-muted-foreground">
                    {ts(ABSENCE_STATUS[a.type as keyof typeof ABSENCE_STATUS] ?? "active")}
                    {a.endsOn ? ` · ${t("until", { date: dmy(a.endsOn) })}` : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        {t("lockedFooter")} <Link href="/qidiruv" className="underline">{t("searchHint")}</Link>
      </p>
    </div>
  );
}
