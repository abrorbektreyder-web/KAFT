// CP-01/02/03/05/08 (R1): kontragent kartasi, rekvizitlar, kredit limiti, shartnomalar, 360° (hozircha to'lovlar).
// Tahrir: tasdiqlash huquqi bor (ega) — darhol; yo'q (buxgalter, savdo menejeri) — so'rov, ega tasdiqlagach kuchga kiradi.
import { and, desc, eq, ilike, inArray, or, schema, sql, withTenant, type Db, type Tx } from '@kaft/db';
import { authorize, can, deny, type Ctx } from './permissions.ts';
import type { Scope } from './roles.ts';
import { messageText, notify } from './notifications.ts';
import { CURRENCIES } from './finance.ts';

export const COUNTERPARTY_ROLES = ['customer', 'wholesale', 'supplier'] as const;
export type CounterpartyRole = (typeof COUNTERPARTY_ROLES)[number];

export type CpErrorCode = 'name' | 'roles' | 'stir' | 'stirTaken' | 'mfo' | 'account' | 'phone' | 'amount' | 'currency' | 'term'
  | 'date' | 'number' | 'notFound' | 'pending' | 'decided' | 'conflict' | 'reason';

/** Kontragent moduli xatosi: `code` — interfeys matni uchun, `field` — qaysi maydon (import ustuni uchun). */
export class CpError extends Error {
  readonly code: CpErrorCode;
  readonly field?: string;
  constructor(code: CpErrorCode, message: string, field?: string) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

export interface CounterpartyInput {
  name: string;
  roles: CounterpartyRole[];
  stir?: string | null;
  address?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  bankName?: string | null;
  bankMfo?: string | null;
  bankAccount?: string | null;
  managerUserId?: string | null;
  /** Tiyin/sentda */
  creditLimit?: number | null;
  creditCurrency?: string;
  paymentTermDays?: number | null;
  note?: string | null;
}
export type CounterpartyPatch = Partial<CounterpartyInput>;

const FIELDS = ['name', 'roles', 'stir', 'address', 'contactPerson', 'phone', 'bankName', 'bankMfo', 'bankAccount', 'managerUserId',
  'creditLimit', 'creditCurrency', 'paymentTermDays', 'note'] as const;
const TEXT_FIELDS = ['address', 'contactPerson', 'bankName', 'note'] as const;

export function normalizePhone(v: string): string | null {
  const digits = v.replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  return null;
}

const blank = (v: string | null | undefined) => (v == null ? null : v.trim() || null);

/** Maydonlarni tekshiradi va bir ko'rinishga keltiradi; `full` — yaratishda majburiy maydonlar bilan. */
export function normalizeCounterparty(input: CounterpartyPatch, full: boolean): CounterpartyPatch {
  const out: CounterpartyPatch = {};
  if (full || input.name !== undefined) {
    const name = blank(input.name);
    if (!name) throw new CpError('name', 'Nomi kiritilishi shart', 'name');
    out.name = name;
  }
  if (full || input.roles !== undefined) {
    const roles = [...new Set(input.roles ?? [])];
    if (!roles.length || roles.some((r) => !COUNTERPARTY_ROLES.includes(r))) {
      throw new CpError('roles', 'Kamida bitta rol tanlang: mijoz, ulgurji hamkor yoki ta’minotchi', 'roles');
    }
    out.roles = roles;
  }
  if (input.stir !== undefined) {
    const stir = blank(input.stir)?.replace(/\s/g, '') ?? null;
    if (stir && !/^\d{9}$/.test(stir)) throw new CpError('stir', 'STIR 9 ta raqamdan iborat bo‘lishi kerak', 'stir');
    out.stir = stir;
  }
  if (input.bankMfo !== undefined) {
    const mfo = blank(input.bankMfo)?.replace(/\s/g, '') ?? null;
    if (mfo && !/^\d{5}$/.test(mfo)) throw new CpError('mfo', 'Bank MFO 5 ta raqam bo‘lishi kerak', 'bankMfo');
    out.bankMfo = mfo;
  }
  if (input.bankAccount !== undefined) {
    const acc = blank(input.bankAccount)?.replace(/\s/g, '') ?? null;
    if (acc && !/^\d{20}$/.test(acc)) throw new CpError('account', 'Hisob raqami 20 ta raqam bo‘lishi kerak', 'bankAccount');
    out.bankAccount = acc;
  }
  if (input.phone !== undefined) {
    const raw = blank(input.phone);
    const phone = raw ? normalizePhone(raw) : null;
    if (raw && !phone) throw new CpError('phone', 'Telefon noto‘g‘ri — 901234567 yoki +998901234567', 'phone');
    out.phone = phone;
  }
  for (const f of TEXT_FIELDS) if (input[f] !== undefined) out[f] = blank(input[f]);
  if (input.managerUserId !== undefined) out.managerUserId = input.managerUserId || null;
  if (input.creditLimit !== undefined) {
    if (input.creditLimit != null && (!Number.isSafeInteger(input.creditLimit) || input.creditLimit < 0)) {
      throw new CpError('amount', 'Kredit limiti musbat butun son (tiyin) bo‘lishi kerak', 'creditLimit');
    }
    out.creditLimit = input.creditLimit;
  }
  if (input.creditCurrency !== undefined) {
    if (!(CURRENCIES as readonly string[]).includes(input.creditCurrency)) throw new CpError('currency', `Noma'lum valyuta: ${input.creditCurrency}`, 'creditCurrency');
    out.creditCurrency = input.creditCurrency;
  }
  if (input.paymentTermDays !== undefined) {
    const d = input.paymentTermDays;
    if (d != null && (!Number.isInteger(d) || d < 0 || d > 365)) throw new CpError('term', 'To‘lov muddati 0–365 kun bo‘lishi kerak', 'paymentTermDays');
    out.paymentTermDays = d;
  }
  return out;
}

type CpRow = typeof schema.counterparties.$inferSelect;

async function loadVisible(db: Db, tx: Tx, ctx: Ctx, id: string, scope: Scope, action: 'view' | 'update' | 'create'): Promise<CpRow> {
  const [row] = await tx.select().from(schema.counterparties).where(eq(schema.counterparties.id, id));
  if (!row) throw new CpError('notFound', 'Kontragent topilmadi');
  if (scope !== 'all' && row.managerUserId !== ctx.userId) await deny(db, ctx, 'cp', action, id);
  return row;
}

async function assertStirFree(tx: Tx, stir: string | null | undefined, exceptId?: string) {
  if (!stir) return;
  const [dup] = await tx.select({ id: schema.counterparties.id }).from(schema.counterparties).where(eq(schema.counterparties.stir, stir));
  if (dup && dup.id !== exceptId) throw new CpError('stirTaken', 'Bu STIR bilan kontragent allaqachon bor', 'stir');
}

export async function createCounterparty(db: Db, ctx: Ctx, input: CounterpartyInput) {
  const v = normalizeCounterparty(input, true);
  const scope = await authorize(db, ctx, 'cp', 'create');
  // «Faqat o'ziniki» — savdo menejeri yaratgan mijozning mas'uli o'zi
  if (scope !== 'all') v.managerUserId = ctx.userId;
  return withTenant(db, ctx.tenantId, async (tx) => {
    await assertStirFree(tx, v.stir);
    const [row] = await tx.insert(schema.counterparties).values({ ...(v as CounterpartyInput), tenantId: ctx.tenantId })
      .returning({ id: schema.counterparties.id });
    await tx.insert(schema.auditLog).values({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'counterparty', entityId: row!.id, newValue: v,
    });
    return row!;
  });
}

export async function listCounterparties(db: Db, ctx: Ctx, opts: { q?: string; role?: CounterpartyRole; limit?: number } = {}) {
  const scope = await authorize(db, ctx, 'cp', 'view');
  const c = schema.counterparties;
  const q = opts.q?.trim();
  const pattern = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : undefined;
  return withTenant(db, ctx.tenantId, (tx) => tx.select().from(c).where(and(
    pattern ? or(ilike(c.name, pattern), ilike(c.stir, pattern), ilike(c.phone, pattern)) : undefined,
    opts.role ? sql`${opts.role} = any(${c.roles})` : undefined,
    scope === 'all' ? undefined : eq(c.managerUserId, ctx.userId),
  )).orderBy(c.name).limit(Math.min(opts.limit ?? 200, 1000)));
}

/** Karta (CP-03 360°): rekvizitlar, shartnomalar, to'lovlar (pul ko'rish huquqi bo'lsa), kutilayotgan so'rov. */
export async function getCounterparty(db: Db, ctx: Ctx, id: string) {
  const scope = await authorize(db, ctx, 'cp', 'view');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const row = await loadVisible(db, tx, ctx, id, scope, 'view');
    const contracts = await tx.select().from(schema.contracts).where(eq(schema.contracts.counterpartyId, id)).orderBy(desc(schema.contracts.signedOn));
    const finScope = await can(tx, ctx.userId, 'fin', 'view');
    const t = schema.cashTransactions;
    const a = schema.cashAccounts;
    const payments = finScope
      ? await tx.select({
        id: t.id, direction: t.direction, amount: t.amount, currency: t.currency, occurredOn: t.occurredOn, accountName: a.name,
        basis: t.basis, note: t.note, cancelledAt: t.cancelledAt,
      }).from(t).innerJoin(a, eq(a.id, t.accountId))
        .where(and(eq(t.counterpartyId, id), finScope === 'all' ? undefined : eq(a.responsibleUserId, ctx.userId)))
        .orderBy(desc(t.occurredOn), desc(t.createdAt)).limit(50)
      : null;
    const [pending] = await tx.select().from(schema.changeRequests).where(and(
      eq(schema.changeRequests.status, 'pending'),
      or(eq(schema.changeRequests.entityId, id), inArray(schema.changeRequests.entityId, contracts.length ? contracts.map((c) => c.id) : [id])),
    ));
    return { ...row, contracts, payments, pendingRequest: pending ?? null };
  });
}

// ---------------------------------------------------------------- tahrir va tasdiq

export type ChangeEntity = 'counterparty' | 'contract';
type Changes = Record<string, { from: unknown; to: unknown }>;
const TABLE = { counterparty: schema.counterparties, contract: schema.contracts } as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function diff(current: Record<string, unknown>, patch: Record<string, unknown>): Changes {
  const out: Changes = {};
  for (const [k, to] of Object.entries(patch)) if (!same(current[k], to)) out[k] = { from: current[k] ?? null, to: to ?? null };
  return out;
}

async function applyChanges(tx: Tx, ctx: Ctx, entity: ChangeEntity, id: string, changes: Changes, meta?: Record<string, unknown>) {
  const set = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to]));
  await tx.update(TABLE[entity]).set(set as never).where(eq(TABLE[entity].id, id));
  await tx.insert(schema.auditLog).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'update', entity, entityId: id, meta,
    oldValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])), newValue: set,
  });
}

/** Tasdiqlovchilar — kontragentlarda to'liq tasdiqlash huquqi borlar (standart: ega). */
async function approvers(tx: Tx) {
  const rows = await tx.selectDistinct({ id: schema.users.id }).from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.userRoles.roleId))
    .where(and(eq(schema.rolePermissions.module, 'cp'), eq(schema.rolePermissions.action, 'approve'), eq(schema.rolePermissions.scope, 'all'), eq(schema.users.isBlocked, false)));
  return rows.map((r) => r.id);
}

async function userName(tx: Tx, id: string) {
  const [u] = await tx.select({ name: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, id));
  return u?.name ?? '';
}

/** Tasdiqlovchi bo'lsa darhol qo'llaydi, aks holda so'rov yaratib egaga xabar beradi. */
async function applyOrRequest(tx: Tx, ctx: Ctx, req: { entity: ChangeEntity; id: string; name: string; link: string; changes: Changes }) {
  if (!Object.keys(req.changes).length) return { applied: true };
  if ((await can(tx, ctx.userId, 'cp', 'approve')) === 'all') {
    await applyChanges(tx, ctx, req.entity, req.id, req.changes);
    return { applied: true };
  }
  const [open] = await tx.select({ id: schema.changeRequests.id }).from(schema.changeRequests)
    .where(and(eq(schema.changeRequests.entityId, req.id), eq(schema.changeRequests.status, 'pending')));
  if (open) throw new CpError('pending', 'Bu ma’lumot bo‘yicha tasdiq kutilayotgan so‘rov bor');
  const [row] = await tx.insert(schema.changeRequests).values({
    tenantId: ctx.tenantId, entity: req.entity, entityId: req.id, entityName: req.name, changes: req.changes, requestedBy: ctx.userId,
  }).returning({ id: schema.changeRequests.id });
  const params = { requester: await userName(tx, ctx.userId), name: req.name };
  await notify(tx, (await approvers(tx)).filter((id) => id !== ctx.userId), {
    kind: 'change_request', ...messageText('change_request', params, 'uz'), params, link: req.link, dedupeKey: `change_request:${row!.id}`,
  });
  await tx.insert(schema.auditLog).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'change_request', entity: req.entity, entityId: req.id, meta: { requestId: row!.id }, newValue: req.changes,
  });
  return { applied: false, requestId: row!.id };
}

/** Tahrir; natija: `applied` — kuchga kirdi, aks holda `requestId` — ega tasdig'ini kutmoqda. */
export async function updateCounterparty(db: Db, ctx: Ctx, id: string, patch: CounterpartyPatch): Promise<{ applied: boolean; requestId?: string }> {
  const v = normalizeCounterparty(Object.fromEntries(Object.entries(patch).filter(([k]) => (FIELDS as readonly string[]).includes(k))), false);
  const scope = await authorize(db, ctx, 'cp', 'update');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const row = await loadVisible(db, tx, ctx, id, scope, 'update');
    if (v.stir) await assertStirFree(tx, v.stir, id);
    return applyOrRequest(tx, ctx, { entity: 'counterparty', id, name: row.name, link: `/kontragentlar/${id}`, changes: diff(row, v) });
  });
}

type ChangeRow = typeof schema.changeRequests.$inferSelect;

async function decide(db: Db, ctx: Ctx, requestId: string, fn: (tx: Tx, req: ChangeRow) => Promise<{ decision: 'approved' | 'rejected'; reason?: string }>) {
  if ((await authorize(db, ctx, 'cp', 'approve')) !== 'all') await deny(db, ctx, 'cp', 'approve', requestId);
  await withTenant(db, ctx.tenantId, async (tx) => {
    const [req] = await tx.select().from(schema.changeRequests).where(eq(schema.changeRequests.id, requestId));
    if (!req) throw new CpError('notFound', 'So‘rov topilmadi');
    if (req.status !== 'pending') throw new CpError('decided', 'So‘rov allaqachon hal qilingan');
    const { decision, reason } = await fn(tx, req);
    await tx.update(schema.changeRequests).set({ status: decision, decidedBy: ctx.userId, decidedAt: new Date(), decisionReason: reason })
      .where(eq(schema.changeRequests.id, requestId));
    const params = { name: req.entityName, decision, reason: reason ?? '' };
    await notify(tx, [req.requestedBy], {
      kind: 'change_decided', ...messageText('change_decided', params, 'uz'), params, dedupeKey: `change_decided:${requestId}`,
    });
  });
}

/** Ega so'rovni tasdiqlaydi: so'rovdan keyin ma'lumot boshqacha o'zgargan bo'lsa — rad etiladi (ziddiyat). */
export async function approveChange(db: Db, ctx: Ctx, requestId: string) {
  await decide(db, ctx, requestId, async (tx, req) => {
    const entity = req.entity as ChangeEntity;
    const [current] = await tx.select().from(TABLE[entity]).where(eq(TABLE[entity].id, req.entityId));
    if (!current) throw new CpError('notFound', 'Ma’lumot topilmadi');
    const changes = req.changes as Changes;
    if (Object.entries(changes).some(([k, v]) => !same((current as Record<string, unknown>)[k], v.from))) {
      throw new CpError('conflict', 'So‘rovdan keyin ma’lumot o‘zgargan — rad eting, xodim qaytadan yuborsin');
    }
    if (entity === 'counterparty' && changes.stir?.to) await assertStirFree(tx, changes.stir.to as string, req.entityId);
    await applyChanges(tx, ctx, entity, req.entityId, changes, { requestId: req.id, requestedBy: req.requestedBy });
    return { decision: 'approved' };
  });
}

export async function rejectChange(db: Db, ctx: Ctx, requestId: string, reason: string) {
  if (!reason.trim()) throw new CpError('reason', 'Rad etish sababi kiritilishi shart');
  await decide(db, ctx, requestId, async () => ({ decision: 'rejected', reason: reason.trim() }));
}

/** So'rovlar: tasdiqlovchi — hammasi, boshqalar — o'zi yuborganlari. */
export async function listChangeRequests(db: Db, ctx: Ctx, opts: { status?: 'pending' | 'approved' | 'rejected'; entityId?: string } = {}) {
  await authorize(db, ctx, 'cp', 'view');
  const r = schema.changeRequests;
  return withTenant(db, ctx.tenantId, async (tx) => {
    const approver = (await can(tx, ctx.userId, 'cp', 'approve')) === 'all';
    return tx.select({
      id: r.id, entity: r.entity, entityId: r.entityId, entityName: r.entityName, changes: r.changes, status: r.status,
      requestedBy: r.requestedBy, requesterName: schema.users.fullName, requestedAt: r.requestedAt,
      decidedBy: r.decidedBy, decidedAt: r.decidedAt, decisionReason: r.decisionReason,
    }).from(r).innerJoin(schema.users, eq(schema.users.id, r.requestedBy)).where(and(
      opts.status ? eq(r.status, opts.status) : undefined,
      opts.entityId ? eq(r.entityId, opts.entityId) : undefined,
      approver ? undefined : eq(r.requestedBy, ctx.userId),
    )).orderBy(desc(r.requestedAt));
  });
}

// ---------------------------------------------------------------- shartnomalar (CP-08)

export interface ContractInput {
  number: string;
  signedOn: string;
  endsOn?: string | null;
  amount?: number | null;
  currency?: string;
  note?: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function normalizeContract(input: Partial<ContractInput>, full: boolean): Partial<ContractInput> {
  const out: Partial<ContractInput> = {};
  if (full || input.number !== undefined) {
    const n = input.number?.trim();
    if (!n) throw new CpError('number', 'Shartnoma raqami kiritilishi shart', 'number');
    out.number = n;
  }
  if (full || input.signedOn !== undefined) {
    if (!input.signedOn || !ISO.test(input.signedOn)) throw new CpError('date', 'Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak', 'signedOn');
    out.signedOn = input.signedOn;
  }
  if (input.endsOn !== undefined) {
    if (input.endsOn && !ISO.test(input.endsOn)) throw new CpError('date', 'Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak', 'endsOn');
    out.endsOn = input.endsOn || null;
  }
  if (input.amount !== undefined) {
    if (input.amount != null && (!Number.isSafeInteger(input.amount) || input.amount < 0)) throw new CpError('amount', 'Summa musbat butun son (tiyin) bo‘lishi kerak', 'amount');
    out.amount = input.amount;
  }
  if (input.currency !== undefined) {
    if (!(CURRENCIES as readonly string[]).includes(input.currency)) throw new CpError('currency', `Noma'lum valyuta: ${input.currency}`, 'currency');
    out.currency = input.currency;
  }
  if (input.note !== undefined) out.note = blank(input.note);
  return out;
}

export async function createContract(db: Db, ctx: Ctx, counterpartyId: string, input: ContractInput) {
  const v = normalizeContract(input, true);
  if (v.endsOn && v.endsOn < v.signedOn!) throw new CpError('date', 'Tugash sanasi imzolangan sanadan oldin bo‘lishi mumkin emas', 'endsOn');
  const scope = await authorize(db, ctx, 'cp', 'create');
  return withTenant(db, ctx.tenantId, async (tx) => {
    await loadVisible(db, tx, ctx, counterpartyId, scope, 'create');
    const [row] = await tx.insert(schema.contracts).values({ ...(v as ContractInput), tenantId: ctx.tenantId, counterpartyId, createdBy: ctx.userId })
      .returning({ id: schema.contracts.id });
    await tx.insert(schema.auditLog).values({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'contract', entityId: row!.id, newValue: { counterpartyId, ...v },
    });
    return row!;
  });
}

export async function updateContract(db: Db, ctx: Ctx, id: string, patch: Partial<ContractInput>): Promise<{ applied: boolean; requestId?: string }> {
  const v = normalizeContract(patch, false);
  const scope = await authorize(db, ctx, 'cp', 'update');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const [contract] = await tx.select().from(schema.contracts).where(eq(schema.contracts.id, id));
    if (!contract) throw new CpError('notFound', 'Shartnoma topilmadi');
    const cp = await loadVisible(db, tx, ctx, contract.counterpartyId, scope, 'update');
    const next = { ...contract, ...v };
    if (next.endsOn && next.endsOn < next.signedOn) throw new CpError('date', 'Tugash sanasi imzolangan sanadan oldin bo‘lishi mumkin emas', 'endsOn');
    return applyOrRequest(tx, ctx, {
      entity: 'contract', id, name: `${cp.name} · №${contract.number}`, link: `/kontragentlar/${cp.id}`, changes: diff(contract, v),
    });
  });
}
