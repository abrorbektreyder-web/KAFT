// HR-07: muddat eslatmalari va kunlik ish (worker har kuni 08:00 da chaqiradi).
import { and, eq, inArray, isNull, schema, withTenant, type Db } from '@kaft/db';
import { notify } from './notifications.ts';
import type { TelegramPort } from './telegram.ts';
import { deliverTelegram } from './notifications.ts';

export type ReminderKind = 'birthday' | 'probation_end' | 'contract_end' | 'passport_expiry';

/** Necha kun oldin eslatiladi */
export const REMINDER_LEAD: Record<ReminderKind, number> = { birthday: 0, probation_end: 7, contract_end: 30, passport_expiry: 30 };

const TITLE: Record<ReminderKind, string> = {
  birthday: 'Tug‘ilgan kun', probation_end: 'Sinov muddati', contract_end: 'Mehnat shartnomasi', passport_expiry: 'Pasport muddati',
};

export interface ReminderEmployee {
  id: string; lastName: string; firstName: string;
  birthDate: string | null; probationEndsOn: string | null; contractEndsOn: string | null; passportExpiresOn: string | null;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Berilgan kunda yuborilishi kerak bo'lgan eslatmalar (sof mantiq). Matnda maxfiy ma'lumot yo'q. */
export function dueReminders(employees: ReminderEmployee[], on: string) {
  const out: { kind: ReminderKind; employeeId: string; dueOn: string; title: string; text: string }[] = [];
  for (const e of employees) {
    const name = `${e.lastName} ${e.firstName}`;
    const push = (kind: ReminderKind, dueOn: string, text: string) => out.push({ kind, employeeId: e.id, dueOn, title: TITLE[kind], text });
    if (e.birthDate && e.birthDate.slice(5) === on.slice(5)) push('birthday', on, `${name} — bugun tug‘ilgan kuni`);
    const deadlines: [ReminderKind, string | null, string][] = [
      ['probation_end', e.probationEndsOn, 'sinov muddati'],
      ['contract_end', e.contractEndsOn, 'mehnat shartnomasi muddati'],
      ['passport_expiry', e.passportExpiresOn, 'pasport muddati'],
    ];
    for (const [kind, date, what] of deadlines) {
      if (date && addDays(on, REMINDER_LEAD[kind]) === date) push(kind, date, `${name} — ${what} ${dmy(date)} da tugaydi`);
    }
  }
  return out;
}

// Eslatmalar kimga boradi — kadrlar bilan ishlaydiganlar
export const REMINDER_ROLES = ['Ega', 'HR menejer'];

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
            kind: r.kind, title: r.title, body: r.text, link: `/kadrlar/${r.employeeId}`, dedupeKey: `${r.kind}:${r.employeeId}:${r.dueOn}`,
          });
          reminders += created.length;
        }
      }

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
