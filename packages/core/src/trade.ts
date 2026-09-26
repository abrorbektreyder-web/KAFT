// R1 (9-hafta): tovarlar, sotuv (SAL-01/02/05), xarid (PUR-01/05), boshlang'ich qarz (CP-10), kredit limiti (CP-05) va qarzlar.
// Hujjatlar o'zgarmaydi — faqat sababi bilan bekor qilinadi (CORE-07). Qarz saqlanmaydi — hujjat va to'lovlardan hisoblanadi.
// Ko'p valyuta (egasi qarori, 2026-09-26): qarz hujjat valyutasida; boshqa valyutadagi to'lov to'lov kunidagi kurs bilan
// hujjat valyutasiga o'giriladi; hujjat tanlanmagan to'lov eng eski ochiq hujjatni yopadi; ortiqchasi — avans.
import { and, asc, desc, eq, ilike, inArray, isNull, lte, or, schema, sql, withTenant, type Db, type Tx } from '@kaft/db';
import { authorize, can, deny, type Ctx } from './permissions.ts';
import type { Action, PermModule, Scope } from './roles.ts';
import { messageText, notify } from './notifications.ts';
import { CURRENCIES, fromUzs, rateOn, toUzs } from './finance.ts';

export const PRICE_TYPES = ['retail', 'wholesale', 'special'] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export type TradeErrorCode = 'name' | 'unit' | 'sku' | 'price' | 'lines' | 'qty' | 'discount' | 'product' | 'role' | 'currency' | 'date'
  | 'notFound' | 'returnQty' | 'returnProduct' | 'reason' | 'status' | 'amount' | 'side';

export class TradeError extends Error {
  readonly code: TradeErrorCode;
  constructor(code: TradeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function checkDate(d: string) {
  if (!ISO.test(d)) throw new TradeError('date', 'Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
}
function checkCurrency(c: string) {
  if (!(CURRENCIES as readonly string[]).includes(c)) throw new TradeError('currency', `Noma'lum valyuta: ${c}`);
}
function checkMoney(n: number | null | undefined, label: string, code: TradeErrorCode = 'price') {
  if (n != null && (!Number.isSafeInteger(n) || n < 0)) throw new TradeError(code, `${label} musbat butun son (tiyin/sent) bo‘lishi kerak`);
}

// ---------------------------------------------------------------- miqdor va summa (aniq, BigInt)

const ZERO = BigInt(0);
const THOUSAND = BigInt(1000);
const BP = BigInt(10_000);

/** '2,5' | 2.5 → '2.5' (3 xonagacha); noto'g'ri bo'lsa xato */
export function normalizeQty(q: string | number): string {
  const s = String(q).trim().replace(',', '.');
  if (!/^\d{1,15}(\.\d{1,3})?$/.test(s) || !/[1-9]/.test(s)) throw new TradeError('qty', 'Miqdor musbat son bo‘lishi kerak (masalan 2.5)');
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s.replace(/^0+(?=\d)/, '');
}
const qtyMilli = (q: string) => {
  const [int, frac = ''] = q.split('.');
  return BigInt(int!) * THOUSAND + BigInt(frac.padEnd(3, '0'));
};
/** Bazadagi '100.000' → '100' */
const showQty = (q: string) => (q.includes('.') ? q.replace(/0+$/, '').replace(/\.$/, '') : q);

/** Qator summasi: miqdor × narx × (1 − chegirma), tiyingacha yaxlitlab */
function lineAmount(qty: string, price: number, discountPct = 0) {
  const bp = BigInt(Math.round(discountPct * 100));
  const num = qtyMilli(qty) * BigInt(price) * (BP - bp);
  const den = THOUSAND * BP;
  return Number((num * BigInt(2) + den) / (den * BigInt(2)));
}

// ---------------------------------------------------------------- ruxsat yordamchilari

async function scopeAny(tx: Tx, userId: string, modules: PermModule[], action: Action): Promise<Scope | null> {
  const scopes = await Promise.all(modules.map((m) => can(tx, userId, m, action)));
  return scopes.includes('all') ? 'all' : scopes.find((s) => s) ?? null;
}

async function nextNumber(tx: Tx, tenantId: string, kind: 'sale' | 'return' | 'purchase' | 'opening') {
  const prefix = { sale: 'S', return: 'Q', purchase: 'X', opening: 'B' }[kind];
  const [row] = await tx.insert(schema.docCounters).values({ tenantId, kind, last: 1 })
    .onConflictDoUpdate({ target: [schema.docCounters.tenantId, schema.docCounters.kind], set: { last: sql`${schema.docCounters.last} + 1` } })
    .returning({ last: schema.docCounters.last });
  return `${prefix}-${String(row!.last).padStart(6, '0')}`;
}

type Cp = typeof schema.counterparties.$inferSelect;
async function loadCounterparty(tx: Tx, id: string): Promise<Cp> {
  const [cp] = await tx.select().from(schema.counterparties).where(eq(schema.counterparties.id, id));
  if (!cp) throw new TradeError('notFound', 'Kontragent topilmadi');
  return cp;
}

// ---------------------------------------------------------------- tovarlar

export interface ProductInput {
  name: string;
  unit: string;
  sku?: string | null;
  prices: { retail?: number | null; wholesale?: number | null; special?: number | null };
  currency?: string;
}

export async function createProduct(db: Db, ctx: Ctx, input: ProductInput) {
  const name = input.name?.trim();
  if (!name) throw new TradeError('name', 'Tovar nomi kiritilishi shart');
  const unit = input.unit?.trim();
  if (!unit) throw new TradeError('unit', 'O‘lchov birligini kiriting');
  for (const [k, v] of Object.entries(input.prices)) checkMoney(v, `Narx (${k})`);
  const currency = input.currency ?? 'UZS';
  checkCurrency(currency);
  return withTenant(db, ctx.tenantId, async (tx) => {
    // Tovar qo'shish: savdo, xarid yoki omborda to'liq huquqli (ega, buxgalter, omborchi)
    if ((await scopeAny(tx, ctx.userId, ['sal', 'pur', 'inv'], 'create')) !== 'all') await deny(db, ctx, 'inv', 'create');
    const sku = input.sku?.trim() || null;
    if (sku) {
      const [dup] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.sku, sku));
      if (dup) throw new TradeError('sku', 'Bu SKU bilan tovar allaqachon bor');
    }
    const [row] = await tx.insert(schema.products).values({
      tenantId: ctx.tenantId, name, unit, sku, currency,
      priceRetail: input.prices.retail ?? null, priceWholesale: input.prices.wholesale ?? null, priceSpecial: input.prices.special ?? null,
    }).returning({ id: schema.products.id });
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'product', entityId: row!.id, newValue: { ...input } });
    return row!;
  });
}

export async function listProducts(db: Db, ctx: Ctx, opts: { q?: string; limit?: number } = {}) {
  return withTenant(db, ctx.tenantId, async (tx) => {
    if (!(await scopeAny(tx, ctx.userId, ['sal', 'pur', 'inv'], 'view'))) await deny(db, ctx, 'sal', 'view');
    const q = opts.q?.trim();
    const pattern = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : undefined;
    const t = schema.products;
    return tx.select().from(t)
      .where(and(eq(t.isArchived, false), pattern ? or(ilike(t.name, pattern), ilike(t.sku, pattern)) : undefined))
      .orderBy(t.name).limit(Math.min(opts.limit ?? 500, 2000));
  });
}

// ---------------------------------------------------------------- sotuv

export interface SaleLineInput { productId: string; qty: string | number; price?: number; discountPct?: number }
export interface SaleInput {
  companyId: string;
  counterpartyId: string;
  date: string;
  currency: string;
  priceType: PriceType;
  lines: SaleLineInput[];
  /** Berilmasa — sana + kontragentning to'lov muddati */
  dueDate?: string;
  note?: string;
}

const PRICE_FIELD = { retail: 'priceRetail', wholesale: 'priceWholesale', special: 'priceSpecial' } as const;

/** Kredit limiti tekshiruvi: joriy qarz + yangi sotuv (so'mda, sana kursida) limitdan oshadimi. Kurs yo'q bo'lsa — oshgan deb olinadi. */
async function overLimit(tx: Tx, cp: Cp, currency: string, total: number, on: string) {
  if (cp.creditLimit == null) return false;
  const conv = async (amount: number, cur: string) => {
    const r = await rateOn(tx, cur, on);
    return r ? toUzs(amount, r) : null;
  };
  const debts = await computeDebts(tx, cp.id, on);
  let uzs = 0;
  for (const [cur, amount] of Object.entries(debts.receivable.totals)) {
    const v = await conv(amount, cur);
    if (v == null) return true;
    uzs += v;
  }
  const add = await conv(total, currency);
  const limit = await conv(cp.creditLimit, cp.creditCurrency);
  return add == null || limit == null || uzs + add > limit;
}

async function saleApprovers(tx: Tx) {
  const rows = await tx.selectDistinct({ id: schema.users.id }).from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.userRoles.roleId))
    .where(and(eq(schema.rolePermissions.module, 'sal'), eq(schema.rolePermissions.action, 'approve'), eq(schema.rolePermissions.scope, 'all'), eq(schema.users.isBlocked, false)));
  return rows.map((r) => r.id);
}

export async function createSale(db: Db, ctx: Ctx, input: SaleInput) {
  checkDate(input.date);
  if (input.dueDate) checkDate(input.dueDate);
  checkCurrency(input.currency);
  if (!PRICE_TYPES.includes(input.priceType)) throw new TradeError('price', 'Narx turini tanlang');
  if (!input.lines.length) throw new TradeError('lines', 'Kamida bitta tovar qo‘shing');
  const lines = input.lines.map((l) => {
    checkMoney(l.price, 'Narx');
    if (l.discountPct != null && !(l.discountPct >= 0 && l.discountPct < 100)) throw new TradeError('discount', 'Chegirma 0–99,99 % bo‘lishi kerak');
    return { ...l, qty: normalizeQty(l.qty) };
  });
  const scope = await authorize(db, ctx, 'sal', 'create');

  return withTenant(db, ctx.tenantId, async (tx) => {
    const cp = await loadCounterparty(tx, input.counterpartyId);
    if (scope !== 'all' && cp.managerUserId !== ctx.userId) await deny(db, ctx, 'sal', 'create', cp.id);
    if (!cp.roles.some((r) => r === 'customer' || r === 'wholesale')) throw new TradeError('role', 'Kontragent mijoz yoki ulgurji hamkor emas');
    const products = await tx.select().from(schema.products).where(inArray(schema.products.id, [...new Set(lines.map((l) => l.productId))]));
    const rows = lines.map((l) => {
      const prod = products.find((x) => x.id === l.productId);
      if (!prod) throw new TradeError('product', 'Tovar topilmadi');
      // Avtomatik narx faqat tovar narxi hujjat valyutasida bo'lsa (aks holda narx qo'lda kiritiladi)
      const auto = prod.currency === input.currency ? prod[PRICE_FIELD[input.priceType]] : null;
      const price = l.price ?? auto;
      if (price == null) throw new TradeError('price', `«${prod.name}» uchun bu turdagi narx (${input.currency}) belgilanmagan — narxni kiriting`);
      return { productId: l.productId, qty: l.qty, price, discountPct: String(l.discountPct ?? 0), amount: lineAmount(l.qty, price, l.discountPct) };
    });
    const total = rows.reduce((s, r) => s + r.amount, 0);
    if (total <= 0) throw new TradeError('amount', 'Hujjat summasi noldan katta bo‘lishi kerak');
    const pending = await overLimit(tx, cp, input.currency, total, input.date);

    const number = await nextNumber(tx, ctx.tenantId, 'sale');
    const [sale] = await tx.insert(schema.sales).values({
      tenantId: ctx.tenantId, kind: 'sale', number, companyId: input.companyId, counterpartyId: cp.id, docDate: input.date,
      dueDate: input.dueDate ?? addDays(input.date, cp.paymentTermDays ?? 0), currency: input.currency, priceType: input.priceType,
      total, status: pending ? 'pending' : 'posted', managerUserId: cp.managerUserId ?? ctx.userId, note: input.note, createdBy: ctx.userId,
    }).returning({ id: schema.sales.id });
    await tx.insert(schema.saleLines).values(rows.map((r) => ({ ...r, tenantId: ctx.tenantId, saleId: sale!.id })));
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'sale', entityId: sale!.id, newValue: { number, total, ...input } });
    if (pending) {
      const params = { name: cp.name, number };
      await notify(tx, (await saleApprovers(tx)).filter((id) => id !== ctx.userId), {
        kind: 'sale_over_limit', ...messageText('sale_over_limit', params, 'uz'), params, link: `/savdo/${sale!.id}`, dedupeKey: `sale_over_limit:${sale!.id}`,
      });
    }
    return { id: sale!.id, number, total, status: pending ? 'pending' as const : 'posted' as const };
  });
}

/** SAL-05: qaytarish — asl sotuv narxida; sotilganidan (oldingi qaytarishlarni ayirib) ko'p bo'lmaydi. */
export async function createSaleReturn(db: Db, ctx: Ctx, saleId: string, input: { date: string; lines: { productId: string; qty: string | number }[]; note?: string }) {
  checkDate(input.date);
  if (!input.lines.length) throw new TradeError('lines', 'Kamida bitta tovar qo‘shing');
  const lines = input.lines.map((l) => ({ ...l, qty: normalizeQty(l.qty) }));
  const scope = await authorize(db, ctx, 'sal', 'create');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const sale = await loadSale(db, tx, ctx, saleId, scope, 'create');
    if (sale.kind !== 'sale' || sale.status !== 'posted' || sale.cancelledAt) throw new TradeError('status', 'Faqat amaldagi sotuvdan qaytarish mumkin');
    const sold = await tx.select().from(schema.saleLines).where(eq(schema.saleLines.saleId, saleId));
    const prevReturns = await tx.select({ productId: schema.saleLines.productId, qty: schema.saleLines.qty }).from(schema.saleLines)
      .innerJoin(schema.sales, eq(schema.sales.id, schema.saleLines.saleId))
      .where(and(eq(schema.sales.returnOfId, saleId), isNull(schema.sales.cancelledAt)));
    const rows = lines.map((l) => {
      const src = sold.filter((s) => s.productId === l.productId);
      if (!src.length) throw new TradeError('returnProduct', 'Bu tovar sotuvda yo‘q');
      const soldQty = src.reduce((s, x) => s + qtyMilli(showQty(x.qty)), ZERO);
      const returned = prevReturns.filter((r) => r.productId === l.productId).reduce((s, x) => s + qtyMilli(showQty(x.qty)), ZERO)
        + lines.filter((x) => x !== l && x.productId === l.productId).reduce((s, x) => s + qtyMilli(x.qty), ZERO);
      if (qtyMilli(l.qty) + returned > soldQty) throw new TradeError('returnQty', 'Qaytariladigan miqdor sotilganidan ko‘p');
      const first = src[0]!;
      return { productId: l.productId, qty: l.qty, price: first.price, discountPct: first.discountPct, amount: lineAmount(l.qty, first.price, Number(first.discountPct)) };
    });
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const number = await nextNumber(tx, ctx.tenantId, 'return');
    const [ret] = await tx.insert(schema.sales).values({
      tenantId: ctx.tenantId, kind: 'return', returnOfId: saleId, number, companyId: sale.companyId, counterpartyId: sale.counterpartyId,
      docDate: input.date, dueDate: input.date, currency: sale.currency, priceType: sale.priceType, total, managerUserId: sale.managerUserId,
      note: input.note, createdBy: ctx.userId,
    }).returning({ id: schema.sales.id });
    await tx.insert(schema.saleLines).values(rows.map((r) => ({ ...r, tenantId: ctx.tenantId, saleId: ret!.id })));
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'sale_return', entityId: ret!.id, newValue: { number, saleId, total } });
    return { id: ret!.id, number, total };
  });
}

type SaleRow = typeof schema.sales.$inferSelect;
async function loadSale(db: Db, tx: Tx, ctx: Ctx, id: string, scope: Scope, action: Action): Promise<SaleRow> {
  const [s] = await tx.select().from(schema.sales).where(eq(schema.sales.id, id));
  if (!s) throw new TradeError('notFound', 'Hujjat topilmadi');
  if (scope !== 'all' && s.managerUserId !== ctx.userId) await deny(db, ctx, 'sal', action, id);
  return s;
}

export async function getSale(db: Db, ctx: Ctx, id: string) {
  const scope = await authorize(db, ctx, 'sal', 'view');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const sale = await loadSale(db, tx, ctx, id, scope, 'view');
    const lines = await tx.select({
      id: schema.saleLines.id, productId: schema.saleLines.productId, productName: schema.products.name, unit: schema.products.unit,
      qty: schema.saleLines.qty, price: schema.saleLines.price, discountPct: schema.saleLines.discountPct, amount: schema.saleLines.amount,
    }).from(schema.saleLines).innerJoin(schema.products, eq(schema.products.id, schema.saleLines.productId))
      .where(eq(schema.saleLines.saleId, id)).orderBy(schema.saleLines.id);
    const [cp] = await tx.select({ name: schema.counterparties.name }).from(schema.counterparties).where(eq(schema.counterparties.id, sale.counterpartyId));
    const returns = await tx.select({ id: schema.sales.id, number: schema.sales.number, docDate: schema.sales.docDate, total: schema.sales.total, cancelledAt: schema.sales.cancelledAt })
      .from(schema.sales).where(eq(schema.sales.returnOfId, id)).orderBy(schema.sales.docDate);
    return { ...sale, counterpartyName: cp?.name ?? '', lines: lines.map((l) => ({ ...l, qty: showQty(l.qty), discountPct: Number(l.discountPct) })), returns };
  });
}

export async function listSales(db: Db, ctx: Ctx, opts: { counterpartyId?: string; status?: 'posted' | 'pending'; from?: string; to?: string; limit?: number } = {}) {
  const scope = await authorize(db, ctx, 'sal', 'view');
  const s = schema.sales;
  return withTenant(db, ctx.tenantId, (tx) => tx.select({
    id: s.id, number: s.number, kind: s.kind, docDate: s.docDate, dueDate: s.dueDate, currency: s.currency, total: s.total, status: s.status,
    counterpartyId: s.counterpartyId, counterpartyName: schema.counterparties.name, companyId: s.companyId, cancelledAt: s.cancelledAt,
  }).from(s).innerJoin(schema.counterparties, eq(schema.counterparties.id, s.counterpartyId)).where(and(
    opts.counterpartyId ? eq(s.counterpartyId, opts.counterpartyId) : undefined,
    opts.status ? eq(s.status, opts.status) : undefined,
    opts.from ? sql`${s.docDate} >= ${opts.from}` : undefined,
    opts.to ? lte(s.docDate, opts.to) : undefined,
    scope === 'all' ? undefined : eq(s.managerUserId, ctx.userId),
  )).orderBy(desc(s.docDate), desc(s.number)).limit(Math.min(opts.limit ?? 200, 1000)));
}

export async function approveSale(db: Db, ctx: Ctx, id: string) {
  if ((await authorize(db, ctx, 'sal', 'approve')) !== 'all') await deny(db, ctx, 'sal', 'approve', id);
  await withTenant(db, ctx.tenantId, async (tx) => {
    const done = await tx.update(schema.sales).set({ status: 'posted', approvedBy: ctx.userId, approvedAt: new Date() })
      .where(and(eq(schema.sales.id, id), eq(schema.sales.status, 'pending'), isNull(schema.sales.cancelledAt))).returning({ id: schema.sales.id });
    if (!done.length) throw new TradeError('status', 'Hujjat tasdiq kutmayapti');
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'approve', entity: 'sale', entityId: id });
  });
}

async function cancelDoc(db: Db, ctx: Ctx, table: typeof schema.sales | typeof schema.purchases, module: 'sal' | 'pur', id: string, reason: string) {
  if (!reason.trim()) throw new TradeError('reason', 'Bekor qilish sababi kiritilishi shart');
  if ((await authorize(db, ctx, module, 'cancel')) !== 'all') await deny(db, ctx, module, 'cancel', id);
  await withTenant(db, ctx.tenantId, async (tx) => {
    const done = await tx.update(table).set({ cancelledAt: new Date(), cancelReason: reason.trim(), cancelledBy: ctx.userId })
      .where(and(eq(table.id, id), isNull(table.cancelledAt))).returning({ id: table.id });
    if (!done.length) throw new TradeError('notFound', 'Hujjat topilmadi yoki allaqachon bekor qilingan');
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'cancel', entity: module === 'sal' ? 'sale' : 'purchase', entityId: id, meta: { reason: reason.trim() } });
  });
}
export const cancelSale = (db: Db, ctx: Ctx, id: string, reason: string) => cancelDoc(db, ctx, schema.sales, 'sal', id, reason);
export const cancelPurchase = (db: Db, ctx: Ctx, id: string, reason: string) => cancelDoc(db, ctx, schema.purchases, 'pur', id, reason);

// ---------------------------------------------------------------- xarid (PUR-01)

export interface PurchaseInput {
  companyId: string;
  counterpartyId: string;
  date: string;
  currency: string;
  lines: { productId: string; qty: string | number; price: number }[];
  dueDate?: string;
  note?: string;
}

export async function createPurchase(db: Db, ctx: Ctx, input: PurchaseInput) {
  checkDate(input.date);
  if (input.dueDate) checkDate(input.dueDate);
  checkCurrency(input.currency);
  if (!input.lines.length) throw new TradeError('lines', 'Kamida bitta tovar qo‘shing');
  const lines = input.lines.map((l) => {
    if (l.price == null) throw new TradeError('price', 'Narxni kiriting');
    checkMoney(l.price, 'Narx');
    return { ...l, qty: normalizeQty(l.qty) };
  });
  if ((await authorize(db, ctx, 'pur', 'create')) !== 'all') await deny(db, ctx, 'pur', 'create');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const cp = await loadCounterparty(tx, input.counterpartyId);
    if (!cp.roles.includes('supplier')) throw new TradeError('role', 'Kontragent ta’minotchi emas');
    const found = await tx.select({ id: schema.products.id }).from(schema.products).where(inArray(schema.products.id, [...new Set(lines.map((l) => l.productId))]));
    if (found.length !== new Set(lines.map((l) => l.productId)).size) throw new TradeError('product', 'Tovar topilmadi');
    const rows = lines.map((l) => ({ productId: l.productId, qty: l.qty, price: l.price, amount: lineAmount(l.qty, l.price) }));
    const total = rows.reduce((s, r) => s + r.amount, 0);
    if (total <= 0) throw new TradeError('amount', 'Hujjat summasi noldan katta bo‘lishi kerak');
    const number = await nextNumber(tx, ctx.tenantId, 'purchase');
    const [doc] = await tx.insert(schema.purchases).values({
      tenantId: ctx.tenantId, kind: 'purchase', number, companyId: input.companyId, counterpartyId: cp.id, docDate: input.date,
      dueDate: input.dueDate ?? addDays(input.date, cp.paymentTermDays ?? 0), currency: input.currency, total,
      managerUserId: ctx.userId, note: input.note, createdBy: ctx.userId,
    }).returning({ id: schema.purchases.id });
    await tx.insert(schema.purchaseLines).values(rows.map((r) => ({ ...r, tenantId: ctx.tenantId, purchaseId: doc!.id })));
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'purchase', entityId: doc!.id, newValue: { number, total, ...input } });
    return { id: doc!.id, number, total };
  });
}

export async function getPurchase(db: Db, ctx: Ctx, id: string) {
  await authorize(db, ctx, 'pur', 'view');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const [doc] = await tx.select().from(schema.purchases).where(eq(schema.purchases.id, id));
    if (!doc) throw new TradeError('notFound', 'Hujjat topilmadi');
    const lines = await tx.select({
      id: schema.purchaseLines.id, productId: schema.purchaseLines.productId, productName: schema.products.name, unit: schema.products.unit,
      qty: schema.purchaseLines.qty, price: schema.purchaseLines.price, amount: schema.purchaseLines.amount,
    }).from(schema.purchaseLines).innerJoin(schema.products, eq(schema.products.id, schema.purchaseLines.productId))
      .where(eq(schema.purchaseLines.purchaseId, id)).orderBy(schema.purchaseLines.id);
    const [cp] = await tx.select({ name: schema.counterparties.name }).from(schema.counterparties).where(eq(schema.counterparties.id, doc.counterpartyId));
    return { ...doc, counterpartyName: cp?.name ?? '', lines: lines.map((l) => ({ ...l, qty: showQty(l.qty) })) };
  });
}

export async function listPurchases(db: Db, ctx: Ctx, opts: { counterpartyId?: string; from?: string; to?: string; limit?: number } = {}) {
  await authorize(db, ctx, 'pur', 'view');
  const p = schema.purchases;
  return withTenant(db, ctx.tenantId, (tx) => tx.select({
    id: p.id, number: p.number, kind: p.kind, docDate: p.docDate, dueDate: p.dueDate, currency: p.currency, total: p.total, status: p.status,
    counterpartyId: p.counterpartyId, counterpartyName: schema.counterparties.name, companyId: p.companyId, cancelledAt: p.cancelledAt,
  }).from(p).innerJoin(schema.counterparties, eq(schema.counterparties.id, p.counterpartyId))
    .where(and(
      opts.counterpartyId ? eq(p.counterpartyId, opts.counterpartyId) : undefined,
      opts.from ? sql`${p.docDate} >= ${opts.from}` : undefined,
      opts.to ? lte(p.docDate, opts.to) : undefined,
    ))
    .orderBy(desc(p.docDate), desc(p.number)).limit(Math.min(opts.limit ?? 200, 1000)));
}

/** PUR-05: «kimdan qancha oldik» — davr bo'yicha ta'minotchi yoki tovar kesimida (valyuta alohida). */
export async function purchaseReport(db: Db, ctx: Ctx, opts: { from: string; to: string; by: 'supplier' | 'product' }) {
  checkDate(opts.from);
  checkDate(opts.to);
  await authorize(db, ctx, 'pur', 'view');
  const p = schema.purchases;
  const l = schema.purchaseLines;
  const live = and(eq(p.kind, 'purchase'), eq(p.status, 'posted'), isNull(p.cancelledAt), sql`${p.docDate} between ${opts.from} and ${opts.to}`);
  return withTenant(db, ctx.tenantId, async (tx) => {
    if (opts.by === 'supplier') {
      const rows = await tx.select({
        id: p.counterpartyId, name: schema.counterparties.name, currency: p.currency,
        total: sql<string>`sum(${p.total})`, docs: sql<number>`count(*)::int`,
      }).from(p).innerJoin(schema.counterparties, eq(schema.counterparties.id, p.counterpartyId))
        .where(live).groupBy(p.counterpartyId, schema.counterparties.name, p.currency).orderBy(asc(schema.counterparties.name), asc(p.currency));
      return rows.map((r) => ({ ...r, total: Number(r.total), qty: null as string | null }));
    }
    const rows = await tx.select({
      id: l.productId, name: schema.products.name, currency: p.currency,
      total: sql<string>`sum(${l.amount})`, qty: sql<string>`sum(${l.qty})`, docs: sql<number>`count(distinct ${p.id})::int`,
    }).from(l).innerJoin(p, eq(p.id, l.purchaseId)).innerJoin(schema.products, eq(schema.products.id, l.productId))
      .where(live).groupBy(l.productId, schema.products.name, p.currency).orderBy(asc(schema.products.name), asc(p.currency));
    return rows.map((r) => ({ ...r, total: Number(r.total), qty: showQty(r.qty) }));
  });
}

// ---------------------------------------------------------------- boshlang'ich qarz (CP-10)

export interface OpeningDebtInput {
  counterpartyId: string;
  /** receivable — kontragent bizga qarz; payable — biz qarzdormiz */
  side: 'receivable' | 'payable';
  amount: number;
  currency: string;
  date: string;
  dueDate?: string;
  note?: string;
}

export async function insertOpeningDebt(tx: Tx, ctx: Ctx, input: OpeningDebtInput) {
  const number = await nextNumber(tx, ctx.tenantId, 'opening');
  const values = {
    tenantId: ctx.tenantId, kind: 'opening', number, counterpartyId: input.counterpartyId, docDate: input.date, dueDate: input.dueDate ?? input.date,
    currency: input.currency, total: input.amount, note: input.note ?? 'Boshlang‘ich qarz', createdBy: ctx.userId, managerUserId: null as string | null,
  };
  const [cp] = await tx.select({ managerUserId: schema.counterparties.managerUserId }).from(schema.counterparties).where(eq(schema.counterparties.id, input.counterpartyId));
  values.managerUserId = cp?.managerUserId ?? null;
  const table = input.side === 'receivable' ? schema.sales : schema.purchases;
  const [row] = await tx.insert(table).values(values).returning({ id: table.id });
  await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'opening_debt', entityId: row!.id, newValue: { number, ...input } });
  return { id: row!.id, number };
}

export function checkOpeningDebt(input: OpeningDebtInput) {
  if (input.side !== 'receivable' && input.side !== 'payable') throw new TradeError('side', 'Kim qarzdorligini tanlang');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new TradeError('amount', 'Summa musbat son bo‘lishi kerak');
  checkCurrency(input.currency);
  checkDate(input.date);
  if (input.dueDate) checkDate(input.dueDate);
}

export async function recordOpeningDebt(db: Db, ctx: Ctx, input: OpeningDebtInput) {
  checkOpeningDebt(input);
  if ((await authorize(db, ctx, 'cp', 'create')) !== 'all') await deny(db, ctx, 'cp', 'create');
  return withTenant(db, ctx.tenantId, async (tx) => {
    await loadCounterparty(tx, input.counterpartyId);
    return insertOpeningDebt(tx, ctx, input);
  });
}

// ---------------------------------------------------------------- qarzlar

export interface DebtDoc {
  id: string; kind: string; number: string; docDate: string; dueDate: string; currency: string;
  total: number; returned: number; paid: number; remaining: number; overdue: boolean; overdueDays: number;
}
export interface DebtSide { docs: DebtDoc[]; totals: Record<string, number>; uzs: number | null; advance: Record<string, number> }

type Payment = { amount: number; currency: string; rate: string | null; occurredOn: string; docId: string | null };

type RateFn = (cur: string, date: string) => Promise<string | null>;

/** Kurslar keshi — bir hisob davomida bir sana/valyuta uchun bitta so'rov */
function rateCache(tx: Tx): RateFn {
  const cache = new Map<string, string | null>();
  return async (cur, date) => {
    const k = `${cur}:${date}`;
    if (!cache.has(k)) cache.set(k, await rateOn(tx, cur, date));
    return cache.get(k)!;
  };
}

async function allocate(rate: RateFn, docs: DebtDoc[], payments: Payment[], on: string): Promise<DebtSide> {
  const advance: Record<string, number> = {};
  for (const pmt of payments) {
    let left = pmt.amount;
    const linked = pmt.docId ? docs.filter((d) => d.id === pmt.docId) : [];
    for (const doc of [...linked, ...docs.filter((d) => d.id !== pmt.docId)]) {
      if (left <= 0) break;
      if (doc.remaining <= 0) continue;
      if (doc.currency === pmt.currency) {
        const use = Math.min(left, doc.remaining);
        doc.paid += use;
        doc.remaining -= use;
        left -= use;
        continue;
      }
      // Boshqa valyuta: to'lov kunidagi kurs bilan hujjat valyutasiga (to'lov kursi — operatsiyada yozilgani)
      const payRate = pmt.rate ?? await rate(pmt.currency, pmt.occurredOn);
      const docRate = await rate(doc.currency, pmt.occurredOn);
      if (!payRate || !docRate) continue;
      const avail = fromUzs(toUzs(left, payRate), docRate);
      const use = Math.min(avail, doc.remaining);
      doc.paid += use;
      doc.remaining -= use;
      left = use === avail ? 0 : Math.max(0, left - fromUzs(toUzs(use, docRate), payRate));
    }
    if (left > 0) advance[pmt.currency] = (advance[pmt.currency] ?? 0) + left;
  }
  const totals: Record<string, number> = {};
  let uzs: number | null = 0;
  for (const d of docs) {
    d.overdue = d.remaining > 0 && d.dueDate < on;
    d.overdueDays = d.overdue ? daysBetween(d.dueDate, on) : 0;
    if (d.remaining <= 0) continue;
    totals[d.currency] = (totals[d.currency] ?? 0) + d.remaining;
  }
  for (const [cur, amount] of Object.entries(totals)) {
    const r = await rate(cur, on);
    uzs = uzs != null && r ? uzs + toUzs(amount, r) : null;
  }
  return { docs, totals, uzs, advance };
}

export type Debts = { receivable: DebtSide; payable: DebtSide };

/** Ikki tomonlama qarz sanadagi holatda — barcha (yoki bitta) kontragent uchun uchta so'rov bilan. */
export async function computeDebtsMany(tx: Tx, on: string, counterpartyId?: string): Promise<Map<string, Debts>> {
  const live = <T extends typeof schema.sales | typeof schema.purchases>(t: T) =>
    and(counterpartyId ? eq(t.counterpartyId, counterpartyId) : undefined, eq(t.status, 'posted'), isNull(t.cancelledAt), lte(t.docDate, on));
  const sales = await tx.select().from(schema.sales).where(live(schema.sales)).orderBy(asc(schema.sales.docDate), asc(schema.sales.number));
  const purchases = await tx.select().from(schema.purchases).where(live(schema.purchases)).orderBy(asc(schema.purchases.docDate), asc(schema.purchases.number));
  const c = schema.cashTransactions;
  const pays = await tx.select({
    counterpartyId: c.counterpartyId, amount: c.amount, currency: c.currency, rate: c.rate, occurredOn: c.occurredOn,
    direction: c.direction, saleId: c.saleId, purchaseId: c.purchaseId,
  }).from(c).where(and(
    counterpartyId ? eq(c.counterpartyId, counterpartyId) : sql`${c.counterpartyId} is not null`,
    isNull(c.cancelledAt), lte(c.occurredOn, on), inArray(c.kind, ['income', 'expense']),
  )).orderBy(asc(c.occurredOn), asc(c.createdAt));

  const toDoc = (d: typeof sales[number] | typeof purchases[number], returned = 0): DebtDoc => ({
    id: d.id, kind: d.kind, number: d.number, docDate: d.docDate, dueDate: d.dueDate, currency: d.currency,
    total: d.total, returned, paid: 0, remaining: d.total - returned, overdue: false, overdueDays: 0,
  });
  const rate = rateCache(tx);
  const ids = new Set([...sales.map((x) => x.counterpartyId), ...purchases.map((x) => x.counterpartyId), ...pays.map((x) => x.counterpartyId!)]);
  const out = new Map<string, Debts>();
  for (const id of ids) {
    const cpSales = sales.filter((x) => x.counterpartyId === id);
    const returns = cpSales.filter((x) => x.kind === 'return');
    const receivableDocs = cpSales.filter((x) => x.kind !== 'return')
      .map((x) => toDoc(x, returns.filter((r) => r.returnOfId === x.id).reduce((sum, r) => sum + r.total, 0)));
    const payableDocs = purchases.filter((x) => x.counterpartyId === id).map((x) => toDoc(x));
    const cpPays = pays.filter((x) => x.counterpartyId === id);
    out.set(id, {
      receivable: await allocate(rate, receivableDocs, cpPays.filter((x) => x.direction === 'in').map((x) => ({ ...x, docId: x.saleId })), on),
      payable: await allocate(rate, payableDocs, cpPays.filter((x) => x.direction === 'out').map((x) => ({ ...x, docId: x.purchaseId })), on),
    });
  }
  return out;
}

const emptySide = (): DebtSide => ({ docs: [], totals: {}, uzs: 0, advance: {} });

/** Bitta kontragent bo'yicha ikki tomonlama qarz. */
export async function computeDebts(tx: Tx, counterpartyId: string, on: string): Promise<Debts> {
  return (await computeDebtsMany(tx, on, counterpartyId)).get(counterpartyId) ?? { receivable: emptySide(), payable: emptySide() };
}

export async function counterpartyDebts(db: Db, ctx: Ctx, counterpartyId: string, opts: { on?: string } = {}) {
  const on = opts.on ?? today();
  checkDate(on);
  const scope = await authorize(db, ctx, 'cp', 'view');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const cp = await loadCounterparty(tx, counterpartyId);
    if (scope !== 'all' && cp.managerUserId !== ctx.userId) await deny(db, ctx, 'cp', 'view', counterpartyId);
    return { on, ...(await computeDebts(tx, counterpartyId, on)) };
  });
}

/** Barcha kontragentlar bo'yicha qarz xulosasi (ro'yxat va bosh sahifa uchun) — faqat qarzi borlar. */
export async function debtSummary(db: Db, ctx: Ctx, opts: { on?: string } = {}) {
  const on = opts.on ?? today();
  const scope = await authorize(db, ctx, 'cp', 'view');
  return withTenant(db, ctx.tenantId, async (tx) => {
    const all = await computeDebtsMany(tx, on);
    const cps = all.size ? await tx.select().from(schema.counterparties).where(and(
      inArray(schema.counterparties.id, [...all.keys()]), scope === 'all' ? undefined : eq(schema.counterparties.managerUserId, ctx.userId),
    )) : [];
    const out = [];
    for (const cp of cps) {
      const d = all.get(cp.id)!;
      const overdue = d.receivable.docs.filter((x) => x.overdue);
      if (!Object.keys(d.receivable.totals).length && !Object.keys(d.payable.totals).length) continue;
      out.push({
        counterpartyId: cp.id, name: cp.name, receivable: d.receivable.totals, receivableUzs: d.receivable.uzs,
        payable: d.payable.totals, payableUzs: d.payable.uzs, overdueDays: Math.max(0, ...overdue.map((x) => x.overdueDays)),
      });
    }
    return out.sort((a, b) => (b.receivableUzs ?? 0) - (a.receivableUzs ?? 0));
  });
}
