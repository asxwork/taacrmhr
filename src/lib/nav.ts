// Apps and their menus. After login people pick an app on /home (Odoo-style); each app has its own sidebar.
// An item shows only if the user can `view` its module (no module = everyone); an app with no items is hidden.
// `phase` marks modules not built yet — they render a "coming soon" page.

export type NavItem = {
  href: string; label: string; icon: string; module?: string; phase?: number; superAdmin?: boolean;
  /** Permission action needed on `module` (default "view"), e.g. "create" for supervisor-only pages. */
  action?: import("@/lib/rbac").Action;
  /** Boss (and Super Admin) only. */ boss?: boolean;
  /** Other paths that belong to this entry's section (it stays highlighted there), e.g. Leads → /crm/follow-ups. */
  also?: string[];
  /** Also shown when the user can view any of these modules (a section spanning several modules). */
  anyModule?: string[];
  /** Sub-menu (e.g. Compliance ▸, Settings ▸). The parent's href is its first child's. */
  children?: NavItem[];
};
/** A group of items. In a "modules" app (HR) each group is a module: an icon on the rail and its pages in the panel. */
export type NavGroup = { label?: string; icon?: string; items: NavItem[] };

export type AppKey = "crm" | "hr" | "me" | "boss" | "settings" | "learn";
export type AppDef = {
  key: AppKey;
  name: string;
  description: string;
  icon: string;
  /** Tile colours on /home (static Tailwind classes). */
  tile: string;
  home: string;
  /** Paths that belong to this app; the longest match wins. */
  prefixes: string[];
  /** "list": one column of items. "modules": icon rail of modules + panel (ResourceInn-style). */
  layout: "list" | "modules";
  groups: NavGroup[];
};

export const APPS: AppDef[] = [
  {
    key: "crm", name: "CRM", description: "Leads, deals, contacts, calls, inventory", icon: "target", tile: "from-sky-500 to-blue-700",
    home: "/dashboard", prefixes: ["/dashboard", "/crm", "/calls", "/inventory", "/reports/crm", "/reports/agents", "/reports/targets", "/reports/lost"], layout: "list",
    // Six sections; the screens inside each are tabs across the top of the page (lib/sections.ts).
    groups: [
      {
        label: "CRM",
        items: [
          { href: "/dashboard", label: "Home", icon: "home" },
          { href: "/crm/leads", label: "Leads", icon: "target", module: "crm.leads", also: ["/crm/follow-ups", "/crm/tasks", "/crm/focus", "/crm/matches", "/crm/templates", "/crm/visits", "/crm/duplicates"] },
          { href: "/crm/deals", label: "Deals", icon: "handshake", module: "crm.deals" },
          { href: "/calls", label: "Calls", icon: "phonecall", module: "calls" },
          { href: "/crm/contacts", label: "Contacts", icon: "contact", module: "crm.contacts", also: ["/crm/companies"] },
          { href: "/inventory", label: "Inventory", icon: "building", module: "inventory.units", anyModule: ["inventory.projects"] },
          { href: "/reports/crm", label: "Reports", icon: "chart", module: "reports.crm", anyModule: ["crm.targets", "reports.lost"], also: ["/reports/agents", "/reports/targets", "/reports/lost"] },
        ],
      },
    ],
  },
  {
    key: "hr", name: "HR", description: "People, attendance, payroll, requests", icon: "users", tile: "from-violet-500 to-fuchsia-700",
    home: "/hr", prefixes: ["/hr", "/reports/hr", "/settings/hr", "/approvals"], layout: "list",
    // Seven entries; the screens inside each are tabs across the top (lib/sections.ts), the rest are tiles on More.
    groups: [
      {
        label: "HR",
        items: [
          { href: "/hr", label: "Home", icon: "layout", module: "hr.attendance", anyModule: ["hr.employees"] },
          { href: "/hr/employees", label: "People", icon: "users", module: "hr.employees", anyModule: ["hr.onboarding"], also: ["/hr/organization", "/hr/exits", "/hr/onboarding"] },
          { href: "/hr/attendance", label: "Attendance", icon: "clock", module: "hr.attendance" },
          { href: "/hr/leave", label: "Leave", icon: "plane", module: "hr.leave", also: ["/hr/leave-encashment"] },
          { href: "/hr/payroll", label: "Payroll", icon: "wallet", module: "hr.payroll", anyModule: ["hr.expenses"], also: ["/hr/salary-revisions", "/hr/expenses"] },
          { href: "/approvals", label: "Approvals", icon: "filecheck" },
          { href: "/hr/more", label: "More", icon: "layout", also: ["/hr/recruitment", "/hr/performance", "/hr/probation", "/hr/assets", "/hr/policies", "/hr/letters", "/hr/engagement", "/hr/requests", "/hr/settings", "/reports/hr", "/settings/hr"] },
        ],
      },
    ],
  },
  {
    key: "me", name: "My Space", description: "Your profile, attendance, leave and payslips", icon: "user", tile: "from-emerald-500 to-teal-700",
    home: "/me/home", prefixes: ["/me"], layout: "list",
    groups: [
      {
        // Five entries; requests and profile pages are tabs (lib/sections.ts).
        items: [
          { href: "/me/home", label: "Home", icon: "home" },
          { href: "/me/attendance", label: "Attendance", icon: "fingerprint" },
          { href: "/me/leave", label: "Requests", icon: "palm", also: ["/me/expenses", "/hr/requests", "/approvals"] },
          { href: "/me/payslips", label: "Payslips", icon: "banknote" },
          { href: "/me", label: "My profile", icon: "user", also: ["/me/performance", "/me/policies", "/me/surveys"] },
        ],
      },
    ],
  },
  {
    key: "boss", name: "Boss dashboard", description: "The whole business at a glance", icon: "crown", tile: "from-amber-400 to-orange-600",
    home: "/boss", prefixes: ["/boss"], layout: "list",
    groups: [{ items: [{ href: "/boss", label: "Boss dashboard", icon: "crown", boss: true }] }],
  },
  {
    // Tutorials app: everyone sees the tutorials for what their role can use; Super Admins see all of it.
    key: "learn", name: "Tutorials", description: "Learn AMS: video tour and step-by-step guides", icon: "sparkles", tile: "from-amber-500 to-orange-700",
    home: "/help", prefixes: ["/help"], layout: "list",
    groups: [
      {
        label: "Tutorials",
        items: [
          { href: "/help", label: "All tutorials", icon: "sparkles" },
          { href: "/help?g=start", label: "Getting started", icon: "home" },
          { href: "/help?g=crm", label: "CRM", icon: "target", module: "crm.leads", anyModule: ["crm.deals", "crm.contacts"] },
          { href: "/help?g=calls", label: "Calls", icon: "phonecall", module: "calls" },
          { href: "/help?g=hr", label: "HR", icon: "users", module: "hr.employees", anyModule: ["hr.attendance", "hr.leave", "hr.payroll"] },
          { href: "/help?g=me", label: "My Space", icon: "user" },
          { href: "/help?g=admin", label: "Admin", icon: "usercog", module: "settings.users", anyModule: ["settings.roles", "settings.company"] },
        ],
      },
    ],
  },
  {
    key: "settings", name: "Settings", description: "Users, roles, company, integrations", icon: "usercog", tile: "from-slate-500 to-slate-800",
    home: "/settings", prefixes: ["/settings"], layout: "list",
    groups: [
      {
        label: "Settings",
        items: [
          { href: "/settings/users", label: "Users", icon: "usercog", module: "settings.users" },
          { href: "/settings/roles", label: "Roles & Permissions", icon: "shield", module: "settings.roles" },
          { href: "/settings/features", label: "Features", icon: "sliders", module: "settings.company" },
          { href: "/settings/security", label: "Security", icon: "shield", superAdmin: true },
          { href: "/settings/company", label: "Company & Branches", icon: "landmark", module: "settings.company" },
          { href: "/settings/crm", label: "CRM Settings", icon: "sliders", module: "settings.company" },
          { href: "/crm/automations", label: "Lead automations", icon: "workflow", superAdmin: true },
          { href: "/settings/hr", label: "HR Settings", icon: "clipboard", module: "hr.employees" },
          { href: "/settings/integrations", label: "Integrations", icon: "plug", module: "settings.company" },
          { href: "/settings/audit", label: "Audit Log", icon: "history", module: "settings.audit" },
          { href: "/settings/layouts", label: "Layouts", icon: "layout", superAdmin: true },
        ],
      },
    ],
  },
];

/** Every menu as one list (search palette, "coming soon" pages, dashboard shortcuts). Groups are labelled by app. */
export const NAV: NavGroup[] = APPS.flatMap((a) => a.groups.map((g) => ({ ...g, label: a.key === "settings" ? "Settings" : a.layout === "modules" ? a.name : g.label ?? a.name })));
export const NAV_ITEMS = NAV.flatMap((g) => g.items.flatMap((i) => (i.children ? [i, ...i.children] : [i])));

/** The app a path belongs to: longest matching prefix, or null for shared pages (notifications…). */
export function appForPath<T extends Pick<AppDef, "key" | "prefixes">>(apps: T[], pathname: string): T | null {
  let best: { app: T; len: number } | null = null;
  for (const app of apps) {
    for (const p of app.prefixes) {
      if ((pathname === p || pathname.startsWith(p + "/")) && (!best || p.length > best.len)) best = { app, len: p.length };
    }
  }
  return best?.app ?? null;
}

/**
 * appForPath, but a page the last-used app also links to (e.g. My Space → New request under /hr) stays in that app,
 * so the menu doesn't jump to another app.
 */
export function appForPathFrom<T extends Pick<AppDef, "key" | "prefixes" | "groups">>(apps: T[], pathname: string, lastKey?: string): T | null {
  const last = apps.find((a) => a.key === lastKey);
  const pathOf = (h: string) => h.split(/[?#]/)[0];
  if (last?.groups.some((g) => g.items.some((i) => pathOf(i.href) === pathname || i.also?.includes(pathname)))) return last;
  return appForPath(apps, pathname);
}

/** data-sidebar value on the page shell; globals.css turns it into the sidebar width (--sb-w). */
export function sidebarMode(layout: AppDef["layout"], rail: boolean) {
  return layout === "modules" ? (rail ? "modules-collapsed" : "modules") : rail ? "collapsed" : "open";
}
