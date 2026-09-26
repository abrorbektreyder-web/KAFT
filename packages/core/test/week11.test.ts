// R1, 11-hafta: raqam ortidagi hujjatlar (CTL-05) uchun filtrlar, eksport (CORE-11), kompaniya pasporti (CORE-12),
// shtat jadvali (HR-09), muddatli hujjat eslatmasi (DOC-03).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { and, createDb, eq, schema, withTenant } from '@kaft/db';
import {
  buildExportFile, createCashAccount, createCounterparty, createEmployee, createProduct, createSale, createTenant, createUser,
  exportData, FakeTelegram, ForbiddenError, getCompanyProfile, listCategories, listSales, listTransactions, LocalDiskStorage,
  recordEvent, recordTransaction, runDailyJobs, saveCompanyProfile, setStaffingPlan, staffingReport, uploadDocument,
} from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let tenantId: string;
let companyId: string;
let root: string;
const u: Record<string, string> = {};
const ctx = (k: string) => ({ tenantId, userId: u[k]! });
const so = (n: number) => n * 100;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kaft-w11-'));
  tenantId = (await createTenant(db, { name: '11-hafta', slug: `w11-${crypto.randomUUID()}` })).id;
  await withTenant(db, tenantId, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId, name: 'Savdo Markaz' }).returning();
    companyId = c!.id;
    for (const [k, role] of [['ega', 'Ega'], ['direktor', 'Direktor'], ['buxgalter', 'Buxgalter'], ['hr', 'HR menejer'], ['kassir', 'Kassir'], ['savdo', 'Savdo menejeri']] as const) {
      u[k] = (await createUser(tx, { fullName: k, roles: [role] })).id;
    }
  });
});

afterAll(async () => {
  await sql`delete from tenants where id = ${tenantId}`;
  await rm(root, { recursive: true, force: true });
  await sql.end();
});

describe('raqam ortidagi hujjatlar (CTL-05): ro‘yxat filtrlari', () => {
  it('operatsiyalar — modda va davr bo‘yicha; sotuvlar — davr bo‘yicha', async () => {
    const acc = await createCashAccount(db, ctx('ega'), { companyId, name: 'Kassa', type: 'cash', currency: 'UZS' });
    const cats = await listCategories(db, ctx('ega'), 'out');
    const rent = cats.find((c) => c.name === 'Ijara')!.id;
    const taxi = cats.find((c) => c.name === 'Transport')!.id;
    await recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'out', amount: so(100), categoryId: rent, occurredOn: '2026-08-05' });
    await recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'out', amount: so(200), categoryId: rent, occurredOn: '2026-09-05' });
    await recordTransaction(db, ctx('ega'), { accountId: acc.id, direction: 'out', amount: so(300), categoryId: taxi, occurredOn: '2026-09-06' });
    const rows = await listTransactions(db, ctx('ega'), { categoryId: rent, from: '2026-09-01', to: '2026-09-30' });
    expect(rows.map((r) => r.amount)).toEqual([so(200)]);

    const prod = (await createProduct(db, ctx('ega'), { name: 'Tovar', unit: 'dona', prices: { retail: so(10) } })).id;
    const cp = (await createCounterparty(db, ctx('ega'), { name: 'Mijoz', roles: ['customer'] })).id;
    await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2026-08-20', currency: 'UZS', priceType: 'retail', lines: [{ productId: prod, qty: '1' }] });
    const sep = await createSale(db, ctx('ega'), { companyId, counterpartyId: cp, date: '2026-09-20', currency: 'UZS', priceType: 'retail', lines: [{ productId: prod, qty: '2' }] });
    expect((await listSales(db, ctx('ega'), { from: '2026-09-01', to: '2026-09-30' })).map((s) => s.id)).toEqual([sep.id]);
  });
});

describe('eksport (CORE-11)', () => {
  it('Excel va CSV; har eksport audit jurnaliga; ruxsatsiz — rad etiladi', async () => {
    await createCounterparty(db, ctx('ega'), { name: 'Eksport MChJ', roles: ['supplier'], stir: '612000333' });
    const data = await exportData(db, ctx('buxgalter'), 'counterparties', { locale: 'uz' });
    expect(data.columns[0]).toBe('Nomi');
    expect(data.rows.some((r) => r[0] === 'Eksport MChJ')).toBe(true);

    const csv = (await buildExportFile(data, 'csv')).toString('utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff); // Excel UTF-8 ni to'g'ri ochishi uchun BOM
    expect(csv.split('\r\n')[0]).toContain('Nomi;');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildExportFile(data, 'xlsx') as unknown as ArrayBuffer);
    expect(wb.worksheets[0]!.getRow(1).getCell(1).value).toBe('Nomi');

    const ru = await exportData(db, ctx('buxgalter'), 'counterparties', { locale: 'ru' });
    expect(ru.columns[0]).toBe('Название');

    const logs = await withTenant(db, tenantId, (tx) => tx.select().from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'export'), eq(schema.auditLog.actorUserId, u.buxgalter!))));
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ entity: 'counterparties', meta: expect.objectContaining({ rows: expect.any(Number) }) });

    await expect(exportData(db, ctx('hr'), 'transactions', { locale: 'uz' })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await exportData(db, ctx('ega'), 'transactions', { locale: 'uz' })).rows.length).toBeGreaterThan(0);
  });
});

describe('kompaniya pasporti (CORE-12)', () => {
  it('ega to‘ldiradi; maxfiylik darajasi kim ko‘rishini belgilaydi', async () => {
    const profile = {
      industry: 'Oziq-ovqat savdosi', businessModel: 'Chakana va ulgurji', products: 'Ichimliklar, shakar, un', customerProfile: 'Do‘konlar, oilalar',
      funnel: 'Telegram → qo‘ng‘iroq → do‘kon', advantage: 'Tez yetkazish', notSegment: 'Restoranlar', strategy: '2027 — 3 ta yangi filial',
    };
    await expect(saveCompanyProfile(db, ctx('buxgalter'), companyId, { ...profile, visibility: 'all' })).rejects.toBeInstanceOf(ForbiddenError);
    await saveCompanyProfile(db, ctx('ega'), companyId, { ...profile, visibility: 'owner' });
    expect(await getCompanyProfile(db, ctx('ega'), companyId)).toMatchObject({ ...profile, visibility: 'owner' });
    await expect(getCompanyProfile(db, ctx('direktor'), companyId)).rejects.toBeInstanceOf(ForbiddenError);

    await saveCompanyProfile(db, ctx('ega'), companyId, { ...profile, visibility: 'managers' });
    expect((await getCompanyProfile(db, ctx('direktor'), companyId))?.industry).toBe('Oziq-ovqat savdosi');
    await expect(getCompanyProfile(db, ctx('kassir'), companyId)).rejects.toBeInstanceOf(ForbiddenError);

    await saveCompanyProfile(db, ctx('ega'), companyId, { ...profile, visibility: 'all' });
    expect((await getCompanyProfile(db, ctx('kassir'), companyId))?.strategy).toBe('2027 — 3 ta yangi filial');
  });
});

describe('shtat jadvali (HR-09)', () => {
  it('rejadagi va haqiqiy lavozimlar, bo‘sh o‘rinlar; bo‘shagan hisobga olinmaydi, dikretdagi — egallagan', async () => {
    const { dept, kassir, sotuvchi } = await withTenant(db, tenantId, async (tx) => {
      const [d] = await tx.insert(schema.departments).values({ tenantId, companyId, name: 'Do‘kon' }).returning();
      const ps = await tx.insert(schema.positions).values([{ tenantId, companyId, name: 'Kassir' }, { tenantId, companyId, name: 'Sotuvchi' }]).returning();
      return { dept: d!.id, kassir: ps[0]!.id, sotuvchi: ps[1]!.id };
    });
    const hire = (name: string, positionId: string) =>
      createEmployee(db, ctx('hr'), { companyId, departmentId: dept, positionId, lastName: name, firstName: 'X', hiredAt: '2025-01-10' });
    await hire('Birinchi', kassir);
    const quit = await hire('Ketgan', kassir);
    await recordEvent(db, ctx('hr'), quit.id, { type: 'termination', startsOn: '2026-06-01' });
    const mat = await hire('Dikret', sotuvchi);
    await recordEvent(db, ctx('hr'), mat.id, { type: 'maternity', startsOn: '2026-05-01' });
    await hire('Ortiqcha', sotuvchi);

    await setStaffingPlan(db, ctx('hr'), { departmentId: dept, positionId: kassir, planned: 3 });
    await setStaffingPlan(db, ctx('hr'), { departmentId: dept, positionId: sotuvchi, planned: 1 });
    await setStaffingPlan(db, ctx('hr'), { departmentId: dept, positionId: kassir, planned: 2 }); // yangilash
    await expect(setStaffingPlan(db, ctx('savdo'), { departmentId: dept, positionId: kassir, planned: 1 })).rejects.toBeInstanceOf(ForbiddenError);

    const report = await staffingReport(db, ctx('direktor'), { on: '2026-09-26' });
    const row = (p: string) => report.rows.find((r) => r.departmentId === dept && r.positionId === p);
    expect(row(kassir)).toMatchObject({ positionName: 'Kassir', planned: 2, actual: 1, vacancies: 1, over: 0 });
    expect(row(sotuvchi)).toMatchObject({ positionName: 'Sotuvchi', planned: 1, actual: 2, vacancies: 0, over: 1 });
    expect(report.totals).toMatchObject({ planned: 3, actual: 3, vacancies: 1 });
    await expect(staffingReport(db, ctx('savdo'))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('muddatli hujjat eslatmasi (DOC-03)', () => {
  it('30 kun oldin — hujjatni ko‘ra oladiganlarga (maxfiy xodim hujjati — faqat maxfiy ma’lumot huquqi borlarga)', async () => {
    const storage = new LocalDiskStorage(root);
    const emp = await createEmployee(db, ctx('hr'), { companyId, lastName: 'Pasportli', firstName: 'X' });
    const file = { fileName: 'a.pdf', contentType: 'application/pdf', data: new Uint8Array([1, 2, 3]) };
    await uploadDocument(db, storage, ctx('hr'), { ...file, ownerType: 'company', ownerId: companyId, title: 'Ijara shartnomasi', kind: 'contract', confidentiality: 'open', expiresOn: '2026-11-15' });
    await uploadDocument(db, storage, ctx('hr'), { ...file, ownerType: 'employee', ownerId: emp.id, title: 'Pasport nusxasi', kind: 'copy', confidentiality: 'secret', expiresOn: '2026-11-15' });
    await runDailyJobs(db, { telegram: new FakeTelegram(), on: '2026-10-16', tenantIds: [tenantId] });
    await runDailyJobs(db, { telegram: new FakeTelegram(), on: '2026-10-16', tenantIds: [tenantId] });
    const notes = async (k: string) => (await withTenant(db, tenantId, (tx) => tx.select().from(schema.notifications)
      .where(and(eq(schema.notifications.userId, u[k]!), eq(schema.notifications.kind, 'doc_expiry'))))).map((n) => n.body).sort();
    expect(await notes('ega')).toEqual(['Ijara shartnomasi — muddati 15.11.2026 da tugaydi', 'Pasport nusxasi — muddati 15.11.2026 da tugaydi']);
    expect(await notes('hr')).toHaveLength(2);
    expect(await notes('direktor')).toEqual(['Ijara shartnomasi — muddati 15.11.2026 da tugaydi']);
    expect(await notes('kassir')).toEqual([]);
  }, 180_000);
});
