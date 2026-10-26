// Permission model: Module × Action × Scope. Pure definitions — safe to import on client and server.

export const SCOPES = ["none", "own", "team", "branch", "all"] as const;
export type Scope = (typeof SCOPES)[number];

// Bitrix wording. "Team" = the user plus everyone under them in the "Reports to" chain.
export const SCOPE_LABELS: Record<Scope, string> = {
  none: "Deny access",
  own: "Only their own items",
  team: "Their team's items",
  branch: "Their branch's items",
  all: "All",
};

export const ACTIONS = ["view", "create", "edit", "delete", "export", "approve", "assign"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  view: "Read", create: "Add", edit: "Edit", delete: "Delete", export: "Export", approve: "Approve", assign: "Reassign to others",
};

export type ModuleDef = {
  key: string;
  label: string;
  group: "CRM" | "Inventory" | "HR" | "Reports" | "Settings";
  actions: readonly Action[];
  /** Records in this module have an owner/branch, so own/team/branch scopes apply. */
  scoped: boolean;
};

const CRUD = ["view", "create", "edit", "delete", "export"] as const;

export const MODULES: readonly ModuleDef[] = [
  { key: "crm.leads", label: "Leads", group: "CRM", actions: [...CRUD, "assign"], scoped: true },
  { key: "crm.deals", label: "Deals", group: "CRM", actions: [...CRUD, "assign"], scoped: true },
  { key: "crm.contacts", label: "Contacts & Companies", group: "CRM", actions: CRUD, scoped: true },
  { key: "crm.activities", label: "Activities & Tasks", group: "CRM", actions: ["view", "create", "edit", "export"], scoped: true }, // delete: Super Admin only
  { key: "inventory.projects", label: "Projects & Blocks", group: "Inventory", actions: CRUD, scoped: false },
  { key: "inventory.units", label: "Units / Listings", group: "Inventory", actions: [...CRUD, "assign"], scoped: true },
  { key: "hr.employees", label: "Employees", group: "HR", actions: CRUD, scoped: true },
  { key: "hr.attendance", label: "Attendance", group: "HR", actions: [...CRUD, "approve"], scoped: true },
  { key: "hr.leave", label: "Leave", group: "HR", actions: [...CRUD, "approve"], scoped: true },
  { key: "hr.payroll", label: "Payroll", group: "HR", actions: [...CRUD, "approve"], scoped: true },
  { key: "hr.recruitment", label: "Recruitment", group: "HR", actions: [...CRUD, "approve"], scoped: false },
  { key: "hr.performance", label: "Performance", group: "HR", actions: [...CRUD, "approve"], scoped: true },
  { key: "hr.expenses", label: "Expenses & Loans", group: "HR", actions: [...CRUD, "approve"], scoped: true },
  { key: "hr.assets", label: "Assets", group: "HR", actions: CRUD, scoped: false },
  { key: "reports.crm", label: "CRM Reports", group: "Reports", actions: ["view", "export"], scoped: true },
  { key: "reports.hr", label: "HR Reports", group: "Reports", actions: ["view", "export"], scoped: true },
  { key: "settings.users", label: "Users", group: "Settings", actions: ["view", "create", "edit", "delete"], scoped: false },
  { key: "settings.roles", label: "Roles & Permissions", group: "Settings", actions: ["view", "create", "edit", "delete"], scoped: false },
  { key: "settings.company", label: "Company, Branches & Lists", group: "Settings", actions: ["view", "edit"], scoped: false },
  { key: "settings.audit", label: "Audit Log", group: "Settings", actions: ["view"], scoped: false },
] as const;

export const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<string, ModuleDef>;

/** Scopes that make sense for a module (unscoped modules are simply on/off). */
export function scopesFor(module: ModuleDef): readonly Scope[] {
  return module.scoped ? SCOPES : (["none", "all"] as const);
}

export const SCOPE_RANK: Record<Scope, number> = { none: 0, own: 1, team: 2, branch: 3, all: 4 };

export function maxScope(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

/** "module:action" -> scope */
export type PermissionMap = Record<string, Scope>;

export function permKey(module: string, action: Action) {
  return `${module}:${action}`;
}

export function scopeOf(perms: PermissionMap, module: string, action: Action): Scope {
  return perms[permKey(module, action)] ?? "none";
}

// ─── Default roles (used by seed; admins can edit afterwards) ───────────────

type RoleTemplate = { name: string; description: string; grants: Record<string, Partial<Record<Action, Scope>> | Scope> };

const crmGroup = ["crm.leads", "crm.deals", "crm.contacts", "crm.activities"];
const hrGroup = MODULES.filter((m) => m.group === "HR").map((m) => m.key);

function all(scope: Scope, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, scope]));
}

const allModules = MODULES.map((m) => m.key);
const crmAll = [...crmGroup, "inventory.projects", "inventory.units", "reports.crm"];

export const DEFAULT_ROLES: RoleTemplate[] = [
  // Bitrix-style roles
  {
    name: "Administrator",
    description: "Everything, including users, roles and settings (like a Super Admin, but as a role).",
    grants: all("all", allModules),
  },
  {
    name: "Supervisor",
    description: "All CRM, inventory and CRM reports across the company.",
    grants: all("all", crmAll),
  },
  {
    name: "Deputy supervisor",
    description: "CRM and inventory for their team (themselves and everyone reporting to them).",
    grants: { ...all("team", crmGroup), "inventory.projects": { view: "all" }, "inventory.units": "team", "reports.crm": "team" },
  },
  {
    name: "Observer",
    description: "Can read their own CRM items but not add, change or delete anything.",
    grants: { "crm.leads": { view: "own" }, "crm.deals": { view: "own" }, "crm.contacts": { view: "own" }, "crm.activities": { view: "own" }, "inventory.projects": { view: "all" }, "inventory.units": { view: "own" } },
  },
  {
    name: "HR Manager",
    description: "Runs HR: employees, attendance, leave, payroll, recruitment.",
    grants: { ...all("all", hrGroup), "reports.hr": "all" },
  },
  {
    name: "Sales Manager",
    description: "Manages a sales team: sees and reassigns the team's leads and deals.",
    grants: {
      ...all("team", crmGroup),
      "inventory.projects": { view: "all" },
      "inventory.units": { view: "all", create: "team", edit: "team", export: "team", assign: "team" },
      "reports.crm": "team",
      "hr.leave": { view: "team", approve: "team" },
      "hr.attendance": { view: "team", approve: "team" },
    },
  },
  {
    name: "Agent",
    description: "Works only their own leads, deals and listings.",
    grants: {
      "crm.leads": { view: "own", create: "own", edit: "own" },
      "crm.deals": { view: "own", create: "own", edit: "own" },
      "crm.contacts": { view: "own", create: "own", edit: "own" },
      "crm.activities": { view: "own", create: "own", edit: "own", delete: "own" },
      "inventory.projects": { view: "all" },
      "inventory.units": { view: "own", create: "own", edit: "own" },
      "reports.crm": { view: "own" },
    },
  },
  {
    name: "Employee",
    description: "Self-service only (own profile, attendance, leave, payslips).",
    grants: {},
  },
];

/** Expand a template into concrete permission rows, clamped to each module's allowed actions/scopes. */
export function expandGrants(grants: RoleTemplate["grants"]) {
  const rows: { module: string; action: Action; scope: Scope }[] = [];
  for (const [moduleKey, grant] of Object.entries(grants)) {
    const mod = MODULE_MAP[moduleKey];
    if (!mod) continue;
    for (const action of mod.actions) {
      const scope = typeof grant === "string" ? grant : grant[action];
      if (!scope || scope === "none") continue;
      rows.push({ module: moduleKey, action, scope: mod.scoped ? scope : "all" });
    }
  }
  return rows;
}
