// CORE-12: kompaniya pasporti (strategik ma'lumot) va HR-09: shtat jadvali.
import { and, eq, isNull, schema, sql, withTenant, type Db } from '@kaft/db';
import { authorize, can, deny, type Ctx } from './permissions.ts';
import { statusOn, type HrEvent } from './hr-events.ts';

// ---------------------------------------------------------------- kompaniya pasporti

export type ProfileVisibility = 'owner' | 'managers' | 'all';
export interface CompanyProfileInput {
  industry?: string | null;
  businessModel?: string | null;
  products?: string | null;
  customerProfile?: string | null;
  funnel?: string | null;
  advantage?: string | null;
  notSegment?: string | null;
  strategy?: string | null;
  visibility: ProfileVisibility;
}
const PROFILE_FIELDS = ['industry', 'businessModel', 'products', 'customerProfile', 'funnel', 'advantage', 'notSegment', 'strategy'] as const;

/** Faqat ega (sozlamalarda to'liq huquq) to'ldiradi va kim ko'rishini tanlaydi. */
export async function saveCompanyProfile(db: Db, ctx: Ctx, companyId: string, input: CompanyProfileInput) {
  if (!['owner', 'managers', 'all'].includes(input.visibility)) throw new Error('Maxfiylik darajasini tanlang');
  if ((await authorize(db, ctx, 'settings', 'update')) !== 'all') await deny(db, ctx, 'settings', 'update', companyId);
  const values = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, input[f]?.trim() || null])) as Record<(typeof PROFILE_FIELDS)[number], string | null>;
  await withTenant(db, ctx.tenantId, async (tx) => {
    const [c] = await tx.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.id, companyId));
    if (!c) throw new Error('Kompaniya topilmadi');
    const set = { ...values, visibility: input.visibility, updatedBy: ctx.userId, updatedAt: new Date() };
    await tx.insert(schema.companyProfiles).values({ tenantId: ctx.tenantId, companyId, ...set })
      .onConflictDoUpdate({ target: [schema.companyProfiles.tenantId, schema.companyProfiles.companyId], set });
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'update', entity: 'company_profile', entityId: companyId, newValue: set });
  });
}

/** Pasport — maxfiylik darajasi bo'yicha: owner — ega; managers — boshqaruv paneli to'liq ko'rinadiganlar; all — hamma. */
export async function getCompanyProfile(db: Db, ctx: Ctx, companyId: string) {
  return withTenant(db, ctx.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.companyProfiles).where(eq(schema.companyProfiles.companyId, companyId));
    const visibility = (row?.visibility ?? 'owner') as ProfileVisibility;
    const allowed = visibility === 'all'
      || (visibility === 'managers' && (await can(tx, ctx.userId, 'dashboard', 'view')) === 'all')
      || (await can(tx, ctx.userId, 'settings', 'view')) === 'all';
    if (!allowed) await deny(db, ctx, 'settings', 'view', companyId);
    return row ?? null;
  });
}

// ---------------------------------------------------------------- shtat jadvali (HR-09)

export async function setStaffingPlan(db: Db, ctx: Ctx, input: { departmentId: string; positionId: string; planned: number }) {
  if (!Number.isInteger(input.planned) || input.planned < 0 || input.planned > 10_000) throw new Error('Rejadagi o‘rinlar soni 0 yoki musbat butun son bo‘lishi kerak');
  if ((await authorize(db, ctx, 'hr', 'update')) !== 'all') await deny(db, ctx, 'hr', 'update');
  await withTenant(db, ctx.tenantId, async (tx) => {
    await tx.insert(schema.staffingPlans).values({ tenantId: ctx.tenantId, ...input })
      .onConflictDoUpdate({
        target: [schema.staffingPlans.tenantId, schema.staffingPlans.departmentId, schema.staffingPlans.positionId],
        set: { planned: input.planned, updatedAt: new Date() },
      });
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'update', entity: 'staffing_plan', newValue: input });
  });
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());

/** Bo'lim × lavozim: rejada, amalda (bo'shaganlar va hali kirmaganlar hisobga olinmaydi), bo'sh o'rin, ortiqcha. */
export async function staffingReport(db: Db, ctx: Ctx, opts: { on?: string; companyId?: string } = {}) {
  if ((await authorize(db, ctx, 'hr', 'view')) !== 'all') await deny(db, ctx, 'hr', 'view');
  const on = opts.on ?? today();
  return withTenant(db, ctx.tenantId, async (tx) => {
    const depts = await tx.select({ id: schema.departments.id, name: schema.departments.name, nameRu: schema.departments.nameRu, companyId: schema.departments.companyId })
      .from(schema.departments).where(opts.companyId ? eq(schema.departments.companyId, opts.companyId) : undefined);
    const positions = await tx.select({ id: schema.positions.id, name: schema.positions.name, nameRu: schema.positions.nameRu }).from(schema.positions);
    const plans = await tx.select().from(schema.staffingPlans);
    const emps = await tx.select({ id: schema.employees.id, departmentId: schema.employees.departmentId, positionId: schema.employees.positionId, hiredAt: schema.employees.hiredAt })
      .from(schema.employees).where(and(sql`${schema.employees.departmentId} is not null`, sql`${schema.employees.positionId} is not null`));
    const evs = await tx.select({
      employeeId: schema.employmentEvents.employeeId, type: schema.employmentEvents.type, startsOn: schema.employmentEvents.startsOn,
      endsOn: schema.employmentEvents.endsOn, cancelledAt: schema.employmentEvents.cancelledAt,
    }).from(schema.employmentEvents).where(isNull(schema.employmentEvents.cancelledAt));

    const actual = new Map<string, number>();
    for (const e of emps) {
      const events = evs.filter((x) => x.employeeId === e.id) as HrEvent[];
      const withHire = events.some((x) => x.type === 'hire') || !e.hiredAt ? events : [...events, { type: 'hire' as const, startsOn: e.hiredAt, endsOn: null, cancelledAt: null }];
      const status = statusOn(withHire, on);
      if (status === 'terminated' || status === 'not_hired') continue;
      const k = `${e.departmentId}:${e.positionId}`;
      actual.set(k, (actual.get(k) ?? 0) + 1);
    }
    const keys = new Set([...plans.map((p) => `${p.departmentId}:${p.positionId}`), ...actual.keys()]);
    const rows = [...keys].map((k) => {
      const [departmentId, positionId] = k.split(':') as [string, string];
      const d = depts.find((x) => x.id === departmentId);
      if (!d) return null;
      const p = positions.find((x) => x.id === positionId);
      const planned = plans.find((x) => x.departmentId === departmentId && x.positionId === positionId)?.planned ?? 0;
      const act = actual.get(k) ?? 0;
      return {
        departmentId, departmentName: d.name, departmentNameRu: d.nameRu, companyId: d.companyId,
        positionId, positionName: p?.name ?? '', positionNameRu: p?.nameRu ?? null,
        planned, actual: act, vacancies: Math.max(0, planned - act), over: Math.max(0, act - planned),
      };
    }).filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => a.departmentName.localeCompare(b.departmentName) || a.positionName.localeCompare(b.positionName));
    const sum = (k: 'planned' | 'actual' | 'vacancies' | 'over') => rows.reduce((s, r) => s + r[k], 0);
    return { on, rows, totals: { planned: sum('planned'), actual: sum('actual'), vacancies: sum('vacancies'), over: sum('over') } };
  });
}
