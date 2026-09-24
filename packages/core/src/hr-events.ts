// HR-03…06: kadr hodisalari, xodim holati, kadr kalendari, ta'til qoldig'i.
// Hodisalar o'chirilmaydi — faqat sababi ko'rsatilib bekor qilinadi (CORE-07).
import { and, eq, isNull, schema, withTenant, type Db, type Tx } from '@kaft/db';
import { authorize, deny, type Ctx } from './permissions.ts';

export const EVENT_TYPES = [
  'hire', 'transfer', 'position_change', 'salary_change',
  'vacation', 'maternity', 'sick', 'business_trip', 'termination',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type Status = 'active' | 'vacation' | 'maternity' | 'sick' | 'trip' | 'terminated' | 'not_hired';

/** Oraliqli (xodim ishda bo'lmaydigan) hodisalar va ular beradigan holat. */
export const ABSENCE: Partial<Record<EventType, Status>> = {
  vacation: 'vacation', maternity: 'maternity', sick: 'sick', business_trip: 'trip',
};

export const STATUS_LABEL: Record<Status, string> = {
  active: 'Ishda', vacation: 'Ta’tilda', maternity: 'Dikretda', sick: 'Kasal', trip: 'Safarda',
  terminated: 'Bo‘shagan', not_hired: 'Hali ishga kirmagan',
};

export interface HrEvent {
  type: EventType;
  /** YYYY-MM-DD */
  startsOn: string;
  endsOn: string | null;
  cancelledAt: Date | null;
}

/** Sana bo'yicha xodim holati (sanalar YYYY-MM-DD — satr sifatida taqqoslanadi). */
export function statusOn(events: HrEvent[], on: string): Status {
  const live = events.filter((e) => !e.cancelledAt);
  if (live.some((e) => e.type === 'termination' && e.startsOn <= on)) return 'terminated';
  const hire = live.find((e) => e.type === 'hire');
  if (hire && hire.startsOn > on) return 'not_hired';
  const absence = live.find((e) => ABSENCE[e.type] && e.startsOn <= on && (e.endsOn == null || on <= e.endsOn));
  return absence ? ABSENCE[absence.type]! : 'active';
}

/** Ikki sana orasidagi kalendar kunlari, ikkala chegara bilan. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

// ---------------------------------------------------------------- baza bilan

export interface NewEvent {
  type: EventType;
  startsOn: string;
  endsOn?: string;
  basis?: string;
  /** transfer/position_change: { departmentId?, positionId? }; salary_change: { amount } */
  payload?: Record<string, unknown>;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);
const nextDay = (iso: string) => new Date(Date.parse(iso) + 86_400_000).toISOString().slice(0, 10);
/** Tugash sanasi talab qilinadigan oraliqlar; dikret ochiq bo'lishi mumkin. */
const NEEDS_END: EventType[] = ['vacation', 'sick', 'business_trip'];

function validate(e: NewEvent) {
  if (!EVENT_TYPES.includes(e.type)) throw new Error(`Noma'lum hodisa turi: ${e.type}`);
  if (!ISO.test(e.startsOn) || (e.endsOn && !ISO.test(e.endsOn))) throw new Error('Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
  if (NEEDS_END.includes(e.type) && !e.endsOn) throw new Error('Tugash sanasi kiritilishi shart');
  if (e.endsOn && e.endsOn < e.startsOn) throw new Error('Tugash sanasi boshlanishidan oldin bo‘lishi mumkin emas');
  if (!ABSENCE[e.type] && e.endsOn) throw new Error('Bu hodisa turi oraliqli emas');
}

const liveEvents = (tx: Tx, employeeId: string) => tx.select().from(schema.employmentEvents)
  .where(and(eq(schema.employmentEvents.employeeId, employeeId), isNull(schema.employmentEvents.cancelledAt)));

const overlaps = (a: { startsOn: string; endsOn: string | null }, b: { startsOn: string; endsOn: string | null }) =>
  a.startsOn <= (b.endsOn ?? '9999-12-31') && b.startsOn <= (a.endsOn ?? '9999-12-31');

/** HR-03: kadr hodisasini yozadi (sana va asos hujjat bilan). */
export async function recordEvent(db: Db, ctx: Ctx, employeeId: string, input: NewEvent) {
  validate(input);
  if ((await authorize(db, ctx, 'hr', 'create')) !== 'all') await deny(db, ctx, 'hr', 'create', employeeId);

  return withTenant(db, ctx.tenantId, async (tx) => {
    const [emp] = await tx.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.id, employeeId));
    if (!emp) throw new Error('Xodim topilmadi');
    const events = await liveEvents(tx, employeeId);
    if (events.some((e) => e.type === 'termination' && e.startsOn <= input.startsOn)) throw new Error('Xodim bo‘shagan — yangi hodisa yozib bo‘lmaydi');
    if (ABSENCE[input.type]) {
      const next = { startsOn: input.startsOn, endsOn: input.endsOn ?? null };
      const clash = events.find((e) => ABSENCE[e.type as EventType] && overlaps(e, next));
      if (clash) throw new Error(`Sanalar ustma-ust tushadi: ${clash.startsOn} – ${clash.endsOn ?? '…'}`);
    }

    const [row] = await tx.insert(schema.employmentEvents).values({
      tenantId: ctx.tenantId, employeeId, type: input.type, startsOn: input.startsOn, endsOn: input.endsOn,
      basis: input.basis, payload: input.payload, createdBy: ctx.userId,
    }).returning({ id: schema.employmentEvents.id });

    // Kuchga kirgan o'tkazish kartaga darhol yoziladi; kelajakdagisini worker kuni kelganda qo'llaydi (5-hafta)
    if ((input.type === 'transfer' || input.type === 'position_change') && input.startsOn <= today()) {
      const p = input.payload ?? {};
      const set = { ...(p.departmentId ? { departmentId: String(p.departmentId) } : {}), ...(p.positionId ? { positionId: String(p.positionId) } : {}) };
      if (Object.keys(set).length) await tx.update(schema.employees).set(set).where(eq(schema.employees.id, employeeId));
    }
    await tx.insert(schema.auditLog).values({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'employment_event', entityId: row!.id,
      newValue: { employeeId, ...input },
    });
    return row!;
  });
}

/** CORE-07: hodisani o'chirmasdan, sababi bilan bekor qiladi. */
export async function cancelEvent(db: Db, ctx: Ctx, eventId: string, reason: string) {
  if (!reason.trim()) throw new Error('Bekor qilish sababi kiritilishi shart');
  if ((await authorize(db, ctx, 'hr', 'cancel')) !== 'all') await deny(db, ctx, 'hr', 'cancel', eventId);
  await withTenant(db, ctx.tenantId, async (tx) => {
    const done = await tx.update(schema.employmentEvents)
      .set({ cancelledAt: new Date(), cancelReason: reason.trim(), cancelledBy: ctx.userId })
      .where(and(eq(schema.employmentEvents.id, eventId), isNull(schema.employmentEvents.cancelledAt)))
      .returning({ id: schema.employmentEvents.id });
    if (!done.length) throw new Error('Hodisa topilmadi yoki allaqachon bekor qilingan');
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'cancel', entity: 'employment_event', entityId: eventId, meta: { reason: reason.trim() } });
  });
}

type EmpRow = { id: string; userId: string | null; hiredAt: string | null; departmentId: string | null; lastName: string; firstName: string };
type EvRow = HrEvent & { employeeId: string };

/** Kartadagi ishga kirgan sana — alohida «hire» hodisasi bo'lmasa shu hisobga olinadi. */
function withHire(emp: { hiredAt: string | null }, events: HrEvent[]): HrEvent[] {
  return events.some((e) => e.type === 'hire') || !emp.hiredAt ? events : [...events, { type: 'hire', startsOn: emp.hiredAt, endsOn: null, cancelledAt: null }];
}

async function loadAll(tx: Tx) {
  const emps: EmpRow[] = await tx.select({
    id: schema.employees.id, userId: schema.employees.userId, hiredAt: schema.employees.hiredAt,
    departmentId: schema.employees.departmentId, lastName: schema.employees.lastName, firstName: schema.employees.firstName,
  }).from(schema.employees);
  const evs = await tx.select({
    employeeId: schema.employmentEvents.employeeId, type: schema.employmentEvents.type, startsOn: schema.employmentEvents.startsOn,
    endsOn: schema.employmentEvents.endsOn, cancelledAt: schema.employmentEvents.cancelledAt,
  }).from(schema.employmentEvents).where(isNull(schema.employmentEvents.cancelledAt)) as EvRow[];
  const byEmp = new Map<string, HrEvent[]>();
  for (const e of evs) byEmp.set(e.employeeId, [...(byEmp.get(e.employeeId) ?? []), e]);
  return { emps, eventsOf: (emp: EmpRow) => withHire(emp, byEmp.get(emp.id) ?? []) };
}

async function loadOne(db: Db, ctx: Ctx, employeeId: string) {
  const scope = await authorize(db, ctx, 'hr', 'view');
  const { emp, events } = await withTenant(db, ctx.tenantId, async (tx) => {
    const [emp] = await tx.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
    return { emp, events: emp ? ((await liveEvents(tx, employeeId)) as HrEvent[]) : [] };
  });
  if (!emp) throw new Error('Xodim topilmadi');
  if (scope === 'own' && emp.userId !== ctx.userId) await deny(db, ctx, 'hr', 'view', employeeId);
  return { emp, events };
}

/** HR-04: xodimning sana bo'yicha holati. */
export async function employeeStatus(db: Db, ctx: Ctx, employeeId: string, on = today()): Promise<Status> {
  const { emp, events } = await loadOne(db, ctx, employeeId);
  return statusOn(withHire(emp, events), on);
}

/** Bosh sahifadagi «Kim qayerda»: holatlar bo'yicha sonlar. */
export async function headcount(db: Db, ctx: Ctx, opts: { on?: string } = {}): Promise<Record<Status, number>> {
  if ((await authorize(db, ctx, 'hr', 'view')) !== 'all') await deny(db, ctx, 'hr', 'view');
  const on = opts.on ?? today();
  const { emps, eventsOf } = await withTenant(db, ctx.tenantId, loadAll);
  const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, 0])) as Record<Status, number>;
  for (const emp of emps) counts[statusOn(eventsOf(emp), on)]++;
  return counts;
}

const addYears = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y! + n, m! - 1, d!)).toISOString().slice(0, 10);
};
const minusDay = (iso: string) => new Date(Date.parse(iso) - 86_400_000).toISOString().slice(0, 10);

/** HR-06: joriy ish yili (ishga kirgan kundan) bo'yicha ta'til: yillik, olingan, qolgan (kalendar kun). */
export async function leaveBalance(db: Db, ctx: Ctx, employeeId: string, on = today()) {
  const { emp, events } = await loadOne(db, ctx, employeeId);
  let periodStart = emp.hiredAt ?? `${on.slice(0, 4)}-01-01`;
  while (addYears(periodStart, 1) <= on) periodStart = addYears(periodStart, 1);
  const periodEnd = minusDay(addYears(periodStart, 1));
  const taken = events.filter((e) => e.type === 'vacation').reduce((sum, e) => {
    const from = e.startsOn > periodStart ? e.startsOn : periodStart;
    const to = e.endsOn && e.endsOn < periodEnd ? e.endsOn : periodEnd;
    return from <= to ? sum + daysBetween(from, to) : sum;
  }, 0);
  return { annual: emp.annualLeaveDays, taken, remaining: emp.annualLeaveDays - taken, periodStart, periodEnd };
}

// HR-05: PRD chegara bermagan — standart: bo'limning 30% va kamida 2 kishi bir kunda yo'q bo'lsa
export const ABSENCE_ALERT = { ratio: 0.3, minAbsent: 2 };

/** HR-05: kim qachon yo'q va bo'limlar bo'yicha ogohlantirishlar. */
export async function absenceCalendar(db: Db, ctx: Ctx, range: { from: string; to: string }, rule = ABSENCE_ALERT) {
  if ((await authorize(db, ctx, 'hr', 'view')) !== 'all') await deny(db, ctx, 'hr', 'view');
  const { emps, eventsOf } = await withTenant(db, ctx.tenantId, loadAll);

  const absences = emps.flatMap((emp) => eventsOf(emp)
    .filter((e) => ABSENCE[e.type] && overlaps(e, { startsOn: range.from, endsOn: range.to }))
    .map((e) => ({ employeeId: emp.id, name: `${emp.lastName} ${emp.firstName}`, departmentId: emp.departmentId, type: e.type, startsOn: e.startsOn, endsOn: e.endsOn })));

  const alerts: { departmentId: string; from: string; to: string; absent: number; headcount: number }[] = [];
  const depts = new Set(emps.map((e) => e.departmentId).filter((d): d is string => !!d));
  for (const dept of depts) {
    const members = emps.filter((e) => e.departmentId === dept);
    let open: (typeof alerts)[number] | null = null;
    for (let day = range.from; day <= range.to; day = nextDay(day)) {
      const statuses = members.map((m) => statusOn(eventsOf(m), day));
      const staff = statuses.filter((s) => s !== 'terminated' && s !== 'not_hired').length;
      const absent = statuses.filter((s) => s !== 'active' && s !== 'terminated' && s !== 'not_hired').length;
      const hit = absent >= rule.minAbsent && staff > 0 && absent / staff >= rule.ratio;
      if (hit && open) { open.to = day; open.absent = Math.max(open.absent, absent); }
      else if (hit) { open = { departmentId: dept, from: day, to: day, absent, headcount: staff }; alerts.push(open); }
      else open = null;
    }
  }
  return { absences, alerts };
}
