// Bosh sahifa v1 (PRD 7, R0): kompaniya almashtirgich, «Kim qayerda», eslatmalar, qidiruv.
// Pul/savdo/nazorat bloklari o'z relizida haqiqiy ma'lumot bilan ulanadi — hozir soxta raqam ko'rsatilmaydi.
import Link from "next/link";
import { AlertTriangle, BellRing, CheckCircle2, Lock, UserX } from "lucide-react";
import { requireCtx } from "@/lib/server";
import { loadShell, loadTeam } from "@/lib/dashboard";
import { dmy, greeting, longDate, num, timeAgo, todayIso } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_COLOR: Record<string, string> = {
  active: "bg-[#3B6BF5]", vacation: "bg-[#5E5CE6]", maternity: "bg-[#BF5AF2]", sick: "bg-warn", trip: "bg-[#2E90B8]",
};

function Locked({ title, release, hint, className = "" }: { title: string; release: string; hint: string; className?: string }) {
  return (
    <Card className={`border-dashed bg-muted/40 shadow-none ${className}`}>
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
  const { kompaniya } = await searchParams;
  const companyId = typeof kompaniya === "string" ? kompaniya : undefined;
  const [shell, team] = await Promise.all([loadShell(ctx), loadTeam(ctx, companyId)]);
  const today = todayIso();
  const firstName = shell.user.name.split(" ")[0];
  const scope = companyId ? shell.companies.find((c) => c.id === companyId)?.name : shell.companies.length > 1 ? `Hammasi: ${shell.companies.length} ta kompaniya` : shell.companies[0]?.name;

  return (
    <div className="grid gap-8">
      <section>
        <p className="text-sm font-medium text-muted-foreground">{longDate(today)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{greeting()}, {firstName}</h1>
        {scope && <p className="mt-1 text-sm text-muted-foreground">{scope}</p>}
      </section>

      {/* Diqqat talab qiladi — R0'da kadr ogohlantirishlari; KPI qizil bayroqlari R2'da qo'shiladi */}
      <section aria-labelledby="attention">
        <div className="mb-3 flex items-baseline gap-3">
          <h2 id="attention" className="text-lg font-semibold">Diqqat talab qiladi</h2>
          <span className="text-sm text-muted-foreground">Qizil bayroqlar (KPI) — R2 relizida</span>
        </div>
        {team && team.alerts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {team.alerts.slice(0, 4).map((a) => (
              <Card key={`${a.departmentId}-${a.from}`} className="border-l-4 border-l-bad">
                <CardContent className="grid gap-1.5 pt-5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-bad uppercase"><AlertTriangle className="size-3.5" />Kadrlar</span>
                  <p className="font-semibold">{a.department}: bir vaqtda {a.absent} kishi yo‘q</p>
                  <p className="text-sm text-muted-foreground">{dmy(a.from)}{a.to !== a.from ? ` – ${dmy(a.to)}` : ""} · bo‘limda {a.headcount} kishi</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="shadow-none"><CardContent className="flex items-center gap-2 pt-5 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-ok" />Hozircha diqqat talab qiladigan narsa yo‘q</CardContent></Card>
        )}
      </section>

      <Locked title="Pul" release="R1" hint="Jami qoldiq (so‘m va $), necha oyga yetadi, 30 kunlik prognoz va eng yaqin kassa uzilishi — kassalar moduli bilan." />

      <section aria-labelledby="directions">
        <h2 id="directions" className="mb-3 text-lg font-semibold">Yo‘nalishlar</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {team ? (
            <Card>
              <CardHeader className="flex items-center justify-between"><CardTitle className="text-base">Jamoa</CardTitle><Badge className="bg-ok-soft text-ok">Haqiqiy ma’lumot</Badge></CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Bugun ishda</span><span className="text-2xl font-bold tabular-nums">{num(team.counts.active)} / {num(team.staff)}</span></div>
                <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Ishda emas</span><span className="text-lg font-semibold tabular-nums">{num(team.staff - team.counts.active)}</span></div>
              </CardContent>
            </Card>
          ) : null}
          <Locked title="Sotuv" release="R1" hint="Oylik tushum reja-fakt, o‘rtacha chek, menejerlar." />
          <Locked title="Moliya" release="R1" hint="Yalpi marja, sof foyda, xarajat/byudjet." />
          <Locked title="Mijozlar" release="R1" hint="30+ kunlik qarz, ketayotgan mijozlar, kredit limiti." />
          <Locked title="Operatsiya" release="R2" hint="Minimal qoldiq, o‘lik tovar, kassa farqlari." />
          <Locked title="Marketing" release="R1" hint="amoCRM/Bitrix24 ulanganda: lidlar, konversiya." />
        </div>
      </section>

      <section aria-label="Ish navbati" className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><BellRing className="size-4" />Eslatmalar</CardTitle>
            {shell.unread > 0 && <Badge className="bg-bad text-white">{shell.unread}</Badge>}
          </CardHeader>
          <CardContent className="grid gap-3">
            {shell.notifications.length === 0 && <p className="text-sm text-muted-foreground">Yangi eslatma yo‘q. Tug‘ilgan kun, sinov, shartnoma va pasport muddatlari shu yerda chiqadi.</p>}
            {shell.notifications.slice(0, 5).map((n) => (
              <div key={n.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                <p className="text-xs text-muted-foreground">{n.title} · {timeAgo(new Date(n.createdAt))}</p>
                <p className="text-sm font-medium">{n.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Locked title="A-vazifalar" release="R2" hint="Muhim va shoshilinch topshiriqlar; bir mas’ulga 3 tadan ko‘p emas." />
        <Locked title="Tasdiq kutmoqda" release="R2" hint="Xarajat, chegirma, avans, ta’til so‘rovlari — bir bosishda tasdiqlash." />
      </section>

      {team && (
        <section aria-label="Kim qayerda" className="grid gap-3 xl:grid-cols-[5fr_7fr]">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">Kim qayerda</CardTitle>
              <span className="text-sm text-muted-foreground tabular-nums">{num(team.staff)} xodim</span>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {(["active", "vacation", "maternity", "sick", "trip"] as const).filter((k) => team.counts[k]).map((k) => (
                  <span key={k} className={STATUS_COLOR[k]} style={{ flex: team.counts[k] }} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(["active", "vacation", "maternity", "sick", "trip"] as const).map((k) => (
                  <div key={k} className="rounded-lg bg-muted/60 px-3 py-2">
                    <p className="text-xl font-bold tabular-nums">{num(team.counts[k])}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`size-2 rounded-full ${STATUS_COLOR[k]}`} />{team.labels[k]}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Holatlar kadr hodisalaridan avtomatik. Kechikishlar — davomat moduli bilan (R2).</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><UserX className="size-4" />Bugun yo‘qlar</CardTitle>
              <span className="text-sm text-muted-foreground">{team.absentToday.length} kishi</span>
            </CardHeader>
            <CardContent className="grid gap-2.5">
              {team.absentToday.length === 0 && <p className="text-sm text-muted-foreground">Bugun hamma ishda.</p>}
              {team.absentToday.slice(0, 8).map((a) => (
                <div key={`${a.employeeId}-${a.startsOn}`} className="flex items-center justify-between gap-3 border-t pt-2.5 text-sm first:border-t-0 first:pt-0">
                  <span className="min-w-0"><span className="font-medium">{a.name}</span>{a.department && <span className="text-muted-foreground"> · {a.department}</span>}</span>
                  <span className="shrink-0 text-muted-foreground">{team.labels[a.type === "business_trip" ? "trip" : (a.type as "vacation" | "maternity" | "sick")]}{a.endsOn ? ` · ${dmy(a.endsOn)} gacha` : ""}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Qulflangan bloklar o‘z relizida haqiqiy ma’lumot bilan ochiladi. <Link href="/qidiruv" className="underline">Qidiruv</Link> — xodim va hujjatlar bo‘yicha.
      </p>
    </div>
  );
}
