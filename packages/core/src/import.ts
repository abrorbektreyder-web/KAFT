// HR-11 / INT-01: xodimlarni Excel'dan import. Avval hamma qator tekshiriladi;
// bitta xato bo'lsa ham hech narsa yozilmaydi (hammasi yoki hech narsa).
import ExcelJS from 'exceljs';
import { and, eq, inArray, schema, withTenant, type Db, type Tx } from '@kaft/db';
import { authorize, deny, type Ctx } from './permissions.ts';
import { secretError, type EmployeeInput, type Secrets } from './employees.ts';
import { CpError, normalizeCounterparty, type CounterpartyInput, type CounterpartyPatch, type CounterpartyRole } from './counterparties.ts';

type Key = 'lastName' | 'firstName' | 'middleName' | 'birthDate' | 'phone' | 'department' | 'position'
  | 'hiredAt' | 'contractType' | 'passport' | 'jshshir' | 'bankCard' | 'departmentRu' | 'positionRu';

export const EMPLOYEE_COLUMNS: { key: Key; title: string; required?: boolean; width: number }[] = [
  { key: 'lastName', title: 'Familiya*', required: true, width: 18 },
  { key: 'firstName', title: 'Ism*', required: true, width: 16 },
  { key: 'middleName', title: 'Otasining ismi', width: 18 },
  { key: 'birthDate', title: 'Tug‘ilgan sana', width: 15 },
  { key: 'phone', title: 'Telefon', width: 16 },
  { key: 'department', title: 'Bo‘lim*', required: true, width: 20 },
  { key: 'position', title: 'Lavozim*', required: true, width: 20 },
  { key: 'hiredAt', title: 'Ishga kirgan sana', width: 17 },
  { key: 'contractType', title: 'Shartnoma turi', width: 20 },
  { key: 'passport', title: 'Pasport', width: 13 },
  { key: 'jshshir', title: 'JShShIR', width: 17 },
  { key: 'bankCard', title: 'Bank karta', width: 20 },
  // Rus tilidagi interfeys uchun (ixtiyoriy, CORE-08)
  { key: 'departmentRu', title: 'Bo‘lim (ruscha)', width: 22 },
  { key: 'positionRu', title: 'Lavozim (ruscha)', width: 22 },
];
const SECRET_KEYS = ['passport', 'jshshir', 'bankCard'] as const;
const DATE_KEYS = ['birthDate', 'hiredAt'] as const;

export interface ImportError { row: number; column: string; message: string }
export type ImportResult = { ok: true; imported: number } | { ok: false; errors: ImportError[] };

/** Bo'sh shablon: to'ldirish uchun ustunlar va yo'riqnoma varag'i. */
export async function buildEmployeeTemplate(): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Xodimlar', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = EMPLOYEE_COLUMNS.map((c) => ({ header: c.title, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  const help = wb.addWorksheet('Yo‘riqnoma');
  [
    ['* belgili ustunlar majburiy.'],
    ['Sanalar: KK.OO.YYYY (masalan 14.05.1990).'],
    ['Telefon: 901234567 yoki +998901234567.'],
    ['Pasport: AA1234567 · JShShIR: 14 raqam · Bank karta: 16 raqam.'],
    ['Bo‘lim va lavozim nomi bo‘yicha topiladi; yo‘q bo‘lsa yaratiladi.'],
    ['«Bo‘lim (ruscha)» va «Lavozim (ruscha)» — rus tilidagi interfeysda ko‘rinadigan nom (ixtiyoriy).'],
  ].forEach((r) => help.addRow(r));
  help.getColumn(1).width = 70;
  return wb.xlsx.writeBuffer();
}

function text(v: ExcelJS.CellValue): string | Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text.trim() || null;
    if ('result' in v) return text(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim() || null;
    return null;
  }
  const s = String(v).trim();
  return s || null;
}

/** KK.OO.YYYY yoki Excel sanasi → YYYY-MM-DD; noto'g'ri bo'lsa null. */
function parseDate(v: string | Date): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function parsePhone(v: string): string | null {
  const digits = v.replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  return null;
}

type Parsed = Omit<EmployeeInput, 'companyId' | 'secrets'> & { department: string; position: string; departmentRu?: string; positionRu?: string; secrets: Secrets };

async function parse(file: Buffer | ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as ArrayBuffer);
  const ws = wb.getWorksheet('Xodimlar') ?? wb.worksheets[0];
  const errors: ImportError[] = [];
  const rows: { row: number; data: Parsed }[] = [];
  if (!ws) return { rows, errors: [{ row: 0, column: '', message: 'Faylda varaq topilmadi' }] };

  // Ustunlarni sarlavha bo'yicha topamiz — tartibi o'zgarsa ham ishlaydi
  const colOf = new Map<Key, number>();
  ws.getRow(1).eachCell((cell, n) => {
    const col = EMPLOYEE_COLUMNS.find((c) => c.title === text(cell.value));
    if (col) colOf.set(col.key, n);
  });
  for (const c of EMPLOYEE_COLUMNS.filter((c) => c.required && !colOf.has(c.key))) {
    errors.push({ row: 1, column: c.title, message: 'Majburiy ustun topilmadi — shablondan foydalaning' });
  }
  if (errors.length) return { rows, errors };

  ws.eachRow((r, n) => {
    if (n === 1) return;
    const get = (k: Key) => (colOf.has(k) ? text(r.getCell(colOf.get(k)!).value) : null);
    const rowErrors: ImportError[] = [];
    const bad = (k: Key, message: string) => rowErrors.push({ row: n, column: EMPLOYEE_COLUMNS.find((c) => c.key === k)!.title, message });
    const data: Record<string, unknown> = { secrets: {} };

    for (const c of EMPLOYEE_COLUMNS) {
      const v = get(c.key);
      if (v == null) {
        if (c.required) bad(c.key, 'To‘ldirilishi shart');
        continue;
      }
      if ((DATE_KEYS as readonly Key[]).includes(c.key)) {
        const d = parseDate(v);
        if (!d) bad(c.key, 'Sana noto‘g‘ri — KK.OO.YYYY ko‘rinishida kiriting');
        else data[c.key] = d;
      } else if (c.key === 'phone') {
        const p = parsePhone(String(v));
        if (!p) bad(c.key, 'Telefon noto‘g‘ri — 901234567 yoki +998901234567');
        else data.phone = p;
      } else if ((SECRET_KEYS as readonly Key[]).includes(c.key)) {
        const s = String(v).replace(/\s/g, '').toUpperCase();
        const err = secretError(c.key as keyof Secrets, s);
        if (err) bad(c.key, err);
        else (data.secrets as Secrets)[c.key as keyof Secrets] = s;
      } else {
        data[c.key] = String(v);
      }
    }
    // Butunlay bo'sh qatorni o'tkazib yuboramiz
    if (EMPLOYEE_COLUMNS.every((c) => get(c.key) == null)) return;
    if (rowErrors.length) errors.push(...rowErrors);
    else rows.push({ row: n, data: data as Parsed });
  });

  // Fayl ichida takrorlangan JShShIR
  const seen = new Map<string, number>();
  for (const { row, data } of rows) {
    const j = data.secrets.jshshir;
    if (!j) continue;
    if (seen.has(j)) errors.push({ row, column: 'JShShIR', message: `Takrorlangan — ${seen.get(j)}-qatorda ham bor` });
    else seen.set(j, row);
  }
  return { rows, errors };
}

async function ensureByName(tx: Tx, table: typeof schema.departments | typeof schema.positions, ctx: Ctx, companyId: string, items: { name: string; nameRu?: string }[]) {
  const ruOf = new Map<string, string>();
  for (const i of items) if (i.nameRu && !ruOf.has(i.name)) ruOf.set(i.name, i.nameRu);
  const unique = [...new Set(items.map((i) => i.name))];
  const found = await tx.select({ id: table.id, name: table.name, nameRu: table.nameRu }).from(table)
    .where(and(eq(table.companyId, companyId), inArray(table.name, unique)));
  // Bor yozuvda ruscha nom bo'sh bo'lsa — fayldagisi bilan to'ldiriladi (mavjudini almashtirmaymiz)
  for (const f of found) {
    if (!f.nameRu && ruOf.has(f.name)) await tx.update(table).set({ nameRu: ruOf.get(f.name)! }).where(eq(table.id, f.id));
  }
  const missing = unique.filter((n) => !found.some((f) => f.name === n));
  const created = missing.length
    ? await tx.insert(table).values(missing.map((name) => ({ tenantId: ctx.tenantId, companyId, name, nameRu: ruOf.get(name) }))).returning({ id: table.id, name: table.name })
    : [];
  return new Map([...found, ...created].map((r) => [r.name, r.id]));
}

export async function importEmployees(db: Db, ctx: Ctx, file: Buffer | ArrayBuffer, opts: { companyId: string }): Promise<ImportResult> {
  if ((await authorize(db, ctx, 'hr', 'create')) !== 'all') await deny(db, ctx, 'hr', 'create');

  const { rows, errors } = await parse(file);
  if (!rows.length && !errors.length) return { ok: false, errors: [{ row: 0, column: '', message: 'Fayl bo‘sh — kamida bitta xodim qatori kerak' }] };

  const hasSecrets = rows.some((r) => Object.keys(r.data.secrets).length);
  if (hasSecrets && (await authorize(db, ctx, 'hr.secret', 'create')) !== 'all') await deny(db, ctx, 'hr.secret', 'create');

  // Bazada allaqachon bor JShShIR
  const jshshirs = rows.map((r) => r.data.secrets.jshshir).filter((j): j is string => !!j);
  if (jshshirs.length) {
    const existing = await withTenant(db, ctx.tenantId, (tx) => tx.select({ j: schema.employeeSecrets.jshshir }).from(schema.employeeSecrets)
      .where(inArray(schema.employeeSecrets.jshshir, jshshirs)));
    const taken = new Set(existing.map((e) => e.j));
    for (const { row, data } of rows) {
      if (data.secrets.jshshir && taken.has(data.secrets.jshshir)) errors.push({ row, column: 'JShShIR', message: 'Bu JShShIR bilan xodim allaqachon bor' });
    }
  }
  if (errors.length) {
    const order = new Map(EMPLOYEE_COLUMNS.map((c, i) => [c.title, i]));
    return { ok: false, errors: errors.sort((a, b) => a.row - b.row || (order.get(a.column) ?? 0) - (order.get(b.column) ?? 0)) };
  }

  await withTenant(db, ctx.tenantId, async (tx) => {
    const depts = await ensureByName(tx, schema.departments, ctx, opts.companyId, rows.map((r) => ({ name: r.data.department, nameRu: r.data.departmentRu })));
    const poss = await ensureByName(tx, schema.positions, ctx, opts.companyId, rows.map((r) => ({ name: r.data.position, nameRu: r.data.positionRu })));
    const inserted = await tx.insert(schema.employees).values(rows.map(({ data: { department, position, departmentRu: _dr, positionRu: _pr, secrets: _s, ...f } }) => ({
      ...f, tenantId: ctx.tenantId, companyId: opts.companyId, departmentId: depts.get(department)!, positionId: poss.get(position)!,
    }))).returning({ id: schema.employees.id });

    const secretRows = rows.flatMap((r, i) => (Object.keys(r.data.secrets).length ? [{ ...r.data.secrets, tenantId: ctx.tenantId, employeeId: inserted[i]!.id }] : []));
    if (secretRows.length) await tx.insert(schema.employeeSecrets).values(secretRows);
    await tx.insert(schema.auditLog).values(inserted.map((e) => ({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'employee', entityId: e.id, meta: { source: 'excel' } })));
  });
  return { ok: true, imported: rows.length };
}

// ---------------------------------------------------------------- kontragentlar (CP-10, INT-01)
// Boshlang'ich qarzlar importi — qarz qoidasi hal bo'lgach (9-hafta).

type CpKey = 'name' | 'roles' | 'stir' | 'phone' | 'address' | 'contactPerson' | 'bankName' | 'bankMfo' | 'bankAccount' | 'creditLimit' | 'paymentTermDays';

export const COUNTERPARTY_COLUMNS: { key: CpKey; title: string; required?: boolean; width: number }[] = [
  { key: 'name', title: 'Nomi*', required: true, width: 32 },
  { key: 'roles', title: 'Rollar*', required: true, width: 24 },
  { key: 'stir', title: 'STIR', width: 13 },
  { key: 'phone', title: 'Telefon', width: 16 },
  { key: 'address', title: 'Manzil', width: 30 },
  { key: 'contactPerson', title: 'Mas’ul shaxs', width: 22 },
  { key: 'bankName', title: 'Bank', width: 18 },
  { key: 'bankMfo', title: 'MFO', width: 8 },
  { key: 'bankAccount', title: 'Hisob raqami', width: 24 },
  { key: 'creditLimit', title: 'Kredit limiti (so‘m)', width: 18 },
  { key: 'paymentTermDays', title: 'To‘lov muddati (kun)', width: 18 },
];

// Excel'dagi rol so'zlari (apostrof har xil yozilishi mumkin — oldin ' ga keltiriladi)
const ROLE_WORDS: Record<string, CounterpartyRole> = {
  mijoz: 'customer', ulgurji: 'wholesale', 'ulgurji hamkor': 'wholesale', "ta'minotchi": 'supplier',
  клиент: 'customer', покупатель: 'customer', оптовик: 'wholesale', поставщик: 'supplier',
};

export async function buildCounterpartyTemplate(): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Kontragentlar', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COUNTERPARTY_COLUMNS.map((c) => ({ header: c.title, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  const help = wb.addWorksheet('Yo‘riqnoma');
  [
    ['* belgili ustunlar majburiy.'],
    ['Rollar: mijoz, ulgurji hamkor, ta’minotchi — bir nechtasi vergul bilan (masalan: mijoz, ta’minotchi).'],
    ['STIR: 9 raqam, takrorlanmaydi · MFO: 5 raqam · Hisob raqami: 20 raqam.'],
    ['Telefon: 901234567 yoki +998901234567.'],
    ['Kredit limiti — so‘mda (masalan 50000000); to‘lov muddati — kunda.'],
  ].forEach((r) => help.addRow(r));
  help.getColumn(1).width = 90;
  return wb.xlsx.writeBuffer();
}

const cellStr = (v: string | Date | null) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : v);

/** Kontragentlarni Excel'dan import (hammasi yoki hech narsa). */
export async function importCounterparties(db: Db, ctx: Ctx, file: Buffer | ArrayBuffer): Promise<ImportResult> {
  if ((await authorize(db, ctx, 'cp', 'create')) !== 'all') await deny(db, ctx, 'cp', 'create');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as ArrayBuffer);
  const ws = wb.getWorksheet('Kontragentlar') ?? wb.worksheets[0];
  if (!ws) return { ok: false, errors: [{ row: 0, column: '', message: 'Faylda varaq topilmadi' }] };

  const colOf = new Map<CpKey, number>();
  ws.getRow(1).eachCell((cell, n) => {
    const col = COUNTERPARTY_COLUMNS.find((c) => c.title === text(cell.value));
    if (col) colOf.set(col.key, n);
  });
  const errors: ImportError[] = COUNTERPARTY_COLUMNS.filter((c) => c.required && !colOf.has(c.key))
    .map((c) => ({ row: 1, column: c.title, message: 'Majburiy ustun topilmadi — shablondan foydalaning' }));
  if (errors.length) return { ok: false, errors };

  const title = (k: string) => COUNTERPARTY_COLUMNS.find((c) => c.key === k)?.title ?? k;
  const rows: { row: number; data: CounterpartyInput }[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const get = (k: CpKey) => (colOf.has(k) ? cellStr(text(r.getCell(colOf.get(k)!).value)) : null);
    if (COUNTERPARTY_COLUMNS.every((c) => get(c.key) == null)) return;
    const rowErrors: ImportError[] = [];
    const bad = (k: string, message: string) => rowErrors.push({ row: n, column: title(k), message });

    const roles: CounterpartyRole[] = [];
    for (const w of (get('roles') ?? '').split(/[,;]/).map((x) => x.trim().toLowerCase().replace(/[’‘ʼ`]/g, "'")).filter(Boolean)) {
      const role = ROLE_WORDS[w];
      if (role) roles.push(role);
      else bad('roles', `Rol noma’lum: «${w}» — mijoz, ulgurji hamkor yoki ta’minotchi`);
    }
    const num = (k: CpKey, scale: number) => {
      const v = get(k);
      if (v == null) return null;
      const s = v.replace(/[\s ]/g, '').replace(',', '.');
      if (!/^\d+(\.\d{1,2})?$/.test(s)) {
        bad(k, 'Son noto‘g‘ri');
        return null;
      }
      return Math.round(Number(s) * scale);
    };
    const input: CounterpartyInput = {
      name: get('name') ?? '', roles, stir: get('stir'), phone: get('phone'), address: get('address'), contactPerson: get('contactPerson'),
      bankName: get('bankName'), bankMfo: get('bankMfo'), bankAccount: get('bankAccount'),
      creditLimit: num('creditLimit', 100), paymentTermDays: num('paymentTermDays', 1),
    };
    // Maydonlarni bittalab tekshiramiz — qatordagi hamma xato ko'rinsin
    for (const k of Object.keys(input) as (keyof CounterpartyInput)[]) {
      if (rowErrors.some((e) => e.column === title(k))) continue;
      try {
        normalizeCounterparty({ [k]: input[k] } as CounterpartyPatch, false);
      } catch (e) {
        if (e instanceof CpError) bad(e.field ?? k, e.message);
        else throw e;
      }
    }
    if (rowErrors.length) errors.push(...rowErrors);
    else rows.push({ row: n, data: normalizeCounterparty(input, true) as CounterpartyInput });
  });

  // STIR: fayl ichida va bazada takrorlanmasin
  const seen = new Map<string, number>();
  for (const { row, data } of rows) {
    if (!data.stir) continue;
    if (seen.has(data.stir)) errors.push({ row, column: 'STIR', message: `Takrorlangan — ${seen.get(data.stir)}-qatorda ham bor` });
    else seen.set(data.stir, row);
  }
  if (seen.size) {
    const taken = await withTenant(db, ctx.tenantId, (tx) => tx.select({ stir: schema.counterparties.stir }).from(schema.counterparties)
      .where(inArray(schema.counterparties.stir, [...seen.keys()])));
    for (const t of taken) errors.push({ row: seen.get(t.stir!)!, column: 'STIR', message: 'Bu STIR bilan kontragent allaqachon bor' });
  }
  if (!rows.length && !errors.length) return { ok: false, errors: [{ row: 0, column: '', message: 'Fayl bo‘sh — kamida bitta qator kerak' }] };
  if (errors.length) {
    const order = new Map(COUNTERPARTY_COLUMNS.map((c, i) => [c.title, i]));
    return { ok: false, errors: errors.sort((a, b) => a.row - b.row || (order.get(a.column) ?? 0) - (order.get(b.column) ?? 0)) };
  }

  await withTenant(db, ctx.tenantId, async (tx) => {
    const inserted = await tx.insert(schema.counterparties).values(rows.map((r) => ({ ...r.data, tenantId: ctx.tenantId })))
      .returning({ id: schema.counterparties.id });
    await tx.insert(schema.auditLog).values(inserted.map((c) => ({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'counterparty', entityId: c.id, meta: { source: 'excel' } })));
  });
  return { ok: true, imported: rows.length };
}
