// TG-04: Telegram akkauntini bir martalik kod orqali bog'lash; bot xabarlarini qayta ishlash (grammY'dan mustaqil).
import { createHash, randomInt } from 'node:crypto';
import { and, eq, gt, isNull, schema, sql, type Db, type Tx } from '@kaft/db';

const TTL_MIN = 10;
const hash = (code: string) => createHash('sha256').update(`kaft-tg:${code}`).digest('hex');

/** Joriy tenantda foydalanuvchi uchun kod yaratadi (platformada ko'rsatiladi). */
export async function createLinkCode(tx: Tx, userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const inserted = await tx.insert(schema.telegramLinkCodes)
      .values({ tenantId: sql`app_tenant_id()`, userId, codeHash: hash(code), expiresAt: new Date(Date.now() + TTL_MIN * 60_000) })
      .onConflictDoNothing()
      .returning({ id: schema.telegramLinkCodes.id });
    if (inserted.length) return code;
  }
  throw new Error('Kod yaratib bo‘lmadi — qayta urinib ko‘ring');
}

const HELP = 'Kaft platformasidagi «Telegram’ni bog‘lash» bo‘limidan 6 xonali kodni oling va shu yerga yuboring.';

/** Bot xabari (tizim amali, admin ulanish): kod bo'lsa — bog'laydi, bo'lmasa yo'riqnoma. Javob matnini qaytaradi. */
export async function handleBotMessage(db: Db, msg: { fromId: number; text: string }): Promise<string> {
  const code = /^(?:\/start\s+)?(\d{6})$/.exec(msg.text.trim())?.[1];
  if (!code) return HELP;

  return db.transaction(async (tx) => {
    const [used] = await tx.update(schema.telegramLinkCodes).set({ usedAt: sql`now()` })
      .where(and(eq(schema.telegramLinkCodes.codeHash, hash(code)), isNull(schema.telegramLinkCodes.usedAt), gt(schema.telegramLinkCodes.expiresAt, sql`now()`)))
      .returning({ tenantId: schema.telegramLinkCodes.tenantId, userId: schema.telegramLinkCodes.userId });
    if (!used) return 'Kod yaroqsiz yoki muddati o‘tgan. Platformadan yangi kod oling.';
    await tx.update(schema.users).set({ telegramId: BigInt(msg.fromId) }).where(eq(schema.users.id, used.userId));
    await tx.insert(schema.auditLog).values({ tenantId: used.tenantId, actorUserId: used.userId, action: 'update', entity: 'telegram_link', entityId: used.userId });
    return 'Telegram akkauntingiz Kaft’ga bog‘landi. Endi eslatma va bildirishnomalar shu yerga keladi.';
  });
}
