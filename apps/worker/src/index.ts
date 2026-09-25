// Fon ishlari: kunlik eslatmalar va Markaziy bank kurslari (08:00, Toshkent), Telegram bot (TG-01/04).
//   node src/index.ts          — doimiy ishlaydi
//   node src/index.ts --once   — kunlik ishni bir marta bajarib chiqadi (tekshirish uchun)
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Bot } from 'grammy';
import { PgBoss } from 'pg-boss';
import { createDb } from '@kaft/db';
import { handleBotMessage, loadCbuRates, runDailyJobs, type TelegramPort } from '@kaft/core';

const envFile = resolve(import.meta.dirname, '../../../.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL topilmadi');

const TZ = 'Asia/Tashkent';
const todayInTashkent = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

const { db, sql } = createDb(process.env.DATABASE_URL);
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? new Bot(token) : null;

const telegram: TelegramPort = bot
  ? { send: async (chatId, text) => { await bot.api.sendMessage(chatId, text); } }
  : { send: async (chatId, text) => console.log(`[telegram → ${chatId}] ${text.replace(/\n/g, ' | ')}`) };

async function daily() {
  const on = todayInTashkent();
  // Kurs yuklanmasa ham eslatmalar ketadi; ertasi kuni qayta urinadi, qoldiq oxirgi kurs bilan hisoblanadi
  try {
    console.log(`Markaziy bank kurslari ${on}: yangi ${await loadCbuRates(db, { on })}`);
  } catch (e) {
    console.error('Kurs yuklanmadi:', e);
  }
  const res = await runDailyJobs(db, { telegram, on });
  console.log(`Kunlik ish ${on}: eslatmalar ${res.reminders}, Telegram'ga yuborildi ${res.sent}`);
}

if (process.argv.includes('--once')) {
  await daily();
  await sql.end();
} else {
  const boss = new PgBoss(process.env.DATABASE_URL);
  boss.on('error', (e) => console.error('pg-boss:', e));
  await boss.start();
  await boss.createQueue('daily');
  await boss.schedule('daily', '0 8 * * *', null, { tz: TZ });
  await boss.work('daily', daily);
  console.log('Worker ishga tushdi: kunlik ish har kuni 08:00 (Toshkent)');

  if (bot) {
    bot.on('message:text', async (ctx) => ctx.reply(await handleBotMessage(db, { fromId: ctx.from.id, text: ctx.message.text })));
    void bot.start({ onStart: (me) => console.log(`Telegram bot: @${me.username}`) });
  } else {
    console.log('TELEGRAM_BOT_TOKEN yo‘q — xabarlar konsolga chiqadi');
  }

  const shutdown = async () => {
    await bot?.stop();
    await boss.stop();
    await sql.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
