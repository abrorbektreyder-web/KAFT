// HR-01/02: xodim kartasi. Maxfiy maydonlar (pasport, JShShIR, karta) faqat ruxsatli rolga ochiladi
// va har o'qish audit jurnaliga yoziladi (PRD 10, CORE-06).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, createDb, eq, schema, withTenant } from '@kaft/db';
import { createEmployee, createTenant, createUser, ForbiddenError, getEmployee, updateSecrets } from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
let companyId: string;
const u: Record<string, string> = {};

beforeAll(async () => {
  const t = await createTenant(db, { name: 'Kadr test', slug: `kadr-${crypto.randomUUID()}` });
  tenantId = t.id;
  await withTenant(db, tenantId, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId, name: 'Savdo Markaz' }).returning();
    companyId = c!.id;
    for (const [k, role] of [['hr', 'HR menejer'], ['direktor', 'Direktor'], ['savdo', 'Savdo menejeri'], ['xodim', 'Xodim'], ['xodim2', 'Xodim']] as const) {
      u[k] = (await createUser(tx, { fullName: k, roles: [role] })).id;
    }
  });
});

afterAll(async () => {
  await sql`delete from tenants where id = ${tenantId}`;
  await sql.end();
});

const ctx = (k: string) => ({ tenantId, userId: u[k]! });
// JShShIR tenant ichida takrorlanmas — har xodimga alohida raqam
let seq = 0;
const secretsFor = () => ({ passport: 'AB1234567', jshshir: String(31234567890100 + ++seq), bankCard: '8600123412341234' });

async function newEmployee(userId?: string) {
  const secrets = secretsFor();
  const { id } = await createEmployee(db, ctx('hr'), {
    companyId, lastName: 'Karimov', firstName: 'Aziz', birthDate: '1990-05-14', phone: '+998901234567', userId, secrets,
  });
  return { id, secrets };
}

describe('xodim kartasi', () => {
  it('HR xodim yaratadi; oddiy o‘qishda maxfiy maydonlar qaytmaydi', async () => {
    const { id } = await newEmployee();
    const e = await getEmployee(db, ctx('hr'), id);
    expect(e).toMatchObject({ lastName: 'Karimov', firstName: 'Aziz', birthDate: '1990-05-14' });
    expect(e).not.toHaveProperty('secrets');
  });

  it('HR maxfiy maydonlarni ko‘radi va bu audit jurnaliga yoziladi', async () => {
    const { id, secrets } = await newEmployee();
    const e = await getEmployee(db, ctx('hr'), id, { withSecrets: true });
    expect(e.secrets).toEqual(secrets);

    const logs = await withTenant(db, tenantId, (tx) => tx.select().from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'read'), eq(schema.auditLog.entity, 'employee.secret'), eq(schema.auditLog.entityId, id))));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.actorUserId).toBe(u.hr);
  });

  it('direktor kartani ko‘radi, lekin maxfiy maydonlarni ocholmaydi', async () => {
    const { id } = await newEmployee();
    await expect(getEmployee(db, ctx('direktor'), id)).resolves.toMatchObject({ id });
    await expect(getEmployee(db, ctx('direktor'), id, { withSecrets: true })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('xodim faqat o‘z kartasini (maxfiy maydonlari bilan) ko‘radi', async () => {
    const own = await newEmployee(u.xodim);
    const other = await newEmployee(u.xodim2);
    await expect(getEmployee(db, ctx('xodim'), own.id, { withSecrets: true })).resolves.toMatchObject({ secrets: own.secrets });
    await expect(getEmployee(db, ctx('xodim'), other.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('kadrlarga huquqi yo‘q rol xodim qo‘sha olmaydi', async () => {
    await expect(createEmployee(db, ctx('savdo'), { companyId, lastName: 'X', firstName: 'Y' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('maxfiy maydon o‘zgarganda jurnalga faqat niqoblangan qiymat yoziladi', async () => {
    const { id } = await newEmployee();
    await updateSecrets(db, ctx('hr'), id, { passport: 'AC7654321' });
    const [log] = await withTenant(db, tenantId, (tx) => tx.select().from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'update'), eq(schema.auditLog.entity, 'employee.secret'), eq(schema.auditLog.entityId, id))));
    expect(log!.oldValue).toEqual({ passport: '*****4567' });
    expect(log!.newValue).toEqual({ passport: '*****4321' });
    expect(JSON.stringify(log)).not.toContain('AC7654321');
  });

  it('JShShIR 14 raqamdan iborat bo‘lishi shart', async () => {
    await expect(createEmployee(db, ctx('hr'), { companyId, lastName: 'X', firstName: 'Y', secrets: { jshshir: '123' } })).rejects.toThrow(/JShShIR/);
  });
});
