import { db } from "./db";
import { scopeFor, scopeWhere, teamUserIds } from "./permissions";
import type { SessionUser } from "./auth";

export * from "./crm-shared";

/** Users this person may assign records to, based on their `assign` scope for the module. */
export async function assignableUsers(user: SessionUser, module: string) {
  return usersInScope(user, module, "assign");
}

/** Active users whose records fall inside the user's scope for module/action (owner filters, assignees). */
export async function usersInScope(user: SessionUser, module: string, action: "view" | "assign") {
  const scope = scopeFor(user, module, action);
  if (scope === "none") return [];
  const where =
    scope === "all" ? {} :
    scope === "branch" ? { branchId: user.branchId } :
    scope === "team" ? { id: { in: await teamUserIds(user.id) } } :
    { id: user.id };
  return db.user.findMany({ where: { active: true, ...where }, select: { id: true, name: true, branchId: true }, orderBy: { name: "asc" } });
}

/** Decide the owner for a create/edit: users without `assign` can only own records themselves. */
export async function resolveOwner(user: SessionUser, module: string, requested: string, current?: string | null) {
  if (scopeFor(user, module, "assign") === "none") return current ?? user.id;
  if (!requested) return current ?? user.id;
  const allowed = await assignableUsers(user, module);
  const pick = allowed.find((u) => u.id === requested);
  return pick ? pick.id : current ?? user.id;
}

export async function ownerBranch(ownerId: string | null) {
  if (!ownerId) return null;
  return (await db.user.findUnique({ where: { id: ownerId }, select: { branchId: true } }))?.branchId ?? null;
}

export async function logSystem(entity: { leadId?: string; dealId?: string; contactId?: string }, subject: string, userId: string) {
  await db.activity.create({ data: { type: "system", subject, doneAt: new Date(), ...entity, createdById: userId, ownerId: userId } });
}

export type EntityRef = { leadId?: string; dealId?: string; contactId?: string; companyId?: string };

/** Can the user see (or edit) the record an activity hangs off? Uses that record's module scope. */
export async function canAccessEntity(user: SessionUser, ref: EntityRef, action: "view" | "edit" = "view") {
  const check = async (module: string, find: (where: Record<string, unknown>) => Promise<unknown>) => {
    const scope = await scopeWhere(user, module, action);
    return scope ? !!(await find(scope)) : false;
  };
  if (ref.leadId) return check("crm.leads", (s) => db.lead.findFirst({ where: { id: ref.leadId, ...s }, select: { id: true } }));
  if (ref.dealId) return check("crm.deals", (s) => db.deal.findFirst({ where: { id: ref.dealId, ...s }, select: { id: true } }));
  if (ref.contactId) return check("crm.contacts", (s) => db.contact.findFirst({ where: { id: ref.contactId, ...s }, select: { id: true } }));
  if (ref.companyId) return check("crm.contacts", (s) => db.company.findFirst({ where: { id: ref.companyId, ...s }, select: { id: true } }));
  return false;
}

export const TIMELINE_INCLUDE = { owner: { select: { name: true } }, createdBy: { select: { name: true } } } as const;

/** Which of these activities the user may tick off / delete (crm.activities edit scope). */
export async function editableActivityIds(user: SessionUser, ids: string[]) {
  const scope = await scopeWhere(user, "crm.activities", "edit");
  if (!scope || ids.length === 0) return new Set<string>();
  const rows = await db.activity.findMany({ where: { id: { in: ids }, ...scope }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/** A deal the user may edit (crm.deals edit scope), or null. */
export async function editableDealFor(user: SessionUser, id: string) {
  const scope = await scopeWhere(user, "crm.deals", "edit");
  return scope ? db.deal.findFirst({ where: { id, ...scope }, include: { stage: true } }) : null;
}
