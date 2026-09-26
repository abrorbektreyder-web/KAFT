// DOC-01/02, HR-08: hujjatlar va maxfiylik darajasi (ochiq / bo'lim / maxfiy).
import { and, eq, schema, withTenant, type Db, type Tx } from '@kaft/db';
import { authorize, can, deny, type Ctx } from './permissions.ts';
import { messageText, notify } from './notifications.ts';
import type { Scope } from './roles.ts';
import type { FileStorage } from './storage/index.ts';

export type OwnerType = 'employee' | 'counterparty' | 'company';
export type Confidentiality = 'open' | 'department' | 'secret';

export interface NewDocument {
  ownerType: OwnerType;
  ownerId: string;
  departmentId?: string;
  title: string;
  kind: 'contract' | 'order' | 'copy' | 'regulation' | 'other';
  confidentiality: Confidentiality;
  fileName: string;
  contentType: string;
  data: Uint8Array;
  /** YYYY-MM-DD — muddatli hujjat (DOC-03 eslatmasi uchun) */
  expiresOn?: string;
}

type Doc = typeof schema.documents.$inferSelect;

export interface Viewer {
  docScope: Scope | null;
  /** Hujjatlarni boshqaruvchilar (T/Y): ega, direktor, buxgalter, HR */
  docManager: boolean;
  hrSecretAll: boolean;
  employee: { id: string; departmentId: string | null } | undefined;
}

export async function viewer(tx: Tx, ctx: Ctx): Promise<Viewer> {
  const [docScope, update, hrSecret] = await Promise.all([
    can(tx, ctx.userId, 'doc', 'view'), can(tx, ctx.userId, 'doc', 'update'), can(tx, ctx.userId, 'hr.secret', 'view'),
  ]);
  const [employee] = await tx.select({ id: schema.employees.id, departmentId: schema.employees.departmentId })
    .from(schema.employees).where(eq(schema.employees.userId, ctx.userId));
  return { docScope, docManager: update === 'all', hrSecretAll: hrSecret === 'all', employee };
}

/** Maxfiylik qoidasi — hujjatni shu foydalanuvchi ko'ra oladimi. */
export function canSee(doc: Pick<Doc, 'ownerType' | 'ownerId' | 'departmentId' | 'confidentiality'>, v: Viewer): boolean {
  if (!v.docScope) return false;
  // Xodim o'z kartasidagi hujjatlarni (o'z pasport nusxasi ham) ko'radi
  if (doc.ownerType === 'employee' && doc.ownerId === v.employee?.id) return true;
  if (doc.confidentiality === 'secret') return doc.ownerType === 'employee' ? v.hrSecretAll : v.docManager;
  if (doc.confidentiality === 'department') return v.docManager || (!!doc.departmentId && doc.departmentId === v.employee?.departmentId);
  return true;
}

export async function uploadDocument(db: Db, storage: FileStorage, ctx: Ctx, input: NewDocument) {
  const scope = await authorize(db, ctx, 'doc', 'create');
  const { data, ...fields } = input;

  const doc = await withTenant(db, ctx.tenantId, async (tx) => {
    let departmentId = fields.departmentId;
    if (fields.ownerType === 'employee') {
      const [e] = await tx.select({ departmentId: schema.employees.departmentId, userId: schema.employees.userId })
        .from(schema.employees).where(eq(schema.employees.id, fields.ownerId));
      if (!e) throw new Error('Xodim topilmadi');
      if (scope === 'own' && e.userId !== ctx.userId) return null;
      departmentId ??= e.departmentId ?? undefined;
    } else if (scope === 'own') return null;

    const id = crypto.randomUUID();
    const [row] = await tx.insert(schema.documents).values({
      ...fields, id, departmentId, tenantId: ctx.tenantId, storageKey: `${ctx.tenantId}/${id}`, size: data.byteLength, uploadedBy: ctx.userId,
    }).returning();
    await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'create', entity: 'document', entityId: id, meta: { title: fields.title, confidentiality: fields.confidentiality } });
    return row!;
  });
  if (!doc) return deny(db, ctx, 'doc', 'create', input.ownerId);
  // Fayl bazadagi yozuvdan keyin — yozuv bor-u fayl yo'q holat audit orqali ko'rinadi, aksi emas
  await storage.put(doc.storageKey, data, doc.contentType);
  return { id: doc.id };
}

export async function listDocuments(db: Db, ctx: Ctx, owner: { ownerType: OwnerType; ownerId: string }) {
  await authorize(db, ctx, 'doc', 'view');
  const { docs, v } = await withTenant(db, ctx.tenantId, async (tx) => ({
    v: await viewer(tx, ctx),
    docs: await tx.select().from(schema.documents)
      .where(and(eq(schema.documents.ownerType, owner.ownerType), eq(schema.documents.ownerId, owner.ownerId))),
  }));
  return docs.filter((d) => canSee(d, v)).map(({ storageKey: _k, tenantId: _t, ...d }) => d);
}

export async function readDocument(db: Db, storage: FileStorage, ctx: Ctx, id: string) {
  await authorize(db, ctx, 'doc', 'view');
  const doc = await withTenant(db, ctx.tenantId, async (tx) => {
    const [d] = await tx.select().from(schema.documents).where(eq(schema.documents.id, id));
    if (!d) throw new Error('Hujjat topilmadi');
    if (!canSee(d, await viewer(tx, ctx))) return null;
    if (d.confidentiality !== 'open') {
      await tx.insert(schema.auditLog).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: 'read', entity: 'document', entityId: id });
    }
    return d;
  });
  if (!doc) return deny(db, ctx, 'doc', 'view', id);
  const { storageKey, tenantId: _t, ...meta } = doc;
  return { meta, data: await storage.get(storageKey) };
}

// ---------------------------------------------------------------- DOC-03: muddatli hujjat eslatmasi

export const DOC_EXPIRY_LEAD = 30;

/** Kunlik ish (tenant ichida): muddati 30 kundan keyin tugaydigan hujjatlar — yuklagan va hujjatlarni boshqaruvchilarga,
 *  faqat hujjatni ko'ra oladiganlarga (maxfiy xodim hujjati — maxfiy ma'lumot huquqi borlarga). */
export async function documentExpiryReminders(tx: Tx, tenantId: string, on: string) {
  const due = new Date(Date.parse(on) + DOC_EXPIRY_LEAD * 86_400_000).toISOString().slice(0, 10);
  const docs = await tx.select().from(schema.documents).where(eq(schema.documents.expiresOn, due));
  if (!docs.length) return 0;
  const managers = await tx.selectDistinct({ id: schema.users.id }).from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.userRoles.roleId))
    .where(and(eq(schema.rolePermissions.module, 'doc'), eq(schema.rolePermissions.action, 'update'), eq(schema.rolePermissions.scope, 'all'), eq(schema.users.isBlocked, false)));
  const candidates = [...new Set([...managers.map((m) => m.id), ...docs.map((d) => d.uploadedBy).filter((x): x is string => !!x)])];
  const viewers = new Map<string, Viewer>();
  for (const userId of candidates) viewers.set(userId, await viewer(tx, { tenantId, userId }));
  let created = 0;
  for (const d of docs) {
    const to = candidates.filter((id) => canSee(d, viewers.get(id)!));
    if (!to.length) continue;
    const params = { title: d.title, date: d.expiresOn! };
    created += (await notify(tx, to, {
      kind: 'doc_expiry', ...messageText('doc_expiry', params, 'uz'), params, link: `/hujjatlar/${d.id}`, dedupeKey: `doc_expiry:${d.id}:${d.expiresOn}`,
    })).length;
  }
  return created;
}

