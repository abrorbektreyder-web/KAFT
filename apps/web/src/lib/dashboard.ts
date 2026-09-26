// Bosh sahifa va qobiq uchun ma'lumot (server). Faqat R0'da mavjud haqiqiy ma'lumotlar.
import {
  absenceCalendar, balances, can, cashForecast, debtSummary, finAccess, ForbiddenError, headcount, listChangeRequests, listSales, localize, localName,
  profitAndLoss, type Ctx,
} from "@kaft/core";
import { and, desc, eq, isNull, schema, withTenant } from "@kaft/db";
import { db } from "./server";
import { todayIso } from "./format";

/** locale — bildirishnoma matnlari o'quvchi tilida (CORE-08) */
export async function loadShell(ctx: Ctx, locale: string) {
  return withTenant(db, ctx.tenantId, async (tx) => {
    const [user] = await tx.select({ fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, ctx.userId));
    const roles = await tx.select({ name: schema.roles.name }).from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId)).where(eq(schema.userRoles.userId, ctx.userId));
    const [tenant] = await tx.select({ name: schema.tenants.name, brandName: schema.tenants.brandName }).from(schema.tenants);
    const companies = await tx.select({ id: schema.companies.id, name: schema.companies.name, nameRu: schema.companies.nameRu }).from(schema.companies);
    const notifications = await tx.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, ctx.userId)).orderBy(desc(schema.notifications.createdAt)).limit(8);
    const unread = await tx.$count(schema.notifications, and(eq(schema.notifications.userId, ctx.userId), isNull(schema.notifications.readAt)));
    return {
      user: { name: user?.fullName ?? "", role: roles.map((r) => r.name).join(", ") },
      brand: tenant?.brandName ?? tenant?.name ?? "Kaft",
      // Kompaniya nomi o'quvchi tilida, alifbo bo'yicha
      companies: companies.map((c) => ({ id: c.id, name: localName(c, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale)),
      notifications: notifications.map((n) => ({ id: n.id, kind: n.kind, ...localize(n, locale), link: n.link, createdAt: n.createdAt, read: !!n.readAt })),
      unread,
    };
  });
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** «Kim qayerda» va kadr ogohlantirishlari. Kadrlarni ko'rish huquqi bo'lmasa — null (blok ko'rsatilmaydi). */
export async function loadTeam(ctx: Ctx, locale: string, companyId?: string) {
  const on = todayIso();
  try {
    const counts = await headcount(db, ctx, { on, companyId });
    const cal = await absenceCalendar(db, ctx, { from: on, to: addDays(on, 13) });
    const depts = await withTenant(db, ctx.tenantId, (tx) =>
      tx.select({ id: schema.departments.id, name: schema.departments.name, nameRu: schema.departments.nameRu, companyId: schema.departments.companyId }).from(schema.departments));
    const deptName = new Map(depts.map((d) => [d.id, localName(d, locale)]));
    const inScope = (deptId: string | null) => !companyId || depts.find((d) => d.id === deptId)?.companyId === companyId;
    const absentToday = cal.absences.filter((a) => a.startsOn <= on && (!a.endsOn || on <= a.endsOn) && inScope(a.departmentId));
    return {
      counts,
      staff: Object.entries(counts).filter(([k]) => k !== "terminated" && k !== "not_hired").reduce((s, [, v]) => s + v, 0),
      absentToday: absentToday.map((a) => ({ ...a, department: a.departmentId ? deptName.get(a.departmentId) : undefined })),
      alerts: cal.alerts.filter((a) => inScope(a.departmentId)).map((a) => ({ ...a, department: deptName.get(a.departmentId) ?? "" })),
    };
  } catch (e) {
    if (e instanceof ForbiddenError) return null;
    throw e;
  }
}

/** R1 bloklari (pul, qarz, prognoz, oy natijasi, tasdiqlar) — pulni to'liq ko'ra oladiganlarga; aks holda null. */
export async function loadMoneyOverview(ctx: Ctx) {
  const access = await finAccess(db, ctx);
  if (access.view !== "all") return null;
  const on = todayIso();
  const monthStart = `${on.slice(0, 8)}01`;
  const [cpView, salApprove, cpApprove] = await withTenant(db, ctx.tenantId, (tx) => Promise.all([
    can(tx, ctx.userId, "cp", "view"), can(tx, ctx.userId, "sal", "approve"), can(tx, ctx.userId, "cp", "approve"),
  ]));
  const [bal, forecast, debts, pl, pendingSales, changes] = await Promise.all([
    balances(db, ctx, { on }),
    cashForecast(db, ctx, { on }),
    cpView ? debtSummary(db, ctx, { on }) : Promise.resolve([]),
    profitAndLoss(db, ctx, { from: monthStart, to: on }),
    salApprove === "all" ? listSales(db, ctx, { status: "pending" }) : Promise.resolve([]),
    cpApprove === "all" ? listChangeRequests(db, ctx, { status: "pending" }) : Promise.resolve([]),
  ]);
  const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
  return {
    on, monthStart,
    total: bal.total,
    forecast: { firstNegative: forecast.firstNegative, minBalance: forecast.minBalance },
    receivableUzs: sum(debts.map((d) => d.receivableUzs)), overdueUzs: forecast.overdueReceivableUzs ?? 0,
    payableUzs: sum(debts.map((d) => d.payableUzs)),
    revenue: pl.totals.revenue, net: pl.totals.net,
    pendingSales: pendingSales.filter((s) => !s.cancelledAt).length, pendingChanges: changes.length,
  };
}

