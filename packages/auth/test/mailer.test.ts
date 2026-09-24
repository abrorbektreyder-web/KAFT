import { describe, expect, it } from 'vitest';
import { ConsoleMailer } from '../src/index.ts';

describe('ConsoleMailer hisoboti', () => {
  it('yuborilgan xatlar soni va ro‘yxatini chiqaradi', async () => {
    const m = new ConsoleMailer({ quiet: true });
    await m.send({ to: 'a@kaft.test', subject: 'Taklif', text: '1' });
    await m.send({ to: 'b@kaft.test', subject: 'Parolni tiklash', text: '2' });
    const r = m.report();
    expect(r).toMatch(/Yuborilgan xatlar: 2/);
    expect(r).toContain('a@kaft.test — Taklif');
    expect(r).toContain('b@kaft.test — Parolni tiklash');
  });

  it('xat bo‘lmasa — bo‘shligini aytadi', () => {
    expect(new ConsoleMailer({ quiet: true }).report()).toMatch(/Yuborilgan xatlar: 0/);
  });
});
