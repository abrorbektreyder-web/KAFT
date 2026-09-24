// Yangi mijozni ochish: bitta kod bazasida har tadbirkor — alohida tenant, o'z brendi va modullari bilan.
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, withTenant } from '@kaft/db';
import { createTenant, isModuleEnabled, setModule, MODULES } from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
const created: string[] = [];

afterAll(async () => {
  if (created.length) await sql`delete from tenants where id in ${sql(created)}`;
  await sql.end();
});

describe('createTenant', () => {
  it('tenant, brend va barcha modullarni yoqilgan holda yaratadi', async () => {
    const t = await createTenant(db, { name: 'Baraka Savdo', slug: `baraka-${crypto.randomUUID()}`, brandName: 'Baraka ERP', brandColor: '#0A7D4F' });
    created.push(t.id);

    expect(t.brandName).toBe('Baraka ERP');
    // Bitta tranzaksiyada — masofaviy bazada 16 ta alohida so'rov sekin
    const all = await withTenant(db, t.id, async (tx) => { const r = []; for (const m of MODULES) r.push(await isModuleEnabled(tx, m)); return r; });
    expect(all.every(Boolean)).toBe(true);
  });

  it('faqat tanlangan modullarni yoqadi — qolganlari o‘chiq', async () => {
    const t = await createTenant(db, { name: 'Kichik biznes', slug: `kichik-${crypto.randomUUID()}`, modules: ['hr', 'fin'] });
    created.push(t.id);

    const check = (m: (typeof MODULES)[number]) => withTenant(db, t.id, (tx) => isModuleEnabled(tx, m));
    expect(await check('hr')).toBe(true);
    expect(await check('fin')).toBe(true);
    expect(await check('inv')).toBe(false);
    expect(await check('core')).toBe(true); // yadro doim yoqiq
  });

  it('modulni keyin yoqish va o‘chirish mumkin', async () => {
    const t = await createTenant(db, { name: 'Moslash', slug: `moslash-${crypto.randomUUID()}`, modules: ['hr'] });
    created.push(t.id);

    await withTenant(db, t.id, (tx) => setModule(tx, 'inv', true));
    expect(await withTenant(db, t.id, (tx) => isModuleEnabled(tx, 'inv'))).toBe(true);
    await withTenant(db, t.id, (tx) => setModule(tx, 'inv', false));
    expect(await withTenant(db, t.id, (tx) => isModuleEnabled(tx, 'inv'))).toBe(false);
  });

  it('yadro modulini o‘chirib bo‘lmaydi', async () => {
    const t = await createTenant(db, { name: 'Yadro', slug: `yadro-${crypto.randomUUID()}` });
    created.push(t.id);
    await expect(withTenant(db, t.id, (tx) => setModule(tx, 'core', false))).rejects.toThrow(/yadro/i);
  });

  it('bir tenant boshqasining modulini o‘zgartira olmaydi', async () => {
    const a = await createTenant(db, { name: 'A', slug: `a-${crypto.randomUUID()}`, modules: ['hr'] });
    const b = await createTenant(db, { name: 'B', slug: `b-${crypto.randomUUID()}`, modules: ['hr'] });
    created.push(a.id, b.id);

    await withTenant(db, a.id, (tx) => setModule(tx, 'inv', true));
    expect(await withTenant(db, b.id, (tx) => isModuleEnabled(tx, 'inv'))).toBe(false);
  });
});
