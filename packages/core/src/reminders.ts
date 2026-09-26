// HR-07: muddat eslatmalari va kunlik ish (worker har kuni 08:00 da chaqiradi).
import { and, eq, inArray, isNull, schema, withTenant, type Db } from '@kaft/db';
import { messageText, notify } from './notifications.ts';
import { checkCashGap } from './planning.ts';
import { documentExpiryReminders } from './documents.ts';
import type { TelegramPort } from './telegram.ts';
import { deliverTelegram } from './notifications.ts';

export type ReminderKind = 'birthday' | 'probation_end' | 'contract_end' | 'passport_expiry';

/** Necha kun oldin eslatiladi */
export const REMINDER_LEAD: Record<ReminderKind, number> = { birthday: 0, probation_end: 7, contract_end: 30, passport_expiry: 30 };

export type Locale = 'uz' | 'ru';
export type ReminderParams = { name: string; date: string };

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

// CORE-08: eslatma matnlari uz/ru. Ism — foydalanuvchi ma'lumoti, tarjima qilinmaydi.
const TEXTS: Record<Locale, Record<ReminderKind, { title: string; body: (p: ReminderParams) => string }>> = {
  uz: {
    birthday: { title: 'Tug‘ilgan kun', body: (p) => `${p.name} — bugun tug‘ilgan kuni` },
    probation_end: { title: 'Sinov muddati', body: (p) => `${p.name} — sinov muddati ${dmy(p.date)} da tugaydi` },
    contract_end: { title: 'Mehnat shartnomasi', body: (p) => `${p.name} — mehnat shartnomasi muddati ${dmy(p.date)} da tugaydi` },
    passport_expiry: { title: 'Pasport muddati', body: (p) => `${p.name} — pasport muddati ${dmy(p.date)} da tugaydi` },
  },
  ru: {
    birthday: { title: 'День рождения', body: (p) => `${p.name} — сегодня день рождения` },
    probation_end: { title: 'Испытательный срок', body: (p) => `${p.name} — испытательный срок заканчивается ${dmy(p.date)}` },
    contract_end: { title: 'Трудовой договор', body: (p) => `${p.name} — срок трудового договора истекает ${dmy(p.date)}` },
    passport_expiry: { title: 'Срок паспорта', body: (p) => `${p.name} — срок паспорта истекает ${dmy(p.date)}` },
  },
};

export const isReminderKind = (k: string): k is ReminderKind => k in REMINDER_LEAD;

/** Eslatma sarlavhasi va matni tanlangan tilda. */
export function reminderText(kind: ReminderKind, params: ReminderParams, locale: string) {
  const t = TEXTS[locale === 'ru' ? 'ru' : 'uz'][kind];
  return { title: t.title, body: t.body(params) };
}

export interface ReminderEmployee {
  id: string; lastName: string; firstName: string;
  birthDate: string | null; probationEndsOn: string | null; contractEndsOn: string | null; passportExpiresOn: string | null;
}

/** Berilgan kunda yuborilishi kerak bo'lgan eslatmalar (sof mantiq). Matnda maxfiy ma'lumot yo'q. */
export function dueReminders(employees: ReminderEmployee[], on: string) {
  const out: { kind: ReminderKind; employeeId: string; dueOn: string; params: ReminderParams; title: string; text: string }[] = [];
  for (const e of employees) {
    const name = `${e.lastName} ${e.firstName}`;
    const push = (kind: ReminderKind, dueOn: string) => {
      const params = { name, date: dueOn };
      const { title, body } = reminderText(kind, params, 'uz');
      out.push({ kind, employeeId: e.id, dueOn, params, title, text: body });
    };
    if (e.birthDate && e.birthDate.slice(5) === on.slice(5)) push('birthday', on);
    const deadlines: [ReminderKind, string | null][] = [
      ['probation_end', e.probationEndsOn], ['contract_end', e.contractEndsOn], ['passport_expiry', e.passportExpiresOn],
    ];
    for (const [kind, date] of deadlines) {
      if (date && addDays(on, REMINDER_LEAD[kind]) === date) push(kind, date);
    }
  }
  return out;
}

// Eslatmalar kimga boradi — kadrlar bilan ishlaydiganlar
export const REMINDER_ROLES = ['Ega', 'HR menejer'];
// Kontragent shartnomasi (CP-08): 30 kun oldin — ega, buxgalter va kontragentning mas'ul menejeri
export const CONTRACT_REMINDER_ROLES = ['Ega', 'Buxgalter'];
export const CONTRACT_REMINDER_LEAD = 30;

/**
 * Kunlik ish (tizim amali): har tenantda eslatmalar → bildirishnomalar, kelajak sanali
 * o'tkazishlarni kartaga qo'llash, so'ng Telegram'ga yuborish. Qayta ishga tushirish xavfsiz.
 */
export async function runDailyJobs(db: Db, opts: { telegram: TelegramPort; on: string; tenantIds?: string[] }) {
  const tenantIds = opts.tenantIds ?? (await db.select({ id: schema.tenants.id }).from(schema.tenants)).map((t) => t.id);
  let reminders = 0;
  for (const tenantId of tenantIds) {
    await withTenant(db, tenantId, async (tx) => {
      const emps = await tx.select({
        id: schema.employees.id, lastName: schema.employees.lastName, firstName: schema.employees.firstName,
        birthDate: schema.employees.birthDate, probationEndsOn: schema.employees.probationEndsOn,
        contractEndsOn: schema.employees.contractEndsOn, passportExpiresOn: schema.employees.passportExpiresOn,
      }).from(schema.employees);
      const due = dueReminders(emps, opts.on);
      if (due.length) {
        const recipients = (await tx.select({ id: schema.users.id }).from(schema.users)
          .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
          .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
          .where(and(inArray(schema.roles.name, REMINDER_ROLES), eq(schema.users.isBlocked, false)))).map((r) => r.id);
        for (const r of due) {
          const created = await notify(tx, [...new Set(recipients)], {
            kind: r.kind, title: r.title, body: r.text, params: r.params, link: `/kadrlar/${r.employeeId}`, dedupeKey: `${r.kind}:${r.employeeId}:${r.dueOn}`,
          });
          reminders += created.length;
        }
      }

      const ending = await tx.select({
        id: schema.contracts.id, number: schema.contracts.number, endsOn: schema.contracts.endsOn,
        counterpartyId: schema.counterparties.id, name: schema.counterparties.name, managerUserId: schema.counterparties.managerUserId,
      }).from(schema.contracts).innerJoin(schema.counterparties, eq(schema.counterparties.id, schema.contracts.counterpartyId))
        .where(eq(schema.contracts.endsOn, addDays(opts.on, CONTRACT_REMINDER_LEAD)));
      if (ending.length) {
        const base = (await tx.select({ id: schema.users.id }).from(schema.users)
          .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
          .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
          .where(and(inArray(schema.roles.name, CONTRACT_REMINDER_ROLES), eq(schema.users.isBlocked, false)))).map((r) => r.id);
        for (const c of ending) {
          const params = { name: c.name, number: c.number, date: c.endsOn! };
          const created = await notify(tx, [...new Set([...base, ...(c.managerUserId ? [c.managerUserId] : [])])], {
            kind: 'cp_contract_end', ...messageText('cp_contract_end', params, 'uz'), params,
            link: `/kontragentlar/${c.counterpartyId}`, dedupeKey: `cp_contract_end:${c.id}:${c.endsOn}`,
          });
          reminders += created.length;
        }
      }

      // FIN-07: prognozda manfiy kun bo'lsa — egaga qizil bayroq (kuniga bir marta)
      reminders += await checkCashGap(tx, opts.on);
      // DOC-03: muddatli hujjatlar (30 kun oldin)
      reminders += await documentExpiryReminders(tx, tenantId, opts.on);

      // Kuni kelgan o'tkazishlar (kiritilganda kelajak sanali bo'lgan)
      const transfers = await tx.select().from(schema.employmentEvents).where(and(
        inArray(schema.employmentEvents.type, ['transfer', 'position_change']),
        eq(schema.employmentEvents.startsOn, opts.on), isNull(schema.employmentEvents.cancelledAt),
      ));
      for (const t of transfers) {
        const p = (t.payload ?? {}) as { departmentId?: string; positionId?: string };
        const set = { ...(p.departmentId ? { departmentId: p.departmentId } : {}), ...(p.positionId ? { positionId: p.positionId } : {}) };
        if (Object.keys(set).length) await tx.update(schema.employees).set(set).where(eq(schema.employees.id, t.employeeId));
      }
    });
  }
  const sent = await deliverTelegram(db, opts.telegram, opts.tenantIds);
  return { reminders, sent };
}
