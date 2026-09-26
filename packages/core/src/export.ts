// CORE-11: ma'lumot eksporti (Excel/CSV) — faqat ko'rish huquqi doirasida (ro'yxat funksiyalari orqali); har eksport audit jurnaliga.
import ExcelJS from 'exceljs';
import { schema, withTenant, type Db } from '@kaft/db';
import type { Ctx } from './permissions.ts';
import { listCounterparties } from './counterparties.ts';
import { listTransactions } from './finance.ts';
import { debtSummary, listPurchases, listSales } from './trade.ts';
import { localName } from './employees.ts';

export const EXPORT_KINDS = ['counterparties', 'sales', 'purchases', 'transactions', 'debts'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
type Cell = string | number | null;
export interface ExportData { kind: ExportKind; title: string; columns: string[]; rows: Cell[][] }

const major = (minor: number | null | undefined) => (minor == null ? null : minor / 100);
const L = (locale: string, uz: string, ru: string) => (locale === 'ru' ? ru : uz);

const ROLE = { customer: ['mijoz', 'клиент'], wholesale: ['ulgurji hamkor', 'оптовый партнёр'], supplier: ['ta’minotchi', 'поставщик'] } as const;
const KIND = { sale: ['sotuv', 'продажа'], return: ['qaytarish', 'возврат'], opening: ['boshlang‘ich qarz', 'начальный долг'], purchase: ['xarid', 'закупка'] } as const;
const pick = (pair: readonly [string, string], locale: string) => pair[locale === 'ru' ? 1 : 0];
const sumText = (totals: Record<string, number>) => Object.entries(totals).map(([c, v]) => `${(v / 100).toFixed(2)} ${c}`).join('; ') || null;

export async function exportData(db: Db, ctx: Ctx, kind: ExportKind, opts: { locale: string }): Promise<ExportData> {
  const l = (uz: string, ru: string) => L(opts.locale, uz, ru);
  let data: ExportData;
  if (kind === 'counterparties') {
    const rows = await listCounterparties(db, ctx, { limit: 1000 });
    data = {
      kind, title: l('Kontragentlar', 'Контрагенты'),
      columns: [l('Nomi', 'Название'), l('Rollar', 'Роли'), l('STIR', 'ИНН'), l('Telefon', 'Телефон'), l('Manzil', 'Адрес'), l('Mas’ul shaxs', 'Контактное лицо'),
        l('Bank', 'Банк'), l('MFO', 'МФО'), l('Hisob raqami', 'Расчётный счёт'), l('Kredit limiti', 'Кредитный лимит'), l('Valyuta', 'Валюта'), l('To‘lov muddati (kun)', 'Срок оплаты (дн.)')],
      rows: rows.map((c) => [c.name, c.roles.map((r) => pick(ROLE[r as keyof typeof ROLE], opts.locale)).join(', '), c.stir, c.phone, c.address, c.contactPerson,
        c.bankName, c.bankMfo, c.bankAccount, major(c.creditLimit), c.creditCurrency, c.paymentTermDays]),
    };
  } else if (kind === 'sales' || kind === 'purchases') {
    const rows = kind === 'sales' ? await listSales(db, ctx, { limit: 1000 }) : await listPurchases(db, ctx, { limit: 1000 });
    data = {
      kind, title: kind === 'sales' ? l('Sotuvlar', 'Продажи') : l('Xaridlar', 'Закупки'),
      columns: [l('Raqam', 'Номер'), l('Turi', 'Тип'), l('Sana', 'Дата'), l('Kontragent', 'Контрагент'), l('Summa', 'Сумма'), l('Valyuta', 'Валюта'),
        l('To‘lov muddati', 'Срок оплаты'), l('Holat', 'Статус')],
      rows: rows.map((d) => [d.number, pick(KIND[d.kind as keyof typeof KIND], opts.locale), d.docDate, d.counterpartyName, (d.kind === 'return' ? -1 : 1) * d.total / 100, d.currency,
        d.dueDate, d.cancelledAt ? l('bekor qilingan', 'отменён') : d.status === 'pending' ? l('tasdiq kutilmoqda', 'на утверждении') : l('amalda', 'проведён')]),
    };
  } else if (kind === 'transactions') {
    const rows = await listTransactions(db, ctx, { limit: 10_000 });
    data = {
      kind, title: l('Pul operatsiyalari', 'Денежные операции'),
      columns: [l('Sana', 'Дата'), l('Kassa', 'Касса'), l('Yo‘nalish', 'Направление'), l('Summa', 'Сумма'), l('Valyuta', 'Валюта'), l('Modda', 'Статья'),
        l('Asos', 'Основание'), l('Izoh', 'Комментарий'), l('Bekor qilingan', 'Отменено')],
      rows: rows.map((t) => [t.occurredOn, t.accountName, t.direction === 'in' ? l('kirim', 'приход') : l('chiqim', 'расход'), (t.direction === 'in' ? 1 : -1) * t.amount / 100,
        t.currency, t.categoryName ? localName({ name: t.categoryName, nameRu: t.categoryNameRu }, opts.locale) : t.kind === 'transfer' ? l('o‘tkazma', 'перевод') : null,
        t.basis, t.note, t.cancelledAt ? t.cancelReason : null]),
    };
  } else {
    const rows = await debtSummary(db, ctx);
    data = {
      kind, title: l('Qarzlar', 'Долги'),
      columns: [l('Kontragent', 'Контрагент'), l('Bizga qarz', 'Нам должны'), l('Bizga qarz, so‘mda', 'Нам должны, в сумах'), l('Bizning qarz', 'Мы должны'),
        l('Bizning qarz, so‘mda', 'Мы должны, в сумах'), l('Eng ko‘p kechikish (kun)', 'Макс. просрочка (дн.)')],
      rows: rows.map((d) => [d.name, sumText(d.receivable), major(d.receivableUzs), sumText(d.payable), major(d.payableUzs), d.overdueDays || null]),
    };
  }
  await withTenant(db, ctx.tenantId, (tx) => tx.insert(schema.auditLog).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'export', entity: kind, meta: { rows: data.rows.length, locale: opts.locale },
  }));
  return data;
}

/** Excel (.xlsx) yoki CSV (UTF-8 BOM, «;» ajratgich — Excel O'zbekiston/Rossiya sozlamalarida to'g'ri ochadi). */
export async function buildExportFile(data: ExportData, format: 'xlsx' | 'csv'): Promise<Buffer> {
  if (format === 'csv') {
    const cell = (v: Cell) => {
      const s = v == null ? '' : String(v);
      return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return Buffer.from(`﻿${[data.columns, ...data.rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`, 'utf8');
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(data.title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(data.columns).font = { bold: true };
  data.rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(10, data.columns[i]!.length + 2, ...data.rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 2))); });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
