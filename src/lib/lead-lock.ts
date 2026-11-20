// Leads of old employees (their login is inactive) stay with them, and only a Super Admin can change them: edit,
// stage, reassign, delete, bulk actions and automations all go through these.
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "./auth";
import type { Action } from "./rbac";
import { scopeMatcher, scopeWhere } from "./permissions";

/** Leads nobody owns, or owned by someone who still works here. */
export const ACTIVE_OWNER: Prisma.LeadWhereInput = { OR: [{ ownerId: null }, { owner: { active: true } }] };

/** The leads this user may change (null = none). */
export async function leadChangeWhere(user: SessionUser, action: Action = "edit"): Promise<Prisma.LeadWhereInput | null> {
  const scope = await scopeWhere(user, "crm.leads", action);
  if (!scope) return null;
  return user.isSuperAdmin ? scope : { AND: [scope, ACTIVE_OWNER] };
}

/** Same rule for one lead already loaded; pass whether its owner is active. */
export async function leadChangeMatcher(user: SessionUser, action: Action = "edit") {
  const inScope = await scopeMatcher(user, "crm.leads", action);
  return (lead: { ownerId: string | null; branchId: string | null; ownerActive?: boolean | null }) =>
    inScope(lead) && (user.isSuperAdmin || !lead.ownerId || lead.ownerActive !== false);
}
