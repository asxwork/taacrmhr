// Which tutorials a person sees: section by section (CRM guides only for CRM users, HR guides only for HR, …),
// then each guide's own permission. Used by the Tutorials page and the "?" help button on every page.
import type { SessionUser } from "./auth";
import { can } from "./permissions";
import { MODULES } from "./rbac";
import { TUTORIALS, type Tutorial } from "./tutorials";

export function visibleTutorials(user: SessionUser): Tutorial[] {
  if (user.isSuperAdmin) return TUTORIALS;
  const anyOf = (mods: string[]) => mods.some((m) => can(user, m));
  const section: Record<string, boolean> = {
    "Getting started": true, "My Space": true,
    CRM: anyOf(["crm.leads", "crm.deals", "crm.contacts", "crm.activities", "inventory.units", "inventory.projects", "reports.crm"]),
    Calls: anyOf(["calls"]),
    HR: MODULES.some((m) => m.group === "HR" && can(user, m.key) && m.key !== "hr.orgchart") || anyOf(["reports.hr"]),
    Admin: anyOf(["settings.users", "settings.roles", "settings.company", "settings.audit"]),
  };
  return TUTORIALS.filter((t) => section[t.group] !== false && (!t.module || can(user, t.module, t.action ?? "view")) && !t.superAdmin);
}
