// CORE-10: bildirishnomalar markazi (platformada va Telegram'da, turlari bo'yicha sozlanadi).
import { and, eq, inArray, isNull, schema, sql, type Db, type Tx } from '@kaft/db';
import type { TelegramPort } from './telegram.ts';
import { isReminderKind, reminderText, type ReminderParams } from './reminders.ts';

export interface NewNotification {
  kind: string;
  title: string;
  body: string;
  link?: string;
  /** Matn qiymatlari — o'quvchi tilida qayta yig'ish uchun */
  params?: Record<string, unknown>;
  /** Bir xil kalit bilan ikkinchi marta yaratilmaydi */
  dedupeKey: string;
}

/** Joriy tenantda foydalanuvchilarga bildirishnoma yaratadi (sozlamalarni hisobga olib). */
export async function notify(tx: Tx, userIds: string[], n: NewNotification) {
  if (!userIds.length) return [];
  const prefs = await tx.select().from(schema.notificationPrefs)
    .where(and(inArray(schema.notificationPrefs.userId, userIds), eq(schema.notificationPrefs.kind, n.kind)));
  const pref = (id: string) => prefs.find((p) => p.userId === id) ?? { inApp: true, telegram: true };
  const targets = userIds.filter((id) => pref(id).inApp || pref(id).telegram);
  if (!targets.length) return [];
  return tx.insert(schema.notifications)
    .values(targets.map((userId) => ({ ...n, userId, tenantId: sql`app_tenant_id()`, viaTelegram: pref(userId).telegram })))
    .onConflictDoNothing()
    .returning({ id: schema.notifications.id });
}

export async function setNotificationPref(tx: Tx, userId: string, kind: string, p: { inApp?: boolean; telegram?: boolean }) {
  await tx.insert(schema.notificationPrefs).values({ tenantId: sql`app_tenant_id()`, userId, kind, ...p })
    .onConflictDoUpdate({ target: [schema.notificationPrefs.userId, schema.notificationPrefs.kind], set: p });
}

/** Tizim ishi (admin ulanish): yuborilmagan Telegram bildirishnomalarini jo'natadi. */
export async function deliverTelegram(db: Db, telegram: TelegramPort, tenantIds?: string[]) {
  const pending = await db
    .select({
      id: schema.notifications.id, kind: schema.notifications.kind, params: schema.notifications.params,
      title: schema.notifications.title, body: schema.notifications.body, chatId: schema.users.telegramId, locale: schema.users.locale,
    })
    .from(schema.notifications)
    .innerJoin(schema.users, eq(schema.users.id, schema.notifications.userId))
    .where(and(
      isNull(schema.notifications.telegramSentAt), eq(schema.notifications.viaTelegram, true),
      sql`${schema.users.telegramId} is not null`, eq(schema.users.isBlocked, false),
      ...(tenantIds ? [inArray(schema.notifications.tenantId, tenantIds)] : []),
    ));
  let sent = 0;
  for (const n of pending) {
    // Qabul qiluvchining tilida (CORE-08)
    const { title, body } = localize(n, n.locale);
    await telegram.send(String(n.chatId), `Kaft · ${title}\n${body}`);
    await db.update(schema.notifications).set({ telegramSentAt: new Date() }).where(eq(schema.notifications.id, n.id));
    sent++;
  }
  return sent;
}

const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
type P = Record<string, string>;

// CORE-08: kadr eslatmalaridan tashqari turlar matni (uz/ru). Nomlar — foydalanuvchi ma'lumoti, tarjima qilinmaydi.
const MESSAGES: Record<string, Record<'uz' | 'ru', { title: string; body: (p: P) => string }>> = {
  cp_contract_end: {
    uz: { title: 'Kontragent shartnomasi', body: (p) => `${p.name} — shartnoma №${p.number} muddati ${dmy(p.date!)} da tugaydi` },
    ru: { title: 'Договор с контрагентом', body: (p) => `${p.name} — срок договора №${p.number} истекает ${dmy(p.date!)}` },
  },
  sale_over_limit: {
    uz: { title: 'Kredit limiti', body: (p) => `${p.name} — ${p.number} sotuv kredit limitidan oshdi, tasdiqingiz kerak` },
    ru: { title: 'Кредитный лимит', body: (p) => `${p.name} — продажа ${p.number} превышает кредитный лимит, нужно ваше утверждение` },
  },
  change_request: {
    uz: { title: 'Tasdiq so‘rovi', body: (p) => `${p.requester} «${p.name}» ma’lumotlarini o‘zgartirishni so‘radi` },
    ru: { title: 'Запрос на изменение', body: (p) => `${p.requester} просит изменить данные «${p.name}»` },
  },
  change_decided: {
    uz: { title: 'So‘rov ko‘rib chiqildi', body: (p) => (p.decision === 'approved' ? `«${p.name}» o‘zgarishi tasdiqlandi` : `«${p.name}» o‘zgarishi rad etildi: ${p.reason}`) },
    ru: { title: 'Запрос рассмотрен', body: (p) => (p.decision === 'approved' ? `Изменение «${p.name}» одобрено` : `Изменение «${p.name}» отклонено: ${p.reason}`) },
  },
};

/** Bildirishnoma sarlavhasi va matni tanlangan tilda (MESSAGES turlari uchun). */
export function messageText(kind: string, params: P, locale: string) {
  const m = MESSAGES[kind]![locale === 'ru' ? 'ru' : 'uz'];
  return { title: m.title, body: m.body(params) };
}

/** Bildirishnoma matni o'quvchi tilida (ma'lum tur + qiymatlar bo'lsa), aks holda saqlangan nusxa. */
export function localize(n: { kind: string; params: unknown; title: string; body: string }, locale: string) {
  if (!n.params) return { title: n.title, body: n.body };
  if (isReminderKind(n.kind)) return reminderText(n.kind, n.params as ReminderParams, locale);
  if (n.kind in MESSAGES) return messageText(n.kind, n.params as P, locale);
  return { title: n.title, body: n.body };
}
