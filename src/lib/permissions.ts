import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser, type SessionUser } from "./auth";
import { scopeOf, type Action, type Scope } from "./rbac";

export function scopeFor(user: SessionUser, module: string, action: Action = "view"): Scope {
  return user.isSuperAdmin ? "all" : scopeOf(user.perms, module, action);
}

export function can(user: SessionUser, module: string, action: Action = "view") {
  return scopeFor(user, module, action) !== "none";
}

/** Use at the top of every page and server action that touches a module. */
export async function requirePermission(module: string, action: Action = "view") {
  const user = await requireUser();
  if (!can(user, module, action)) redirect("/no-access");
  return user;
}

/** The user plus everyone reporting to them, directly or indirectly. */
export async function teamUserIds(userId: string): Promise<string[]> {
  const ids = new Set([userId]);
  let frontier = [userId];
  while (frontier.length) {
    const reports = await db.user.findMany({ where: { managerId: { in: frontier } }, select: { id: true } });
    frontier = reports.map((r) => r.id).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }
  return [...ids];
}

/**
 * Prisma `where` fragment restricting records to what the user may see for module/action.
 * Returns null when the user has no access at all. Every list/detail query must use this —
 * it is what stops an agent opening another agent's record by URL.
 */
export async function scopeWhere(
  user: SessionUser,
  module: string,
  action: Action = "view",
  fields: { owner: string; branch: string } = { owner: "ownerId", branch: "branchId" },
): Promise<Record<string, unknown> | null> {
  switch (scopeFor(user, module, action)) {
    case "all":
      return {};
    case "branch":
      return user.branchId ? { [fields.branch]: user.branchId } : { [fields.owner]: user.id };
    case "team":
      return { [fields.owner]: { in: await teamUserIds(user.id) } };
    case "own":
      return { [fields.owner]: user.id };
    default:
      return null;
  }
}
