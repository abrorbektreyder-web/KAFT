// CORE-09: global qidiruv. Hozir — xodimlar va hujjatlar; kontragent (R1) va tovar (R2) modullari bilan qo'shiladi.
import { and, eq, ilike, or, schema, withTenant, type Db } from '@kaft/db';
import { can, type Ctx } from './permissions.ts';
import { canSee, viewer } from './documents.ts';

export interface SearchHit { type: 'employee' | 'document'; id: string; title: string; subtitle?: string; href: string }

const LIMIT = 20;
// ILIKE uchun maxsus belgilar oddiy matn bo'lib qoladi
const escapeLike = (s: string) => s.replace(/[\%_]/g, (c) => `\${c}`);

export async function search(db: Db, ctx: Ctx, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${escapeLike(q)}%`;

  return withTenant(db, ctx.tenantId, async (tx) => {
    const hits: SearchHit[] = [];
    const hrScope = await can(tx, ctx.userId, 'hr', 'view');
    if (hrScope) {
      const rows = await tx.select({ id: schema.employees.id, lastName: schema.employees.lastName, firstName: schema.employees.firstName, phone: schema.employees.phone })
        .from(schema.employees)
        .where(and(
          or(ilike(schema.employees.lastName, pattern), ilike(schema.employees.firstName, pattern)),
          hrScope === 'own' ? eq(schema.employees.userId, ctx.userId) : undefined,
        ))
        .limit(LIMIT);
      hits.push(...rows.map((r) => ({ type: 'employee' as const, id: r.id, title: `${r.lastName} ${r.firstName}`, subtitle: r.phone ?? undefined, href: `/kadrlar/${r.id}` })));
    }
    const v = await viewer(tx, ctx);
    if (v.docScope) {
      const docs = await tx.select().from(schema.documents).where(ilike(schema.documents.title, pattern)).limit(LIMIT);
      hits.push(...docs.filter((d) => canSee(d, v)).map((d) => ({ type: 'document' as const, id: d.id, title: d.title, subtitle: d.fileName, href: `/hujjatlar/${d.id}` })));
    }
    return hits.slice(0, LIMIT);
  });
}
