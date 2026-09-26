// «Kontragentlar» sahifalari ma'lumotlari (CP-01…05, 08). Ruxsat yo'q bo'lsa — null.
import { can, counterpartyDebts, getCounterparty, listChangeRequests, listCounterparties, type CounterpartyRole, type Ctx } from "@kaft/core";
import { eq, schema, withTenant } from "@kaft/db";
import { db } from "@/lib/server";

export async function cpAccess(ctx: Ctx) {
  const [view, create, update, approve] = await withTenant(db, ctx.tenantId, (tx) => Promise.all([
    can(tx, ctx.userId, "cp", "view"), can(tx, ctx.userId, "cp", "create"), can(tx, ctx.userId, "cp", "update"), can(tx, ctx.userId, "cp", "approve"),
  ]));
  return { view, create, update, approver: approve === "all", full: create === "all" };
}

async function users(ctx: Ctx) {
  return withTenant(db, ctx.tenantId, (tx) => tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users)
    .where(eq(schema.users.isBlocked, false)).orderBy(schema.users.fullName));
}

export async function loadCounterpartyList(ctx: Ctx, opts: { q?: string; role?: CounterpartyRole }) {
  const access = await cpAccess(ctx);
  if (!access.view) return null;
  const [items, people, requests] = await Promise.all([
    listCounterparties(db, ctx, opts),
    users(ctx),
    listChangeRequests(db, ctx, { status: "pending" }),
  ]);
  return { access, items, users: people, requests };
}

export async function loadCounterpartyCard(ctx: Ctx, id: string) {
  const access = await cpAccess(ctx);
  if (!access.view) return null;
  const [card, people, debts] = await Promise.all([getCounterparty(db, ctx, id), users(ctx), counterpartyDebts(db, ctx, id)]);
  const requester = card.pendingRequest ? people.find((p) => p.id === card.pendingRequest!.requestedBy)?.name ?? "" : "";
  return { access, card, users: people, requester, debts };
}
