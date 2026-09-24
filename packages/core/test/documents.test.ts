// DOC-01/02, HR-08: hujjatlar (xodim/kontragent/kompaniyaga bog'lanadi) va maxfiylik darajasi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, createDb, eq, schema, withTenant } from '@kaft/db';
import {
  createEmployee, createTenant, createUser, ForbiddenError, listDocuments, LocalDiskStorage, readDocument, uploadDocument,
} from '../src/index.ts';

const { db, sql } = createDb(process.env.DATABASE_URL!);
let root: string;
let storage: LocalDiskStorage;
let tenantId: string;
let companyId: string;
let deptA: string;
let deptB: string;
const u: Record<string, string> = {};
const emp: Record<string, string> = {};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kaft-docs-'));
  storage = new LocalDiskStorage(root);
  const t = await createTenant(db, { name: 'Hujjat test', slug: `hujjat-${crypto.randomUUID()}` });
  tenantId = t.id;
  await withTenant(db, tenantId, async (tx) => {
    const [c] = await tx.insert(schema.companies).values({ tenantId, name: 'Savdo Markaz' }).returning();
    companyId = c!.id;
    const ds = await tx.insert(schema.departments).values([{ tenantId, companyId, name: 'Kadrlar' }, { tenantId, companyId, name: 'Savdo' }]).returning();
    deptA = ds[0]!.id;
    deptB = ds[1]!.id;
    for (const [k, role] of [['hr', 'HR menejer'], ['direktor', 'Direktor'], ['savdo', 'Savdo menejeri'], ['kassir', 'Kassir'], ['aziz', 'Xodim'], ['malika', 'Xodim']] as const) {
      u[k] = (await createUser(tx, { fullName: k, roles: [role] })).id;
    }
  });
  const hr = { tenantId, userId: u.hr! };
  emp.aziz = (await createEmployee(db, hr, { companyId, departmentId: deptA, lastName: 'Karimov', firstName: 'Aziz', userId: u.aziz })).id;
  emp.malika = (await createEmployee(db, hr, { companyId, departmentId: deptB, lastName: 'Saidova', firstName: 'Malika', userId: u.malika })).id;
  emp.savdo = (await createEmployee(db, hr, { companyId, departmentId: deptB, lastName: 'Toshmatov', firstName: 'Jasur', userId: u.savdo })).id;
});

afterAll(async () => {
  await sql`delete from tenants where id = ${tenantId}`;
  await sql.end();
  await rm(root, { recursive: true, force: true });
});

const ctx = (k: string) => ({ tenantId, userId: u[k]! });
const bytes = (s: string) => new TextEncoder().encode(s);
const upload = (over: Partial<Parameters<typeof uploadDocument>[3]> = {}) => uploadDocument(db, storage, ctx('hr'), {
  ownerType: 'employee', ownerId: emp.aziz!, title: 'Mehnat shartnomasi', kind: 'contract', confidentiality: 'department',
  fileName: 'shartnoma.pdf', contentType: 'application/pdf', data: bytes('PDF-1'), ...over,
});

describe('hujjatlar', () => {
  it('HR xodimga shartnoma yuklaydi va faylni o‘zgarishsiz o‘qiydi', async () => {
    const { id } = await upload();
    const doc = await readDocument(db, storage, ctx('hr'), id);
    expect(doc.meta).toMatchObject({ title: 'Mehnat shartnomasi', fileName: 'shartnoma.pdf', size: 5 });
    expect(new TextDecoder().decode(doc.data)).toBe('PDF-1');
  });

  it('bo‘lim darajasidagi hujjatni boshqa bo‘lim xodimi ko‘rmaydi', async () => {
    const { id } = await upload({ ownerType: 'company', ownerId: companyId, departmentId: deptA, title: 'Kadrlar reglamenti', kind: 'regulation' });
    await expect(readDocument(db, storage, ctx('savdo'), id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readDocument(db, storage, ctx('aziz'), id)).resolves.toBeTruthy(); // o'z bo'limi
  });

  it('ochiq hujjatni hujjat ko‘rish huquqi bor hamma ko‘radi', async () => {
    const { id } = await upload({ ownerType: 'company', ownerId: companyId, confidentiality: 'open', title: 'Ichki tartib qoidalari', kind: 'regulation' });
    await expect(readDocument(db, storage, ctx('savdo'), id)).resolves.toBeTruthy();
    await expect(readDocument(db, storage, ctx('kassir'), id)).resolves.toBeTruthy();
  });

  it('xodimning maxfiy hujjati (pasport nusxasi): o‘zi va HR ko‘radi, direktor va boshqa xodim ko‘rmaydi', async () => {
    const { id } = await upload({ confidentiality: 'secret', title: 'Pasport nusxasi', kind: 'copy', fileName: 'pasport.jpg', contentType: 'image/jpeg' });
    await expect(readDocument(db, storage, ctx('aziz'), id)).resolves.toBeTruthy();
    await expect(readDocument(db, storage, ctx('hr'), id)).resolves.toBeTruthy();
    await expect(readDocument(db, storage, ctx('direktor'), id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readDocument(db, storage, ctx('malika'), id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('kompaniyaning maxfiy hujjatini direktor ko‘radi, savdo menejeri ko‘rmaydi', async () => {
    const { id } = await upload({ ownerType: 'company', ownerId: companyId, confidentiality: 'secret', title: 'Ta’sischilar qarori', kind: 'order' });
    await expect(readDocument(db, storage, ctx('direktor'), id)).resolves.toBeTruthy();
    await expect(readDocument(db, storage, ctx('savdo'), id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('ro‘yxatda faqat ko‘rish mumkin bo‘lgan hujjatlar chiqadi', async () => {
    await upload({ ownerType: 'employee', ownerId: emp.malika!, confidentiality: 'secret', title: 'Malika pasporti', kind: 'copy' });
    const mine = await listDocuments(db, ctx('aziz'), { ownerType: 'employee', ownerId: emp.malika! });
    expect(mine).toEqual([]);
    const hrList = await listDocuments(db, ctx('hr'), { ownerType: 'employee', ownerId: emp.malika! });
    expect(hrList.map((d) => d.title)).toContain('Malika pasporti');
  });

  it('maxfiy hujjatni o‘qish audit jurnaliga yoziladi', async () => {
    const { id } = await upload({ confidentiality: 'secret', title: 'Diplom nusxasi', kind: 'copy' });
    await readDocument(db, storage, ctx('hr'), id);
    const logs = await withTenant(db, tenantId, (tx) => tx.select().from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'read'), eq(schema.auditLog.entity, 'document'), eq(schema.auditLog.entityId, id))));
    expect(logs).toHaveLength(1);
  });

  it('hujjat yuklash huquqi yo‘q rol yuklay olmaydi', async () => {
    await expect(uploadDocument(db, storage, ctx('kassir'), {
      ownerType: 'company', ownerId: companyId, title: 'X', kind: 'other', confidentiality: 'open', fileName: 'x.txt', contentType: 'text/plain', data: bytes('x'),
    })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
