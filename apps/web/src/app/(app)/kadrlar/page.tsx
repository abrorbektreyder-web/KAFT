// Shtat jadvali (HR-09): bo'lim bo'yicha rejadagi va haqiqiy lavozimlar, bo'sh o'rinlar.
import { getLocale, getTranslations } from "next-intl/server";
import { can, ForbiddenError, localName, staffingReport } from "@kaft/core";
import { schema, withTenant } from "@kaft/db";
import { db, requireCtx } from "@/lib/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlanSheet } from "./form";

export default async function StaffingPage() {
  const ctx = await requireCtx();
  const [t, locale] = await Promise.all([getTranslations("staffing"), getLocale()]);
  const report = await staffingReport(db, ctx).catch((e) => {
    if (e instanceof ForbiddenError) return null;
    throw e;
  });
  if (!report) return <p className="text-muted-foreground">{t("noAccess")}</p>;
  const { canEdit, departments, positions } = await withTenant(db, ctx.tenantId, async (tx) => ({
    canEdit: (await can(tx, ctx.userId, "hr", "update")) === "all",
    departments: await tx.select({ id: schema.departments.id, name: schema.departments.name, nameRu: schema.departments.nameRu }).from(schema.departments),
    positions: await tx.select({ id: schema.positions.id, name: schema.positions.name, nameRu: schema.positions.nameRu }).from(schema.positions),
  }));
  const named = (xs: { id: string; name: string; nameRu: string | null }[]) =>
    xs.map((x) => ({ id: x.id, name: localName(x, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canEdit && <PlanSheet departments={named(departments)} positions={named(positions)} />}
      </section>
      <Card>
        <CardContent className="pt-2">
          {report.rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colDept")}</TableHead>
                  <TableHead>{t("colPosition")}</TableHead>
                  <TableHead className="text-right">{t("colPlanned")}</TableHead>
                  <TableHead className="text-right">{t("colActual")}</TableHead>
                  <TableHead className="text-right">{t("colVacancies")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("colOver")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r) => (
                  <TableRow key={`${r.departmentId}-${r.positionId}`}>
                    <TableCell className="max-w-40 truncate text-muted-foreground">{localName({ name: r.departmentName, nameRu: r.departmentNameRu }, locale)}</TableCell>
                    <TableCell className="font-medium">{localName({ name: r.positionName, nameRu: r.positionNameRu }, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.planned}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.actual}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${r.vacancies ? "text-warn" : ""}`}>{r.vacancies || ""}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.over || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>{t("total")}</TableCell>
                  <TableCell className="text-right tabular-nums">{report.totals.planned}</TableCell>
                  <TableCell className="text-right tabular-nums">{report.totals.actual}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{report.totals.vacancies}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{report.totals.over}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{t("maternityNote")}</p>
    </div>
  );
}
