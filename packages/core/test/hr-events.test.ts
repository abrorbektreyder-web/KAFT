// HR-03/04/05/06 bazada: hodisalar, holat, «Kim qayerda», kadr kalendari, ta'til qoldig'i. AC-3.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, eq, schema, withTenant } from '@kaft/db';
import {
  absenceCalendar, cancelEvent, createEmployee, createTenant, createUser, employeeStatus, ForbiddenError,
  getEmployee, headcount, leaveBalance, recordEvent,
} from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
let companyId: string;
let deptA: string;
let deptB: string;
let hrId: string;
let savdoId: string;

beforeAll(async () => {
  const t = await createTenant(db, { name: 'Hodisa test', slug: `hodisa-${crypto.randomUUID()}` });
  tenantId = t.id;
  await withTenant(db, tenantId, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId, name: 'Oziq-ovqat Servis' }).returning();
    companyId = c!.id;
    const ds = await tx.insert(schema.departments).values([{ tenantId, companyId, name: 'Oshxona' }, { tenantId, companyId, name: 'Kassa' }]).returning();
    deptA = ds[0]!.id;
    deptB = ds[1]!.id;
    hrId = (await createUser(tx, { fullName: 'HR', roles: ['HR menejer'] })).id;
    savdoId = (await createUser(tx, { fullName: 'Savdo', roles: ['Savdo menejeri'] })).id;
  });
});

afterAll(async () => {
  await sql`delete from tenants where id = ${tenantId}`;
  await sql.end();
});

const ctx = () => ({ tenantId, userId: hrId });
const hire = async (name: string, departmentId = deptA, hiredAt = '2025-03-01') =>
  (await createEmployee(db, ctx(), { companyId, departmentId, lastName: name, firstName: 'X', hiredAt })).id;

describe('kadr hodisalari', () => {
  it('AC-3: 1-oktabrdan dikret — holat va «Kim qayerda» o‘zgaradi', async () => {
    const id = await hire('Dikret');
    await recordEvent(db, ctx(), id, { type: 'maternity', startsOn: '2026-10-01', basis: 'Buyruq №45' });

    expect(await employeeStatus(db, ctx(), id, '2026-09-30')).toBe('active');
    expect(await employeeStatus(db, ctx(), id, '2026-10-01')).toBe('maternity');
    const before = await headcount(db, ctx(), { on: '2026-09-30' });
    const after = await headcount(db, ctx(), { on: '2026-10-01' });
    expect(after.maternity).toBe(before.maternity + 1);
    expect(after.active).toBe(before.active - 1);
  });

  it('bir xodimning oraliqlari ustma-ust tushsa — rad etiladi', async () => {
    const id = await hire('Ustma');
    await recordEvent(db, ctx(), id, { type: 'vacation', startsOn: '2026-07-01', endsOn: '2026-07-14' });
    await expect(recordEvent(db, ctx(), id, { type: 'sick', startsOn: '2026-07-10', endsOn: '2026-07-12' })).rejects.toThrow(/ustma-ust/i);
  });

  it('bo‘shagandan keyin yangi hodisa yozilmaydi', async () => {
    const id = await hire('Ketdi');
    await recordEvent(db, ctx(), id, { type: 'termination', startsOn: '2026-08-31', basis: 'Ariza' });
    expect(await employeeStatus(db, ctx(), id, '2026-09-01')).toBe('terminated');
    await expect(recordEvent(db, ctx(), id, { type: 'vacation', startsOn: '2026-09-10', endsOn: '2026-09-12' })).rejects.toThrow(/bo‘shagan/i);
  });

  it('bekor qilish: sabab majburiy, holat qaytadi, yozuv o‘chmaydi (CORE-07)', async () => {
    const id = await hire('Bekor');
    const { id: eventId } = await recordEvent(db, ctx(), id, { type: 'vacation', startsOn: '2026-07-01', endsOn: '2026-07-14' });
    await expect(cancelEvent(db, ctx(), eventId, '  ')).rejects.toThrow(/sabab/i);
    await cancelEvent(db, ctx(), eventId, 'Xato kiritilgan');

    expect(await employeeStatus(db, ctx(), id, '2026-07-05')).toBe('active');
    const [row] = await withTenant(db, tenantId, (tx) => tx.select().from(schema.employmentEvents).where(eq(schema.employmentEvents.id, eventId)));
    expect(row).toMatchObject({ cancelReason: 'Xato kiritilgan' });
    expect(row!.cancelledAt).toBeInstanceOf(Date);
  });

  it('ilova hodisani o‘chira olmaydi', async () => {
    const id = await hire('Ochmas');
    const { id: eventId } = await recordEvent(db, ctx(), id, { type: 'sick', startsOn: '2026-03-02', endsOn: '2026-03-04' });
    await expect(withTenant(db, tenantId, (tx) => tx.delete(schema.employmentEvents).where(eq(schema.employmentEvents.id, eventId))))
      .rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('o‘tkazish xodim kartasidagi bo‘limni yangilaydi', async () => {
    const id = await hire('Otkaz');
    await recordEvent(db, ctx(), id, { type: 'transfer', startsOn: '2026-01-15', payload: { departmentId: deptB } });
    expect(await getEmployee(db, ctx(), id)).toMatchObject({ departmentId: deptB });
  });

  it('kadrlarga huquqi yo‘q rol hodisa yoza olmaydi', async () => {
    const id = await hire('Huquq');
    await expect(recordEvent(db, { tenantId, userId: savdoId }, id, { type: 'sick', startsOn: '2026-03-02', endsOn: '2026-03-03' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('ta’til qoldig‘i (HR-06)', () => {
  it('yillik 21 kun − olingan = qolgan; bekor qilingan hisoblanmaydi', async () => {
    const id = await hire('Tatil', deptA, '2025-03-01');
    await recordEvent(db, ctx(), id, { type: 'vacation', startsOn: '2026-04-06', endsOn: '2026-04-15' }); // 10 kun
    const { id: cancelled } = await recordEvent(db, ctx(), id, { type: 'vacation', startsOn: '2026-05-04', endsOn: '2026-05-08' });
    await cancelEvent(db, ctx(), cancelled, 'Rad etildi');

    expect(await leaveBalance(db, ctx(), id, '2026-06-01')).toEqual({
      annual: 21, taken: 10, remaining: 11, periodStart: '2026-03-01', periodEnd: '2027-02-28',
    });
  });
});

describe('kadr kalendari (HR-05)', () => {
  it('kim qachon yo‘q va bo‘limda bir vaqtda ko‘p odam yo‘qligi haqida ogohlantirish', async () => {
    // Tayyorgarlik bitta tranzaksiyada — tekshirilayotgani kalendar, xodim yaratish emas
    const ids = (await withTenant(db, tenantId, (tx) => tx.insert(schema.employees)
      .values(['K1', 'K2', 'K3', 'K4'].map((n) => ({ tenantId, companyId, departmentId: deptB, lastName: n, firstName: 'X', hiredAt: '2025-03-01' })))
      .returning({ id: schema.employees.id }))).map((r) => r.id);
    await recordEvent(db, ctx(), ids[0]!, { type: 'vacation', startsOn: '2026-12-01', endsOn: '2026-12-10' });
    await recordEvent(db, ctx(), ids[1]!, { type: 'sick', startsOn: '2026-12-05', endsOn: '2026-12-07' });

    const cal = await absenceCalendar(db, ctx(), { from: '2026-12-01', to: '2026-12-31' });
    expect(cal.absences.filter((a) => ids.includes(a.employeeId))).toHaveLength(2);
    // Kassa bo'limida (hozir 5 kishi: K1–K4 + o'tkazilgan) 5–7-dekabr 2 kishi yo'q → 40% ≥ 30%
    const alert = cal.alerts.find((a) => a.departmentId === deptB);
    expect(alert).toMatchObject({ from: '2026-12-05', to: '2026-12-07', absent: 2 });
  });
});
