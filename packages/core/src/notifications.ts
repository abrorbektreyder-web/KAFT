// CORE-10: bildirishnomalar markazi (platformada va Telegram'da, turlari bo'yicha sozlanadi).
import { and, eq, inArray, isNull, schema, sql, type Db, type Tx } from '@kaft/db';
import type { TelegramPort } from './telegram.ts';

export interface NewNotification {
  kind: string;
  title: string;
  body: string;
  link?: string;
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
    .select({ id: schema.notifications.id, title: schema.notifications.title, body: schema.notifications.body, chatId: schema.users.telegramId })
    .from(schema.notifications)
    .innerJoin(schema.users, eq(schema.users.id, schema.notifications.userId))
    .where(and(
      isNull(schema.notifications.telegramSentAt), eq(schema.notifications.viaTelegram, true),
      sql`${schema.users.telegramId} is not null`, eq(schema.users.isBlocked, false),
      ...(tenantIds ? [inArray(schema.notifications.tenantId, tenantIds)] : []),
    ));
  let sent = 0;
  for (const n of pending) {
    await telegram.send(String(n.chatId), `Kaft · ${n.title}\n${n.body}`);
    await db.update(schema.notifications).set({ telegramSentAt: new Date() }).where(eq(schema.notifications.id, n.id));
    sent++;
  }
  return sent;
}
