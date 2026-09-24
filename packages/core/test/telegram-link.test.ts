// TG-04: Telegram akkauntini xodim/foydalanuvchiga bir martalik kod orqali bog'lash.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, createDb, eq, schema, withTenant } from '@kaft/db';
import { createLinkCode, createTenant, createUser, handleBotMessage } from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
let userId: string;
const tgId = () => 800000000 + Math.floor(Math.random() * 1e8);

beforeAll(async () => {
  const t = await createTenant(db, { name: 'Telegram test', slug: `tg-${crypto.randomUUID()}` });
  tenantId = t.id;
  userId = await withTenant(db, tenantId, async (tx) => (await createUser(tx, { fullName: 'Aziz', roles: ['Xodim'] })).id);
});

afterAll(async () => {
  await sql`delete from tenants where id = ${tenantId}`;
  await sql.end();
});

const telegramIdOf = async () => (await withTenant(db, tenantId, (tx) => tx.select().from(schema.users).where(eq(schema.users.id, userId))))[0]!.telegramId;

describe('Telegram bog‘lash', () => {
  it('bir martalik 6 xonali kod bilan /start orqali bog‘lanadi va jurnalga yoziladi', async () => {
    const code = await withTenant(db, tenantId, (tx) => createLinkCode(tx, userId));
    expect(code).toMatch(/^\d{6}$/);
    const from = tgId();
    const reply = await handleBotMessage(db, { fromId: from, text: `/start ${code}` });
    expect(reply).toMatch(/bog‘landi/i);
    expect(await telegramIdOf()).toBe(BigInt(from));

    const logs = await withTenant(db, tenantId, (tx) => tx.select().from(schema.auditLog)
      .where(and(eq(schema.auditLog.entity, 'telegram_link'), eq(schema.auditLog.actorUserId, userId))));
    expect(logs).toHaveLength(1);
  });

  it('kodni oddiy xabar sifatida yuborsa ham ishlaydi', async () => {
    const code = await withTenant(db, tenantId, (tx) => createLinkCode(tx, userId));
    expect(await handleBotMessage(db, { fromId: tgId(), text: ` ${code} ` })).toMatch(/bog‘landi/i);
  });

  it('bir kod ikki marta ishlamaydi', async () => {
    const code = await withTenant(db, tenantId, (tx) => createLinkCode(tx, userId));
    await handleBotMessage(db, { fromId: tgId(), text: code });
    expect(await handleBotMessage(db, { fromId: tgId(), text: code })).toMatch(/yaroqsiz/i);
  });

  it('muddati o‘tgan kod ishlamaydi', async () => {
    const code = await withTenant(db, tenantId, (tx) => createLinkCode(tx, userId));
    await sql`update telegram_link_codes set expires_at = now() - interval '1 minute' where user_id = ${userId} and used_at is null`;
    expect(await handleBotMessage(db, { fromId: tgId(), text: code })).toMatch(/yaroqsiz/i);
  });

  it('boshqa matnga — yo‘riqnoma', async () => {
    expect(await handleBotMessage(db, { fromId: tgId(), text: 'salom' })).toMatch(/6 xonali kod/i);
  });
});
