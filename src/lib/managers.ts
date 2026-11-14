// Who can be someone's manager ("Reports to"): people with admin, HR, supervisor or manager access, not everyone.
import { db } from "./db";

const MANAGER_ROLE = /admin|super|hr\b|human|supervisor|manager|head|lead|boss|director|owner/i;
// Any of these permissions (any scope except none) makes a user a possible manager.
const MANAGER_PERMS: [string, string][] = [["hr.employees", "edit"], ["hr.leave", "approve"], ["hr.attendance", "edit"], ["crm.leads", "assign"], ["crm.deals", "assign"], ["settings.users", "edit"]];

/** User ids that may be picked as a manager. */
export async function managerUserIds(): Promise<Set<string>> {
  const users = await db.user.findMany({
    where: {
      active: true,
      OR: [
        { isSuperAdmin: true },
        { roles: { some: { role: { OR: [{ key: "boss" }, { permissions: { some: { OR: MANAGER_PERMS.map(([module, action]) => ({ module, action, scope: { not: "none" } })) } } }] } } } },
      ],
    },
    select: { id: true, roles: { select: { role: { select: { name: true } } } } },
  });
  const byName = await db.user.findMany({ where: { active: true, roles: { some: {} } }, select: { id: true, roles: { select: { role: { select: { name: true } } } } } });
  return new Set([...users.map((u) => u.id), ...byName.filter((u) => u.roles.some((r) => MANAGER_ROLE.test(r.role.name))).map((u) => u.id)]);
}

/** Employees (active) whose login is a possible manager; `keep` adds ids already set somewhere so nothing disappears. */
export async function managerEmployees(keep: (string | null | undefined)[] = []) {
  const ids = await managerUserIds();
  const rows = await db.employee.findMany({ where: { status: { not: "left" }, OR: [{ userId: { in: [...ids] } }, { id: { in: keep.filter((k): k is string => !!k) } }] }, select: { id: true, fullName: true, designation: { select: { name: true } } }, orderBy: { fullName: "asc" } });
  return rows;
}
