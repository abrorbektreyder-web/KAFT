// R1 (10-hafta): to'lov kalendari (FIN-06), kassa uzilishi prognozi (FIN-07), kunlik kassa yopish (FIN-08),
// boshqaruv foyda-zarar (FIN-10). Hammasi hujjatlardan hisoblanadi; ekvivalent — so'mda.
// Egasi qarorlari (2026-09-26): muddati o'tgan mijoz qarzi prognozga kirmaydi (alohida ko'rsatiladi);
// muddati o'tgan bizning qarz — bugungi chiqim; tannarx — sotuv sanasigacha bo'lgan xaridlarning o'rtacha narxi.
import { and, asc, desc, eq, gte, inArray, isNull, lte, schema, sql, withTenant, type Db, type Tx } from '@kaft/db';
import { authorize, deny, type Ctx } from './permissions.ts';
import { messageText, notify } from './notifications.ts';
import { CURRENCIES, rateOn, toUzs } from './finance.ts';
import { computeDebts } from './trade.ts';

export type Repeat = 'once' | 'weekly' | 'monthly';
export type PlanErrorCode = 'name' | 'direction' | 'amount' | 'currency' | 'date' | 'repeat' | 'notFound' | 'closed';

export class PlanError extends Error {
  readonly code: PlanErrorCode;
  constructor(code: PlanErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
function checkDate(d: string) {
  if (!ISO.test(d)) throw new PlanError('date', 'Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
}

// ---------------------------------------------------------------- takrorlanuvchi to'lovlar

/** Rejali to'lov sanalari [from, to] oralig'ida. Har oy: boshlanish kuni; oyda bunday kun yo'q bo'lsa — oy oxiri. */
export function occurrences(p: { startsOn: string; repeat: Repeat; endsOn: string | null }, from: string, to: string): string[] {
  const last = p.endsOn && p.endsOn < to ? p.endsOn : to;
  const out: string[] = [];
  if (p.repeat === 'once') return p.startsOn >= from && p.startsOn <= last ? [p.startsOn] : [];
  if (p.repeat === 'weekly') {
    for (let d = p.startsOn; d <= last; d = addDays(d, 7)) if (d >= from) out.push(d);
    return out;
  }
  const [y0, m0, day] = p.startsOn.split('-').map(Number) as [number, number, number];
  for (let i = 0; ; i++) {
    const y = y0 + Math.floor((m0 - 1 + i) / 12);
    const m = ((m0 - 1 + i) % 12) + 1;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
    if (d > last) return out;
    if (d >= from) out.push(d);
  }
}

export interface ScheduledPaymentInput {
  name: string;
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  startsOn: string;
  repeat: Repeat;
  endsOn?: string | null;
  categoryId?: string | null;
  counterpartyId?: string | null;
  companyId?: string | null;
}

export async function createScheduledPayment(db: Db, ctx: Ctx, input: ScheduledPaymentInput) {
  const name = input.name?.trim();
  if (!name) throw new PlanError('name', 'Nomini kiriting');
  if (input.direction !== 'in' && input.direction !== 'out') throw new PlanError('direction', 'Kirim yoki chiqimni tanlang');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new PlanError('amount', 'Summa musbat son bo‘lishi kerak');
  if (!(CURRENCIES as readonly string[]).includes(input.currency)) throw new PlanError('currency', `Noma'lum valyuta: ${input.currency}`);
  if (!['once', 'weekly', 'monthly'].includes(input.repeat)) throw new PlanError('repeat', 'Takrorlanishni tanlang');
  checkDate(input.startsOn);
  if (input.endsOn) checkDate(input.endsOn);
  if ((await authorize(db, ctx, 'fin', 'create')) !== 'all') await deny(db, ctx, 'fin', 'create');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const [row] = await tx.insert(schema.scheduledPayments).values({ ...input, name, tenantId: ctx.tenantId, createdBy: ctx.userId })
      .returning({ id: schema.scheduledPayments.id });
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'scheduled_payment', entityId: row!.id, newValue: { ...input } });
    return row!;
  });
}

export async function listScheduledPayments(db: Db, ctx: Ctx) {
  if ((await authorize(db, ctx, 'fin', 'view')) !== 'all') await deny(db, ctx, 'fin', 'view');
  return withTenant(db, ctx.tenantId, (tx) => tx.select().from(schema.scheduledPayments)
    .where(eq(schema.scheduledPayments.isActive, true)).orderBy(asc(schema.scheduledPayments.startsOn)));
}

export async function deactivateScheduledPayment(db: Db, ctx: Ctx, id: string) {
  if ((await authorize(db, ctx, 'fin', 'create')) !== 'all') await deny(db, ctx, 'fin', 'create');
  await withTenant(db, ctx.tenantId, async (tx) => {
    const done = await tx.update(schema.scheduledPayments).set({ isActive: false }).where(eq(schema.scheduledPayments.id, id)).returning({ id: schema.scheduledPayments.id });
    if (!done.length) throw new PlanError('notFound', 'Rejali to‘lov topilmadi');
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'deactivate', entity: 'scheduled_payment', entityId: id });
  });
}

// ---------------------------------------------------------------- kalendar va prognoz

export interface CalendarItem {
  date: string;
  direction: 'in' | 'out';
  source: 'receivable' | 'payable' | 'scheduled';
  name: string;
  amount: number;
  currency: string;
  /** So'm ekvivalenti (kurs bo'lmasa null) */
  uzs: number | null;
  counterpartyId?: string;
  docId?: string;
  docNumber?: string;
  overdue?: boolean;
}

function rates(tx: Tx, on: string) {
  const cache = new Map<string, string | null>();
  return async (amount: number, currency: string) => {
    if (!cache.has(currency)) cache.set(currency, await rateOn(tx, currency, on));
    const r = cache.get(currency);
    return r ? toUzs(amount, r) : null;
  };
}

/** Kalendar yozuvlari: `on` holatidagi ochiq qarzlar va rejali to'lovlar [on, to] oralig'ida (tizim amali — ruxsatsiz). */
async function calendar(tx: Tx, on: string, to: string) {
  const conv = rates(tx, on);
  const items: CalendarItem[] = [];
  const overdueReceivable = { uzs: 0 as number | null, docs: 0 };
  const cps = new Map<string, string>();
  for (const t of [schema.sales, schema.purchases]) {
    const rows = await tx.selectDistinct({ id: t.counterpartyId, name: schema.counterparties.name }).from(t)
      .innerJoin(schema.counterparties, eq(schema.counterparties.id, t.counterpartyId)).where(isNull(t.cancelledAt));
    rows.forEach((r) => cps.set(r.id, r.name));
  }
  for (const [cpId, cpName] of cps) {
    const debts = await computeDebts(tx, cpId, on);
    for (const [side, direction] of [['receivable', 'in'], ['payable', 'out']] as const) {
      for (const d of debts[side].docs) {
        if (d.remaining <= 0) continue;
        const uzs = await conv(d.remaining, d.currency);
        const overdue = d.dueDate < on;
        if (overdue && side === 'receivable') {
          // Qachon kelishi noma'lum — prognozga kirmaydi, alohida ko'rsatiladi
          overdueReceivable.docs++;
          overdueReceivable.uzs = overdueReceivable.uzs != null && uzs != null ? overdueReceivable.uzs + uzs : null;
          continue;
        }
        if (!overdue && d.dueDate > to) continue;
        items.push({
          date: overdue ? on : d.dueDate, direction, source: side, name: cpName, amount: d.remaining, currency: d.currency, uzs,
          counterpartyId: cpId, docId: d.id, docNumber: d.number, overdue,
        });
      }
    }
  }
  const plans = await tx.select().from(schema.scheduledPayments).where(eq(schema.scheduledPayments.isActive, true));
  for (const p of plans) {
    for (const date of occurrences({ startsOn: p.startsOn, repeat: p.repeat as Repeat, endsOn: p.endsOn }, on, to)) {
      items.push({
        date, direction: p.direction as 'in' | 'out', source: 'scheduled', name: p.name, amount: p.amount, currency: p.currency,
        uzs: await conv(p.amount, p.currency), counterpartyId: p.counterpartyId ?? undefined,
      });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.direction.localeCompare(b.direction) || a.name.localeCompare(b.name));
  return { items, overdueReceivable };
}

async function requireAllFin(db: Db, ctx: Ctx) {
  if ((await authorize(db, ctx, 'fin', 'view')) !== 'all') await deny(db, ctx, 'fin', 'view');
}

/** FIN-06: to'lov kalendari — kutilayotgan kirim va chiqimlar. */
export async function paymentCalendar(db: Db, ctx: Ctx, opts: { from?: string; to?: string } = {}) {
  const from = opts.from ?? today();
  const to = opts.to ?? addDays(from, 29);
  checkDate(from);
  checkDate(to);
  await requireAllFin(db, ctx);
  return withTenant(db, ctx.tenantId, async (tx) => ({ from, to, ...(await calendar(tx, from, to)) }));
}

/** Prognoz (tizim amali): joriy qoldiq + kirim − chiqim kunma-kun, so'mda. */
export async function computeForecast(tx: Tx, on: string, days: number) {
  const to = addDays(on, days - 1);
  const conv = rates(tx, on);
  const sums = await tx.select({
    currency: schema.cashTransactions.currency,
    total: sql<string>`coalesce(sum(case when ${schema.cashTransactions.direction} = 'in' then ${schema.cashTransactions.amount} else -${schema.cashTransactions.amount} end), 0)`,
  }).from(schema.cashTransactions)
    .where(and(isNull(schema.cashTransactions.cancelledAt), lte(schema.cashTransactions.occurredOn, on)))
    .groupBy(schema.cashTransactions.currency);
  const missingRates = new Set<string>();
  let start = 0;
  for (const s of sums) {
    const v = await conv(Number(s.total), s.currency);
    if (v == null) missingRates.add(s.currency);
    else start += v;
  }
  const { items, overdueReceivable } = await calendar(tx, on, to);
  for (const i of items) if (i.uzs == null) missingRates.add(i.currency);
  let balance = start;
  let firstNegative: string | null = null;
  const out = [];
  for (let n = 0; n < days; n++) {
    const date = addDays(on, n);
    const today = items.filter((i) => i.date === date && i.uzs != null);
    const inflow = today.filter((i) => i.direction === 'in').reduce((s, i) => s + i.uzs!, 0);
    const outflow = today.filter((i) => i.direction === 'out').reduce((s, i) => s + i.uzs!, 0);
    balance += inflow - outflow;
    if (balance < 0 && !firstNegative) firstNegative = date;
    out.push({ date, inflow, outflow, balance });
  }
  return {
    on, start, days: out, firstNegative, minBalance: Math.min(start, ...out.map((d) => d.balance)),
    overdueReceivableUzs: overdueReceivable.uzs, overdueReceivableDocs: overdueReceivable.docs, missingRates: [...missingRates], items,
  };
}

/** FIN-07: kassa uzilishi prognozi (standart 30 kun). */
export async function cashForecast(db: Db, ctx: Ctx, opts: { on?: string; days?: number } = {}) {
  const on = opts.on ?? today();
  checkDate(on);
  await requireAllFin(db, ctx);
  return withTenant(db, ctx.tenantId, (tx) => computeForecast(tx, on, Math.min(Math.max(opts.days ?? 30, 1), 90)));
}

async function usersWithRole(tx: Tx, role: string) {
  return (await tx.select({ id: schema.users.id }).from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .where(and(eq(schema.roles.name, role), eq(schema.users.isBlocked, false)))).map((r) => r.id);
}

/** Kunlik ish (tenant ichida): prognozda manfiy kun bo'lsa egaga bir marta xabar (qizil bayroq). */
export async function checkCashGap(tx: Tx, on: string) {
  const f = await computeForecast(tx, on, 30);
  if (!f.firstNegative) return 0;
  const params = { date: f.firstNegative };
  const created = await notify(tx, await usersWithRole(tx, 'Ega'), {
    kind: 'cash_gap', ...messageText('cash_gap', params, 'uz'), params, link: '/pul/prognoz', dedupeKey: `cash_gap:${on}`,
  });
  return created.length;
}

// ---------------------------------------------------------------- kunlik kassa yopish (FIN-08)

export async function closeCashDay(db: Db, ctx: Ctx, input: { accountId: string; date: string; counted: number; note?: string }) {
  checkDate(input.date);
  if (!Number.isSafeInteger(input.counted) || input.counted < 0) throw new PlanError('amount', 'Sanalgan summa musbat son bo‘lishi kerak');
  const scope = await authorize(db, ctx, 'fin', 'create');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const [acc] = await tx.select().from(schema.cashAccounts).where(eq(schema.cashAccounts.id, input.accountId));
    if (!acc) throw new PlanError('notFound', 'Kassa topilmadi');
    if (scope !== 'all' && acc.responsibleUserId !== ctx.userId) await deny(db, ctx, 'fin', 'create', acc.id);
    const [done] = await tx.select({ id: schema.cashClosings.id }).from(schema.cashClosings)
      .where(and(eq(schema.cashClosings.accountId, acc.id), eq(schema.cashClosings.closingDate, input.date)));
    if (done) throw new PlanError('closed', 'Bu kun uchun kassa allaqachon yopilgan');
    const [s] = await tx.select({
      total: sql<string>`coalesce(sum(case when ${schema.cashTransactions.direction} = 'in' then ${schema.cashTransactions.amount} else -${schema.cashTransactions.amount} end), 0)`,
    }).from(schema.cashTransactions).where(and(
      eq(schema.cashTransactions.accountId, acc.id), isNull(schema.cashTransactions.cancelledAt), lte(schema.cashTransactions.occurredOn, input.date),
    ));
    const system = Number(s!.total);
    const diff = input.counted - system;
    const [row] = await tx.insert(schema.cashClosings).values({
      tenantId: ctx.tenantId, accountId: acc.id, closingDate: input.date, currency: acc.currency, counted: input.counted, system, diff,
      note: input.note?.trim() || null, closedBy: ctx.userId,
    }).returning({ id: schema.cashClosings.id });
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'close', entity: 'cash_closing', entityId: row!.id, newValue: { ...input, system, diff } });
    if (diff !== 0) {
      const params = { account: acc.name, date: input.date, diff: String(diff), currency: acc.currency };
      await notify(tx, (await usersWithRole(tx, 'Ega')).filter((id) => id !== ctx.userId), {
        kind: 'cash_diff', ...messageText('cash_diff', params, 'uz'), params, link: '/pul/yopish', dedupeKey: `cash_diff:${row!.id}`,
      });
    }
    return { id: row!.id, system, diff };
  });
}

export async function listClosings(db: Db, ctx: Ctx, opts: { accountId?: string; limit?: number } = {}) {
  const scope = await authorize(db, ctx, 'fin', 'view');
  const c = schema.cashClosings;
  const a = schema.cashAccounts;
  return withTenant(db, ctx.tenantId, (tx) => tx.select({
    id: c.id, accountId: c.accountId, accountName: a.name, date: c.closingDate, currency: c.currency,
    counted: c.counted, system: c.system, diff: c.diff, note: c.note, closedBy: c.closedBy, createdAt: c.createdAt,
  }).from(c).innerJoin(a, eq(a.id, c.accountId)).where(and(
    opts.accountId ? eq(c.accountId, opts.accountId) : undefined,
    scope === 'all' ? undefined : eq(a.responsibleUserId, ctx.userId),
  )).orderBy(desc(c.closingDate), asc(a.name)).limit(Math.min(opts.limit ?? 60, 500)));
}

// ---------------------------------------------------------------- boshqaruv foyda-zarar (FIN-10)

const THOUSAND = BigInt(1000);
const TWO = BigInt(2);
const milli = (q: string) => {
  const [int, frac = ''] = q.split('.');
  return BigInt(int!) * THOUSAND + BigInt(frac.padEnd(3, '0').slice(0, 3));
};

/** Tushum − tannarx − xarajatlar, oy bo'yicha, so'mda (hujjat/operatsiya sanasidagi kurs). */
export async function profitAndLoss(db: Db, ctx: Ctx, opts: { from: string; to: string; companyId?: string }) {
  checkDate(opts.from);
  checkDate(opts.to);
  await requireAllFin(db, ctx);
  return withTenant(db, ctx.tenantId, async (tx) => {
    const cache = new Map<string, string | null>();
    const uzsAt = async (amount: number, currency: string, date: string) => {
      const k = `${currency}:${date}`;
      if (!cache.has(k)) cache.set(k, await rateOn(tx, currency, date));
      const r = cache.get(k);
      return r ? toUzs(amount, r) : null;
    };
    const missingRates = new Set<string>();
    const months = new Map<string, { revenue: number; cogs: number; expenses: number }>();
    const month = (d: string) => {
      const m = d.slice(0, 7);
      if (!months.has(m)) months.set(m, { revenue: 0, cogs: 0, expenses: 0 });
      return months.get(m)!;
    };

    // Tannarx: mahsulot bo'yicha sanagacha bo'lgan xaridlar (so'mda) — o'rtacha
    const pl = schema.purchaseLines;
    const pu = schema.purchases;
    const buys = await tx.select({ productId: pl.productId, qty: pl.qty, amount: pl.amount, currency: pu.currency, docDate: pu.docDate })
      .from(pl).innerJoin(pu, eq(pu.id, pl.purchaseId))
      .where(and(eq(pu.kind, 'purchase'), eq(pu.status, 'posted'), isNull(pu.cancelledAt), lte(pu.docDate, opts.to)));
    const buysUzs: { productId: string; docDate: string; qty: bigint; uzs: bigint }[] = [];
    for (const b of buys) {
      const v = await uzsAt(b.amount, b.currency, b.docDate);
      if (v == null) missingRates.add(b.currency);
      else buysUzs.push({ productId: b.productId, docDate: b.docDate, qty: milli(b.qty), uzs: BigInt(v) });
    }
    const cogsOf = (productId: string, qty: string, asOf: string): number | null => {
      const rel = buysUzs.filter((b) => b.productId === productId && b.docDate <= asOf);
      const q = rel.reduce((s, b) => s + b.qty, BigInt(0));
      if (q === BigInt(0)) return null;
      const cost = rel.reduce((s, b) => s + b.uzs, BigInt(0));
      return Number((milli(qty) * cost * TWO + q) / (q * TWO));
    };

    const sl = schema.saleLines;
    const sa = schema.sales;
    const lines = await tx.select({ productId: sl.productId, qty: sl.qty, amount: sl.amount, kind: sa.kind, currency: sa.currency, docDate: sa.docDate })
      .from(sl).innerJoin(sa, eq(sa.id, sl.saleId))
      .where(and(inArray(sa.kind, ['sale', 'return']), eq(sa.status, 'posted'), isNull(sa.cancelledAt), gte(sa.docDate, opts.from), lte(sa.docDate, opts.to),
        opts.companyId ? eq(sa.companyId, opts.companyId) : undefined));
    let cogsUnknownLines = 0;
    for (const l of lines) {
      const sign = l.kind === 'return' ? -1 : 1;
      const rev = await uzsAt(l.amount, l.currency, l.docDate);
      if (rev == null) {
        missingRates.add(l.currency);
        continue;
      }
      const m = month(l.docDate);
      m.revenue += sign * rev;
      const cogs = cogsOf(l.productId, l.qty, l.docDate);
      if (cogs == null) {
        if (sign > 0) cogsUnknownLines++;
      } else {
        m.cogs += sign * cogs;
      }
    }

    const t = schema.cashTransactions;
    const cat = schema.expenseCategories;
    const exp = await tx.select({ amount: t.amount, currency: t.currency, rate: t.rate, occurredOn: t.occurredOn, categoryId: cat.id, name: cat.name, nameRu: cat.nameRu })
      .from(t).innerJoin(cat, eq(cat.id, t.categoryId)).innerJoin(schema.cashAccounts, eq(schema.cashAccounts.id, t.accountId))
      .where(and(eq(t.kind, 'expense'), isNull(t.cancelledAt), eq(cat.inPl, true), gte(t.occurredOn, opts.from), lte(t.occurredOn, opts.to),
        opts.companyId ? eq(schema.cashAccounts.companyId, opts.companyId) : undefined));
    const byCat = new Map<string, { categoryId: string; name: string; nameRu: string | null; amount: number }>();
    for (const e of exp) {
      const v = e.rate ? toUzs(e.amount, e.rate) : await uzsAt(e.amount, e.currency, e.occurredOn);
      if (v == null) {
        missingRates.add(e.currency);
        continue;
      }
      month(e.occurredOn).expenses += v;
      const c = byCat.get(e.categoryId) ?? { categoryId: e.categoryId, name: e.name, nameRu: e.nameRu, amount: 0 };
      c.amount += v;
      byCat.set(e.categoryId, c);
    }

    const rows = [...months.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([m, v]) => ({ month: m, ...v, gross: v.revenue - v.cogs, net: v.revenue - v.cogs - v.expenses }));
    const sum = (k: 'revenue' | 'cogs' | 'expenses') => rows.reduce((s, r) => s + r[k], 0);
    const revenue = sum('revenue');
    const cogs = sum('cogs');
    const expenses = sum('expenses');
    return {
      from: opts.from, to: opts.to, months: rows,
      totals: { revenue, cogs, gross: revenue - cogs, expenses, net: revenue - cogs - expenses, cogsUnknownLines },
      expenses: [...byCat.values()].sort((a, b) => b.amount - a.amount),
      missingRates: [...missingRates],
    };
  });
}
