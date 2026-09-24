// CORE-06: audit jurnali o'chirilmas — uni hech kim, jumladan ega va admin ham, o'zgartira yoki o'chira olmaydi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, withTenant } from '../src/index.ts';
import { auditLog } from '../src/schema.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  const [a] = await sql`insert into tenants (name, slug) values ('Audit A', ${'audit-a-' + crypto.randomUUID()}) returning id`;
  const [b] = await sql`insert into tenants (name, slug) values ('Audit B', ${'audit-b-' + crypto.randomUUID()}) returning id`;
  tenantA = a!.id;
  tenantB = b!.id;
});

afterAll(async () => {
  await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
  await sql.end();
});

const write = (tenantId: string, entityId: string) =>
  withTenant(db, tenantId, (tx) =>
    tx.insert(auditLog).values({ tenantId, action: 'update', entity: 'companies', entityId, oldValue: { name: 'eski' }, newValue: { name: 'yangi' } }).returning(),
  );

describe('audit jurnali', () => {
  it('ilova o‘z tenantiga yozadi va faqat o‘zinikini o‘qiydi', async () => {
    await write(tenantA, 'a-1');
    await write(tenantB, 'b-1');
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(auditLog));
    expect(rows.map((r) => r.entityId)).toEqual(['a-1']);
    expect(rows[0]!.oldValue).toEqual({ name: 'eski' });
    expect(rows[0]!.at).toBeInstanceOf(Date);
  });

  it('ilova yozuvni o‘zgartira olmaydi', async () => {
    const [row] = await write(tenantA, 'a-2');
    await expect(
      withTenant(db, tenantA, (tx) => tx.update(auditLog).set({ action: 'soxta' }).where(eq(auditLog.id, row!.id))),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('ilova yozuvni o‘chira olmaydi', async () => {
    const [row] = await write(tenantA, 'a-3');
    await expect(
      withTenant(db, tenantA, (tx) => tx.delete(auditLog).where(eq(auditLog.id, row!.id))),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('admin ham yozuvni o‘zgartira olmaydi', async () => {
    const [row] = await write(tenantA, 'a-4');
    await expect(sql`update audit_log set action = 'soxta' where id = ${row!.id}`).rejects.toThrow(/o'chirilmas/);
  });

  it('admin ham yozuvni to‘g‘ridan-to‘g‘ri o‘chira olmaydi', async () => {
    const [row] = await write(tenantA, 'a-5');
    await expect(sql`delete from audit_log where id = ${row!.id}`).rejects.toThrow(/o'chirilmas/);
  });

  it('tenant shartnoma tugab o‘chirilganda jurnali ham o‘chadi (PRD 10: 30 kunda o‘chirish)', async () => {
    const [t] = await sql`insert into tenants (name, slug) values ('Ketgan', ${'ketgan-' + crypto.randomUUID()}) returning id`;
    await write(t!.id, 'k-1');
    await sql`delete from tenants where id = ${t!.id}`;
    const [row] = await sql`select count(*)::int as count from audit_log where tenant_id = ${t!.id}`;
    expect(row!.count).toBe(0);
  });
});
