// Bosh sahifa va qobiq uchun ma'lumot (server). Faqat R0'da mavjud haqiqiy ma'lumotlar.
import { absenceCalendar, ForbiddenError, headcount, STATUS_LABEL, type Ctx } from "@kaft/core";
import { and, desc, eq, isNull, schema, withTenant } from "@kaft/db";
import { db } from "./server";
import { todayIso } from "./format";

export async function loadShell(ctx: Ctx) {
  return withTenant(db, ctx.tenantId, async (tx) => {
    const [user] = await tx.select({ fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, ctx.userId));
    const roles = await tx.select({ name: schema.roles.name }).from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId)).where(eq(schema.userRoles.userId, ctx.userId));
    const [tenant] = await tx.select({ name: schema.tenants.name, brandName: schema.tenants.brandName }).from(schema.tenants);
    const companies = await tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).orderBy(schema.companies.name);
    const notifications = await tx.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, ctx.userId)).orderBy(desc(schema.notifications.createdAt)).limit(8);
    const unread = await tx.$count(schema.notifications, and(eq(schema.notifications.userId, ctx.userId), isNull(schema.notifications.readAt)));
    return {
      user: { name: user?.fullName ?? "", role: roles.map((r) => r.name).join(", ") },
      brand: tenant?.brandName ?? tenant?.name ?? "Kaft",
      companies,
      notifications: notifications.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt, read: !!n.readAt })),
      unread,
    };
  });
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** «Kim qayerda» va kadr ogohlantirishlari. Kadrlarni ko'rish huquqi bo'lmasa — null (blok ko'rsatilmaydi). */
export async function loadTeam(ctx: Ctx, companyId?: string) {
  const on = todayIso();
  try {
    const counts = await headcount(db, ctx, { on, companyId });
    const cal = await absenceCalendar(db, ctx, { from: on, to: addDays(on, 13) });
    const depts = await withTenant(db, ctx.tenantId, (tx) =>
      tx.select({ id: schema.departments.id, name: schema.departments.name, companyId: schema.departments.companyId }).from(schema.departments));
    const deptName = new Map(depts.map((d) => [d.id, d.name]));
    const inScope = (deptId: string | null) => !companyId || depts.find((d) => d.id === deptId)?.companyId === companyId;
    const absentToday = cal.absences.filter((a) => a.startsOn <= on && (!a.endsOn || on <= a.endsOn) && inScope(a.departmentId));
    return {
      counts,
      staff: Object.entries(counts).filter(([k]) => k !== "terminated" && k !== "not_hired").reduce((s, [, v]) => s + v, 0),
      absentToday: absentToday.map((a) => ({ ...a, department: a.departmentId ? deptName.get(a.departmentId) : undefined })),
      alerts: cal.alerts.filter((a) => inScope(a.departmentId)).map((a) => ({ ...a, department: deptName.get(a.departmentId) ?? "" })),
      labels: STATUS_LABEL,
    };
  } catch (e) {
    if (e instanceof ForbiddenError) return null;
    throw e;
  }
}
