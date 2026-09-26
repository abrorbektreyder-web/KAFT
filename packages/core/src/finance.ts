// FIN-01…05 (R1): kassalar, kirim/chiqim, o'tkazma va ayirboshlash, Markaziy bank kursi, pul qoldig'i.
// Summalar tiyin/sentda butun son; qoldiq saqlanmaydi — hujjatlardan hisoblanadi (PRD 9.1).
// Hujjatlar o'chirilmaydi — faqat sababi bilan bekor qilinadi (CORE-07).
import { and, desc, eq, inArray, isNull, lte, schema, sql, withTenant, type Db, type Tx } from '@kaft/db';
import { authorize, can, deny, type Ctx } from './permissions.ts';
import type { Scope } from './roles.ts';

export const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const ACCOUNT_TYPES = ['cash', 'bank', 'card', 'payment'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type Direction = 'in' | 'out';

/** Yangi tenantga yoziladigan standart moddalar (ega keyin o'zinikini qo'shadi). */
export const DEFAULT_CATEGORIES: { name: string; nameRu: string; direction: Direction }[] = [
  { name: 'Sotuvdan tushum', nameRu: 'Выручка от продаж', direction: 'in' },
  { name: 'Qarz qaytarildi', nameRu: 'Возврат долга', direction: 'in' },
  { name: 'Kredit olindi', nameRu: 'Получение кредита', direction: 'in' },
  { name: 'Boshqa kirim', nameRu: 'Прочие поступления', direction: 'in' },
  { name: 'Tovar xaridi', nameRu: 'Закупка товаров', direction: 'out' },
  { name: 'Ijara', nameRu: 'Аренда', direction: 'out' },
  { name: 'Oylik', nameRu: 'Зарплата', direction: 'out' },
  { name: 'Soliqlar', nameRu: 'Налоги', direction: 'out' },
  { name: 'Kommunal xizmatlar', nameRu: 'Коммунальные услуги', direction: 'out' },
  { name: 'Transport', nameRu: 'Транспорт', direction: 'out' },
  { name: 'Marketing', nameRu: 'Маркетинг', direction: 'out' },
  { name: 'Bank xizmatlari', nameRu: 'Банковские услуги', direction: 'out' },
  { name: 'Kredit to‘lovi', nameRu: 'Погашение кредита', direction: 'out' },
  { name: 'Boshqa chiqim', nameRu: 'Прочие расходы', direction: 'out' },
];

export type FinErrorCode = 'amount' | 'date' | 'currency' | 'cbu' | 'name' | 'accountNotFound' | 'accountType' | 'rate' | 'direction'
  | 'category' | 'counterparty' | 'document' | 'archived' | 'categoryDirection' | 'sameAccount' | 'toAmountRequired' | 'amountsMismatch' | 'reason' | 'notFound' | 'alreadyCancelled';

/** Pul moduli xatosi: `code` — interfeysda o'quvchi tilidagi matn uchun, `message` — o'zbekcha nusxa. */
export class FinError extends Error {
  readonly code: FinErrorCode;
  constructor(code: FinErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const RATE = /^\d{1,14}(\.\d{1,6})?$/;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());

function checkAmount(n: number, label = 'Summa') {
  if (!Number.isSafeInteger(n) || n <= 0) throw new FinError('amount', `${label} musbat butun son (tiyin/sent) bo‘lishi kerak`);
}
function checkDate(d: string) {
  if (!ISO.test(d)) throw new FinError('date', 'Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
}
function checkCurrency(c: string): asserts c is Currency {
  if (!(CURRENCIES as readonly string[]).includes(c)) throw new FinError('currency', `Noma'lum valyuta: ${c}`);
}

// ---------------------------------------------------------------- kurs arifmetikasi (aniq, BigInt)

// BigInt literallari ishlatilmaydi — web ES2017 ga yig'iladi
const ZERO = BigInt(0);
const TWO = BigInt(2);
const MICRO = BigInt(1_000_000);
/** '12500.5' → 12500500000n (1e-6 aniqlikda) */
function toMicro(rate: string): bigint {
  const [int, frac = ''] = rate.split('.');
  return BigInt(int!) * MICRO + BigInt(frac.padEnd(6, '0').slice(0, 6));
}
function fromMicro(m: bigint): string {
  const int = m / MICRO;
  const frac = (m % MICRO).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : String(int);
}
/** Yarmini yuqoriga yaxlitlab bo'lish (manfiy son uchun ham simmetrik) */
function divRound(a: bigint, b: bigint): bigint {
  const q = (TWO * (a < ZERO ? -a : a) + b) / (TWO * b);
  return a < ZERO ? -q : q;
}
/** Valyuta summasi (sent) → so'm (tiyin), kurs: 1 birlik = N so'm */
export function toUzs(amount: number, rate: string): number {
  return Number(divRound(BigInt(amount) * toMicro(rate), MICRO));
}
/** So'm (tiyin) → valyuta (sent) */
export function fromUzs(uzs: number, rate: string): number {
  return Number(divRound(BigInt(uzs) * MICRO, toMicro(rate)));
}

// ---------------------------------------------------------------- Markaziy bank kurslari (FIN-03, INT-02)

/** Sanadagi (yoki undan oldingi oxirgi) Markaziy bank kursi: 1 birlik = N so'm; topilmasa null. */
export async function rateOn(q: Db | Tx, currency: string, on: string): Promise<string | null> {
  if (currency === 'UZS') return '1';
  const [row] = await q.select({ rate: schema.exchangeRates.rate }).from(schema.exchangeRates)
    .where(and(eq(schema.exchangeRates.currency, currency), lte(schema.exchangeRates.rateDate, on)))
    .orderBy(desc(schema.exchangeRates.rateDate)).limit(1);
  return row ? fromMicro(toMicro(row.rate)) : null;
}

type Fetch = (url: string) => Promise<Response>;

/**
 * Tizim ishi (admin ulanish, worker har kuni): cbu.uz dan kurslarni yuklaydi.
 * Bank dam olish kunida oxirgi ish kuni kursini qaytaradi — javobdagi sana bilan saqlanadi. Qaytaradi: yangi yozuvlar soni.
 */
export async function loadCbuRates(db: Db, opts: { on: string; fetch?: Fetch }) {
  checkDate(opts.on);
  const res = await (opts.fetch ?? fetch)(`https://cbu.uz/uz/arkhiv-kursov-valyut/json/all/${opts.on}/`);
  if (!res.ok) throw new FinError('cbu', `Markaziy bank javobi: ${res.status}`);
  const list = (await res.json()) as { Ccy: string; Rate: string; Nominal: string; Date: string }[];
  const rows = list.filter((r) => r.Ccy !== 'UZS' && (CURRENCIES as readonly string[]).includes(r.Ccy)).map((r) => {
    const [d, m, y] = r.Date.split('.');
    return { rateDate: `${y}-${m}-${d}`, currency: r.Ccy, rate: fromMicro(toMicro(r.Rate) / BigInt(r.Nominal || '1')), source: 'cbu' };
  });
  if (!rows.length) return 0;
  const inserted = await db.insert(schema.exchangeRates).values(rows).onConflictDoNothing().returning({ c: schema.exchangeRates.currency });
  return inserted.length;
}

// ---------------------------------------------------------------- moddalar

export async function listCategories(db: Db, ctx: Ctx, direction?: Direction) {
  await authorize(db, ctx, 'fin', 'view');
  return withTenant(db, ctx.tenantId, (tx) => tx.select({
    id: schema.expenseCategories.id, name: schema.expenseCategories.name, nameRu: schema.expenseCategories.nameRu, direction: schema.expenseCategories.direction,
  }).from(schema.expenseCategories)
    .where(and(eq(schema.expenseCategories.isArchived, false), direction ? eq(schema.expenseCategories.direction, direction) : undefined))
    .orderBy(schema.expenseCategories.direction, schema.expenseCategories.name));
}

export async function createCategory(db: Db, ctx: Ctx, input: { name: string; nameRu?: string; direction: Direction }) {
  const name = input.name.trim();
  if (!name) throw new FinError('name', 'Modda nomi kiritilishi shart');
  if ((await authorize(db, ctx, 'fin', 'create')) !== 'all') await deny(db, ctx, 'fin', 'create');
  const [row] = await withTenant(db, ctx.tenantId, (tx) => tx.insert(schema.expenseCategories)
    .values({ tenantId: ctx.tenantId, name, nameRu: input.nameRu?.trim() || null, direction: input.direction })
    .returning({ id: schema.expenseCategories.id }));
  return row!;
}

// ---------------------------------------------------------------- kassalar (FIN-01)

export interface NewCashAccount {
  companyId: string;
  name: string;
  type: AccountType;
  currency: string;
  responsibleUserId?: string;
  /** Boshlang'ich qoldiq (tiyin/sent); manfiy — overdraft */
  openingBalance?: number;
  openingOn?: string;
}

type Account = typeof schema.cashAccounts.$inferSelect;

async function loadAccount(tx: Tx, id: string): Promise<Account> {
  const [a] = await tx.select().from(schema.cashAccounts).where(eq(schema.cashAccounts.id, id));
  if (!a) throw new FinError('accountNotFound', 'Kassa topilmadi');
  return a;
}

/** «Faqat o'ziniki» qamrovida — faqat mas'uli shu foydalanuvchi bo'lgan kassa. */
async function requireOwn(db: Db, ctx: Ctx, scope: Scope, a: Account, action: 'view' | 'create') {
  if (scope !== 'all' && a.responsibleUserId !== ctx.userId) await deny(db, ctx, 'fin', action, a.id);
}

export async function createCashAccount(db: Db, ctx: Ctx, input: NewCashAccount) {
  const name = input.name.trim();
  if (!name) throw new FinError('name', 'Kassa nomi kiritilishi shart');
  checkCurrency(input.currency);
  if (!(ACCOUNT_TYPES as readonly string[]).includes(input.type)) throw new FinError('accountType', `Noma'lum kassa turi: ${input.type}`);
  const opening = input.openingBalance ?? 0;
  if (opening) checkAmount(Math.abs(opening), 'Boshlang‘ich qoldiq');
  const openingOn = input.openingOn ?? today();
  checkDate(openingOn);
  if ((await authorize(db, ctx, 'fin', 'create')) !== 'all') await deny(db, ctx, 'fin', 'create');

  const currency = input.currency;
  return withTenant(db, ctx.tenantId, async (tx) => {
    const [acc] = await tx.insert(schema.cashAccounts).values({
      tenantId: ctx.tenantId, companyId: input.companyId, name, type: input.type, currency, responsibleUserId: input.responsibleUserId,
    }).returning({ id: schema.cashAccounts.id });
    if (opening) {
      await tx.insert(schema.cashTransactions).values({
        tenantId: ctx.tenantId, accountId: acc!.id, kind: 'opening', direction: opening > 0 ? 'in' : 'out', amount: Math.abs(opening),
        currency, rate: await rateOn(tx, currency, openingOn), occurredOn: openingOn, basis: 'Boshlang‘ich qoldiq', createdBy: ctx.userId,
      });
    }
    await tx.insert(schema.auditLog).values({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'cash_account', entityId: acc!.id, newValue: { ...input, name },
    });
    return acc!;
  });
}

// ---------------------------------------------------------------- kirim / chiqim (FIN-02)

export interface NewTransaction {
  accountId: string;
  direction: Direction;
  amount: number;
  categoryId: string;
  occurredOn: string;
  /** Qo'lda kiritilgan operatsiya kursi (1 birlik = N so'm); berilmasa — Markaziy bank */
  rate?: string;
  counterpartyId?: string;
  /** Qaysi hujjat uchun to'lov: kirim — sotuv, chiqim — xarid (ixtiyoriy) */
  saleId?: string;
  purchaseId?: string;
  basis?: string;
  note?: string;
}

async function operationRate(tx: Tx, currency: string, on: string, manual?: string) {
  if (manual == null) return rateOn(tx, currency, on);
  if (!RATE.test(manual) || toMicro(manual) <= ZERO) throw new FinError('rate', 'Kurs musbat son bo‘lishi kerak (masalan 12650.35)');
  return currency === 'UZS' ? '1' : manual;
}

export async function recordTransaction(db: Db, ctx: Ctx, input: NewTransaction) {
  checkAmount(input.amount);
  checkDate(input.occurredOn);
  if (input.direction !== 'in' && input.direction !== 'out') throw new FinError('direction', 'Yo‘nalish: in yoki out');
  if (!input.categoryId) throw new FinError('category', 'Modda tanlanishi shart');
  const scope = await authorize(db, ctx, 'fin', 'create');

  return withTenant(db, ctx.tenantId, async (tx) => {
    const acc = await loadAccount(tx, input.accountId);
    await requireOwn(db, ctx, scope, acc, 'create');
    if (acc.isArchived) throw new FinError('archived', 'Kassa arxivlangan');
    const [c] = await tx.select({ direction: schema.expenseCategories.direction }).from(schema.expenseCategories)
      .where(eq(schema.expenseCategories.id, input.categoryId));
    if (!c) throw new FinError('category', 'Modda topilmadi');
    if (c.direction !== input.direction) throw new FinError('categoryDirection', input.direction === 'in' ? 'Kirim uchun kirim moddasini tanlang' : 'Chiqim uchun chiqim moddasini tanlang');
    if (input.counterpartyId) {
      const [cp] = await tx.select({ id: schema.counterparties.id }).from(schema.counterparties).where(eq(schema.counterparties.id, input.counterpartyId));
      if (!cp) throw new FinError('counterparty', 'Kontragent topilmadi');
    }
    if (input.saleId || input.purchaseId) {
      const table = input.saleId ? schema.sales : schema.purchases;
      const [doc] = await tx.select({ counterpartyId: table.counterpartyId }).from(table).where(eq(table.id, (input.saleId ?? input.purchaseId)!));
      if (!doc || doc.counterpartyId !== input.counterpartyId || (input.saleId ? input.direction !== 'in' : input.direction !== 'out')) {
        throw new FinError('document', 'Hujjat bu kontragent yoki operatsiya turiga tegishli emas');
      }
    }

    const [row] = await tx.insert(schema.cashTransactions).values({
      tenantId: ctx.tenantId, accountId: acc.id, kind: input.direction === 'in' ? 'income' : 'expense', direction: input.direction,
      amount: input.amount, currency: acc.currency, rate: await operationRate(tx, acc.currency, input.occurredOn, input.rate),
      categoryId: input.categoryId, counterpartyId: input.counterpartyId, saleId: input.saleId, purchaseId: input.purchaseId, occurredOn: input.occurredOn,
      basis: input.basis, note: input.note, createdBy: ctx.userId,
    }).returning({ id: schema.cashTransactions.id });
    await tx.insert(schema.auditLog).values({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'cash_transaction', entityId: row!.id, newValue: { ...input },
    });
    return row!;
  });
}

// ---------------------------------------------------------------- o'tkazma va ayirboshlash

export interface NewTransfer {
  fromAccountId: string;
  toAccountId: string;
  /** Chiquvchi summa — manba kassa valyutasida */
  amount: number;
  /** Kiruvchi summa — valyutalar har xil bo'lsa majburiy (ayirboshlash) */
  toAmount?: number;
  occurredOn: string;
  basis?: string;
  note?: string;
}

/** Kassalararo o'tkazma; valyutalar har xil bo'lsa — ayirboshlash. Ikki yozuv bitta transfer_id bilan. */
export async function transfer(db: Db, ctx: Ctx, input: NewTransfer) {
  checkAmount(input.amount);
  if (input.toAmount != null) checkAmount(input.toAmount, 'Kiruvchi summa');
  checkDate(input.occurredOn);
  if (input.fromAccountId === input.toAccountId) throw new FinError('sameAccount', 'Bir kassaning o‘ziga o‘tkazib bo‘lmaydi');
  const scope = await authorize(db, ctx, 'fin', 'create');

  return withTenant(db, ctx.tenantId, async (tx) => {
    const from = await loadAccount(tx, input.fromAccountId);
    const to = await loadAccount(tx, input.toAccountId);
    // Kassir o'z kassasidan chiqaradi (masalan, inkassatsiya — bankka)
    await requireOwn(db, ctx, scope, from, 'create');
    if (from.isArchived || to.isArchived) throw new FinError('archived', 'Kassa arxivlangan');
    let toAmount = input.toAmount ?? input.amount;
    if (from.currency !== to.currency) {
      if (input.toAmount == null) throw new FinError('toAmountRequired', 'Valyuta ayirboshlashda kiruvchi summa kiritilishi shart');
      toAmount = input.toAmount;
    } else if (toAmount !== input.amount) {
      throw new FinError('amountsMismatch', 'Bir valyutadagi o‘tkazmada summalar teng bo‘lishi kerak');
    }

    const transferId = crypto.randomUUID();
    const common = { tenantId: ctx.tenantId, kind: 'transfer', transferId, occurredOn: input.occurredOn, basis: input.basis, note: input.note, createdBy: ctx.userId };
    const [out, inn] = await tx.insert(schema.cashTransactions).values([
      { ...common, accountId: from.id, direction: 'out', amount: input.amount, currency: from.currency, rate: await rateOn(tx, from.currency, input.occurredOn) },
      { ...common, accountId: to.id, direction: 'in', amount: toAmount, currency: to.currency, rate: await rateOn(tx, to.currency, input.occurredOn) },
    ]).returning({ id: schema.cashTransactions.id, direction: schema.cashTransactions.direction });
    await tx.insert(schema.auditLog).values({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'cash_transfer', entityId: transferId, newValue: { ...input, toAmount },
    });
    const outId = [out, inn].find((r) => r!.direction === 'out')!.id;
    const inId = [out, inn].find((r) => r!.direction === 'in')!.id;
    return { transferId, outId, inId };
  });
}

// ---------------------------------------------------------------- bekor qilish (CORE-07)

/** Hujjatni sababi bilan bekor qiladi; o'tkazma bo'lsa — ikkala tomoni ham. */
export async function cancelTransaction(db: Db, ctx: Ctx, id: string, reason: string) {
  if (!reason.trim()) throw new FinError('reason', 'Bekor qilish sababi kiritilishi shart');
  if ((await authorize(db, ctx, 'fin', 'cancel')) !== 'all') await deny(db, ctx, 'fin', 'cancel', id);
  await withTenant(db, ctx.tenantId, async (tx) => {
    const [row] = await tx.select({ transferId: schema.cashTransactions.transferId, cancelledAt: schema.cashTransactions.cancelledAt })
      .from(schema.cashTransactions).where(eq(schema.cashTransactions.id, id));
    if (!row) throw new FinError('notFound', 'Hujjat topilmadi');
    if (row.cancelledAt) throw new FinError('alreadyCancelled', 'Hujjat allaqachon bekor qilingan');
    const target = row.transferId ? eq(schema.cashTransactions.transferId, row.transferId) : eq(schema.cashTransactions.id, id);
    await tx.update(schema.cashTransactions)
      .set({ cancelledAt: new Date(), cancelReason: reason.trim(), cancelledBy: ctx.userId })
      .where(and(target, isNull(schema.cashTransactions.cancelledAt)));
    await tx.insert(schema.auditLog).values({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'cancel', entity: 'cash_transaction', entityId: id, meta: { reason: reason.trim(), transferId: row.transferId },
    });
  });
}

// ---------------------------------------------------------------- pul qoldig'i (FIN-04)

/**
 * Sanadagi qoldiq: har kassa (o'z valyutasida), kompaniya va jami — so'mda va dollar ekvivalentida.
 * Ekvivalent shu sanadagi Markaziy bank kursi bilan; kurs topilmasa null va `missingRates` da ko'rsatiladi.
 */
export async function balances(db: Db, ctx: Ctx, opts: { on?: string; companyId?: string } = {}) {
  const on = opts.on ?? today();
  checkDate(on);
  const scope = await authorize(db, ctx, 'fin', 'view');

  return withTenant(db, ctx.tenantId, async (tx) => {
    const accounts = await tx.select().from(schema.cashAccounts).where(and(
      opts.companyId ? eq(schema.cashAccounts.companyId, opts.companyId) : undefined,
      scope === 'all' ? undefined : eq(schema.cashAccounts.responsibleUserId, ctx.userId),
    )).orderBy(schema.cashAccounts.createdAt);
    const ids = accounts.map((a) => a.id);
    const sums = ids.length
      ? await tx.select({
        accountId: schema.cashTransactions.accountId,
        balance: sql<string>`coalesce(sum(case when ${schema.cashTransactions.direction} = 'in' then ${schema.cashTransactions.amount} else -${schema.cashTransactions.amount} end), 0)`,
      }).from(schema.cashTransactions)
        .where(and(inArray(schema.cashTransactions.accountId, ids), isNull(schema.cashTransactions.cancelledAt), lte(schema.cashTransactions.occurredOn, on)))
        .groupBy(schema.cashTransactions.accountId)
      : [];
    const balanceOf = new Map(sums.map((s) => [s.accountId, Number(s.balance)]));

    const rates: Record<string, string | null> = { UZS: '1', USD: await rateOn(tx, 'USD', on) };
    for (const c of new Set(accounts.map((a) => a.currency))) if (!(c in rates)) rates[c] = await rateOn(tx, c, on);

    const rows = accounts.map((a) => {
      const balance = balanceOf.get(a.id) ?? 0;
      const rate = rates[a.currency];
      return {
        id: a.id, companyId: a.companyId, name: a.name, type: a.type as AccountType, currency: a.currency as Currency,
        responsibleUserId: a.responsibleUserId, isArchived: a.isArchived, balance, uzs: rate ? toUzs(balance, rate) : null,
      };
    });
    const missingRates = [...new Set(rows.filter((r) => r.balance !== 0 && r.uzs == null).map((r) => r.currency))];
    const sum = (list: typeof rows) => {
      const uzs = list.some((r) => r.balance !== 0 && r.uzs == null) ? null : list.reduce((s, r) => s + (r.uzs ?? 0), 0);
      return { uzs, usd: uzs != null && rates.USD ? fromUzs(uzs, rates.USD) : null };
    };
    const companies = [...new Set(rows.map((r) => r.companyId))].map((companyId) => ({ companyId, ...sum(rows.filter((r) => r.companyId === companyId)) }));
    return { on, accounts: rows, companies, total: sum(rows), rates, missingRates };
  });
}

/** Oxirgi operatsiyalar (yangisi tepada); «faqat o'ziniki» qamrovida — o'z kassalari. */
export async function listTransactions(db: Db, ctx: Ctx, opts: { limit?: number; accountId?: string } = {}) {
  const scope = await authorize(db, ctx, 'fin', 'view');
  const t = schema.cashTransactions;
  const a = schema.cashAccounts;
  const c = schema.expenseCategories;
  return withTenant(db, ctx.tenantId, (tx) => tx.select({
    id: t.id, accountId: t.accountId, accountName: a.name, companyId: a.companyId, kind: t.kind, direction: t.direction,
    amount: t.amount, currency: t.currency, rate: t.rate, categoryName: c.name, categoryNameRu: c.nameRu,
    transferId: t.transferId, occurredOn: t.occurredOn, basis: t.basis, note: t.note,
    createdAt: t.createdAt, cancelledAt: t.cancelledAt, cancelReason: t.cancelReason,
  }).from(t)
    .innerJoin(a, eq(a.id, t.accountId))
    .leftJoin(c, eq(c.id, t.categoryId))
    .where(and(
      opts.accountId ? eq(t.accountId, opts.accountId) : undefined,
      scope === 'all' ? undefined : eq(a.responsibleUserId, ctx.userId),
    ))
    .orderBy(desc(t.occurredOn), desc(t.createdAt))
    .limit(Math.min(opts.limit ?? 50, 500)));
}

/** Interfeys uchun ruxsatlar xulosasi: nimani ko'rsatish/yashirish (tekshiruv baribir har amalda). */
export async function finAccess(db: Db, ctx: Ctx) {
  const [view, create, cancel] = await withTenant(db, ctx.tenantId, (tx) => Promise.all([
    can(tx, ctx.userId, 'fin', 'view'), can(tx, ctx.userId, 'fin', 'create'), can(tx, ctx.userId, 'fin', 'cancel'),
  ]));
  return { view, create, cancel, manage: create === 'all' };
}

