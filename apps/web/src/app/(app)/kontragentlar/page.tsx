// «Kontragentlar» (CP-01/02, R1): ro'yxat, qidiruv, rol filtri, qo'shish, Excel import, ega uchun tasdiq so'rovlari.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Search, Stamp } from "lucide-react";
import { COUNTERPARTY_ROLES, type CounterpartyRole } from "@kaft/core";
import { requireCtx } from "@/lib/server";
import { loadCounterpartyList } from "@/lib/counterparties";
import { dmy } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CounterpartySheet, DecisionButtons, ImportSheet } from "./forms";
import { ImportDebtsSheet } from "../savdo/forms";
import { ChangeList } from "./changes";

export default async function CounterpartiesPage({ searchParams }: PageProps<"/kontragentlar">) {
  const ctx = await requireCtx();
  const t = await getTranslations("cp");
  const { q, rol } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const role = typeof rol === "string" && (COUNTERPARTY_ROLES as readonly string[]).includes(rol) ? (rol as CounterpartyRole) : undefined;
  const data = await loadCounterpartyList(ctx, { q: query || undefined, role });
  if (!data) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const href = (r?: string) => `/kontragentlar?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(r ? { rol: r } : {}) })}`;

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.access.full && <ImportSheet />}
          {data.access.full && <ImportDebtsSheet />}
          {data.access.create && <CounterpartySheet users={data.users} canAssign={data.access.full} />}
        </div>
      </section>

      {data.access.approver && data.requests.length > 0 && (
        <Card className="border-warn/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Stamp className="size-4" />{t("requests")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {data.requests.map((r) => (
              <div key={r.id} className="grid gap-2 border-t pt-4 first:border-t-0 first:pt-0">
                <p className="font-medium">
                  <Link href={`/kontragentlar/${r.entityId}`} className="hover:underline">{r.entityName}</Link>
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{t("pendingBy", { name: r.requesterName, date: dmy(r.requestedAt.toISOString().slice(0, 10)) })}</span>
                </p>
                <ChangeList changes={r.changes} users={data.users} />
                <DecisionButtons requestId={r.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        <form className="relative max-w-md" role="search">
          {role && <input type="hidden" name="rol" value={role} />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={query} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} className="h-11 bg-card pl-9" />
        </form>
        <nav className="flex flex-wrap gap-2" aria-label={t("colRoles")}>
          {[undefined, ...COUNTERPARTY_ROLES].map((r) => (
            <Link key={r ?? "all"} href={href(r)} aria-current={role === r ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${role === r ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              {r ? t(`role_${r}`) : t("all")}
            </Link>
          ))}
        </nav>
      </div>

      <Card>
        <CardContent className="pt-2">
          {data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("colRoles")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("colStir")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("colPhone")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><Link href={`/kontragentlar/${c.id}`} className="font-medium hover:underline">{c.name}</Link></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">{c.roles.map((r) => <Badge key={r} variant="outline">{t(`role_${r}` as "role_customer")}</Badge>)}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{c.stir}</TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{c.phone}</TableCell>
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
