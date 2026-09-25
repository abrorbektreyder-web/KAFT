// HR-01/02: xodim kartasi va maxfiy maydonlar.
import { eq, schema, withTenant, type Db, type Tx } from '@kaft/db';
import { authorize, deny, type Ctx } from './permissions.ts';

export interface Secrets { passport?: string; jshshir?: string; bankCard?: string }

export interface EmployeeInput {
  companyId: string;
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  /** Platformadagi login (Xodim o'z kartasini ko'rishi uchun) */
  userId?: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  /** YYYY-MM-DD */
  birthDate?: string;
  phone?: string;
  address?: string;
  photoUrl?: string;
  education?: string;
  workSchedule?: string;
  contractType?: string;
  hiredAt?: string;
  /** HR-07 eslatmalari uchun (YYYY-MM-DD) */
  probationEndsOn?: string;
  contractEndsOn?: string;
  passportExpiresOn?: string;
  secrets?: Secrets;
}

const SECRET_RULES: Record<keyof Secrets, [RegExp, string]> = {
  passport: [/^[A-Z]{2}\d{7}$/, 'Pasport AA1234567 ko‘rinishida bo‘lishi kerak'],
  jshshir: [/^\d{14}$/, 'JShShIR 14 ta raqamdan iborat bo‘lishi kerak'],
  bankCard: [/^\d{16}$/, 'Bank karta raqami 16 ta raqam bo‘lishi kerak'],
};

/** Maxfiy maydonni tekshiradi; xato bo'lsa sababini qaytaradi. */
/** Bo'lim/lavozim nomi o'quvchi tilida: rus tilida ruscha nomi bo'lsa — o'sha, aks holda asl nom (CORE-08). */
export function localName(x: { name: string; nameRu?: string | null }, locale: string) {
  return locale === 'ru' && x.nameRu ? x.nameRu : x.name;
}

export function secretError(field: keyof Secrets, value: string): string | null {
  const [re, msg] = SECRET_RULES[field];
  return re.test(value) ? null : msg;
}

function validateSecrets(s: Secrets) {
  for (const [k, v] of Object.entries(s) as [keyof Secrets, string | undefined][]) {
    if (v == null) continue;
    const err = secretError(k, v);
    if (err) throw new Error(err);
  }
}

/** Audit jurnali uchun: faqat oxirgi 4 belgi ko'rinadi. */
const mask = (v: string | null | undefined) => (v ? `*****${v.slice(-4)}` : null);
const maskAll = (s: Secrets) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, mask(v)]));

export async function insertEmployee(tx: Tx, ctx: Ctx, input: EmployeeInput) {
  const { secrets, ...fields } = input;
  const [e] = await tx.insert(schema.employees).values({ ...fields, tenantId: ctx.tenantId }).returning({ id: schema.employees.id });
  if (secrets && Object.keys(secrets).length) {
    await tx.insert(schema.employeeSecrets).values({ ...secrets, tenantId: ctx.tenantId, employeeId: e!.id });
  }
  await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'employee', entityId: e!.id });
  return e!;
}

export async function createEmployee(db: Db, ctx: Ctx, input: EmployeeInput) {
  if ((await authorize(db, ctx, 'hr', 'create')) !== 'all') await deny(db, ctx, 'hr', 'create');
  if (input.secrets) {
    validateSecrets(input.secrets);
    if ((await authorize(db, ctx, 'hr.secret', 'create')) !== 'all') await deny(db, ctx, 'hr.secret', 'create');
  }
  return withTenant(db, ctx.tenantId, (tx) => insertEmployee(tx, ctx, input));
}

async function loadEmployee(db: Db, ctx: Ctx, id: string) {
  const [e] = await withTenant(db, ctx.tenantId, (tx) => tx.select().from(schema.employees).where(eq(schema.employees.id, id)));
  if (!e) throw new Error('Xodim topilmadi');
  return e;
}

/** 'own' qamrov: xodim faqat o'z kartasiga (keyin — bo'lim boshlig'i o'z bo'limiga). */
const ownsCard = (e: { userId: string | null }, ctx: Ctx) => e.userId === ctx.userId;

type Employee = Omit<typeof schema.employees.$inferSelect, 'tenantId'>;

export function getEmployee(db: Db, ctx: Ctx, id: string, opts: { withSecrets: true }): Promise<Employee & { secrets: Secrets }>;
export function getEmployee(db: Db, ctx: Ctx, id: string, opts?: { withSecrets?: false }): Promise<Employee>;
export async function getEmployee(db: Db, ctx: Ctx, id: string, opts: { withSecrets?: boolean } = {}): Promise<Employee | (Employee & { secrets: Secrets })> {
  const scope = await authorize(db, ctx, 'hr', 'view');
  const { tenantId: _t, ...e } = await loadEmployee(db, ctx, id);
  if (scope === 'own' && !ownsCard(e, ctx)) await deny(db, ctx, 'hr', 'view', id);
  if (!opts.withSecrets) return e;

  const secretScope = await authorize(db, ctx, 'hr.secret', 'view');
  if (secretScope === 'own' && !ownsCard(e, ctx)) await deny(db, ctx, 'hr.secret', 'view', id);
  const secrets = await withTenant(db, ctx.tenantId, async (tx) => {
    const [s] = await tx.select().from(schema.employeeSecrets).where(eq(schema.employeeSecrets.employeeId, id));
    // PAY-07/PRD 10: maxfiy ma'lumotni har o'qish jurnalga yoziladi
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'read', entity: 'employee.secret', entityId: id });
    return s;
  });
  return { ...e, secrets: { passport: secrets?.passport ?? undefined, jshshir: secrets?.jshshir ?? undefined, bankCard: secrets?.bankCard ?? undefined } };
}

export async function updateSecrets(db: Db, ctx: Ctx, id: string, patch: Secrets) {
  validateSecrets(patch);
  const scope = await authorize(db, ctx, 'hr.secret', 'update');
  const e = await loadEmployee(db, ctx, id);
  if (scope === 'own' && !ownsCard(e, ctx)) await deny(db, ctx, 'hr.secret', 'update', id);

  await withTenant(db, ctx.tenantId, async (tx) => {
    const [old] = await tx.select().from(schema.employeeSecrets).where(eq(schema.employeeSecrets.employeeId, id));
    await tx.insert(schema.employeeSecrets).values({ ...patch, tenantId: ctx.tenantId, employeeId: id })
      .onConflictDoUpdate({ target: [schema.employeeSecrets.tenantId, schema.employeeSecrets.employeeId], set: patch });
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, old?.[k as keyof Secrets] ?? undefined])) as Secrets;
    await tx.insert(schema.auditLog).values({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'update', entity: 'employee.secret', entityId: id,
      oldValue: maskAll(before), newValue: maskAll(patch),
    });
  });
}
