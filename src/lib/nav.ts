// Apps and their menus. After login people pick an app on /home (Odoo-style); each app has its own sidebar.
// An item shows only if the user can `view` its module (no module = everyone); an app with no items is hidden.
// `phase` marks modules not built yet — they render a "coming soon" page.

export type NavItem = { href: string; label: string; icon: string; module?: string; phase?: number; superAdmin?: boolean; /** Boss (and Super Admin) only. */ boss?: boolean };
/** A group of items. In a "modules" app (HR) each group is a module: an icon on the rail and its pages in the panel. */
export type NavGroup = { label?: string; icon?: string; items: NavItem[] };

export type AppKey = "crm" | "hr" | "me" | "boss" | "settings";
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
    key: "crm", name: "CRM", description: "Leads, deals, contacts, inventory", icon: "target", tile: "from-sky-500 to-blue-700",
    home: "/dashboard", prefixes: ["/dashboard", "/crm", "/inventory", "/reports/crm", "/reports/agents"], layout: "list",
    groups: [
      { items: [{ href: "/dashboard", label: "Dashboard", icon: "home" }] },
      {
        label: "Sales",
        items: [
          { href: "/crm/leads", label: "Leads", icon: "target", module: "crm.leads" },
          { href: "/crm/follow-ups", label: "My follow-ups", icon: "phonecall", module: "crm.leads" },
          { href: "/crm/deals", label: "Deals", icon: "handshake", module: "crm.deals" },
          { href: "/crm/contacts", label: "Contacts", icon: "contact", module: "crm.contacts" },
          { href: "/crm/tasks", label: "Tasks & Calendar", icon: "calendar", module: "crm.activities" },
        ],
      },
      { label: "Property", items: [{ href: "/inventory", label: "Inventory", icon: "building", module: "inventory.units" }] },
      {
        label: "Insights",
        items: [
          { href: "/reports/crm", label: "CRM Reports", icon: "chart", module: "reports.crm" },
          { href: "/reports/agents", label: "Agent performance", icon: "gauge", superAdmin: true },
          { href: "/crm/automations", label: "Automations", icon: "workflow", superAdmin: true },
        ],
      },
    ],
  },
  {
    key: "hr", name: "HR", description: "People, attendance, payroll, requests", icon: "users", tile: "from-violet-500 to-fuchsia-700",
    home: "/hr", prefixes: ["/hr", "/reports/hr", "/settings/hr", "/approvals"], layout: "modules",
    groups: [
      { label: "Dashboard", icon: "layout", items: [{ href: "/hr", label: "Attendance overview", icon: "layout", module: "hr.attendance" }] },
      {
        label: "People", icon: "users",
        items: [
          { href: "/hr/employees", label: "Employees", icon: "users", module: "hr.employees" },
          { href: "/hr/assets", label: "Assets", icon: "laptop", module: "hr.assets" },
        ],
      },
      {
        label: "Payroll", icon: "wallet",
        items: [
          { href: "/hr/payroll", label: "Payroll", icon: "wallet", module: "hr.payroll" },
          { href: "/hr/expenses", label: "Expenses & Loans", icon: "receipt", module: "hr.expenses" },
        ],
      },
      {
        label: "Attendance", icon: "clock",
        items: [
          { href: "/hr/attendance", label: "Daily attendance", icon: "clock", module: "hr.attendance" },
          { href: "/hr/leave", label: "Leave", icon: "plane", module: "hr.leave" },
          { href: "/hr/attendance/logs", label: "Attendance logs", icon: "history", module: "hr.attendance" },
        ],
      },
      { label: "Requests", icon: "check", items: [{ href: "/approvals", label: "Approvals & requests", icon: "check" }] },
      { label: "Assessment", icon: "trending", items: [{ href: "/hr/performance", label: "Performance", icon: "trending", module: "hr.performance" }] },
      { label: "Recruitment", icon: "briefcase", items: [{ href: "/hr/recruitment", label: "Recruitment", icon: "briefcase", module: "hr.recruitment" }] },
      { label: "Reports", icon: "pie", items: [{ href: "/reports/hr", label: "HR Reports", icon: "pie", module: "reports.hr" }] },
      { label: "Settings", icon: "clipboard", items: [{ href: "/settings/hr", label: "HR Settings", icon: "clipboard", module: "hr.employees" }] },
    ],
  },
  {
    key: "me", name: "My Space", description: "Your profile, attendance, leave and payslips", icon: "user", tile: "from-emerald-500 to-teal-700",
    home: "/me", prefixes: ["/me"], layout: "list",
    groups: [
      {
        items: [
          { href: "/me", label: "My Profile", icon: "user" },
          { href: "/me/attendance", label: "My Attendance", icon: "fingerprint" },
          { href: "/me/leave", label: "My Leave", icon: "palm" },
          { href: "/me/payslips", label: "My Payslips", icon: "banknote" },
          { href: "/me/expenses", label: "My Expenses & Loans", icon: "card" },
          { href: "/me/performance", label: "My Performance", icon: "award" },
          { href: "/approvals?tab=mine", label: "My Requests", icon: "check" },
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
    key: "settings", name: "Settings", description: "Users, roles, company, integrations", icon: "usercog", tile: "from-slate-500 to-slate-800",
    home: "/settings", prefixes: ["/settings"], layout: "list",
    groups: [
      {
        label: "Settings",
        items: [
          { href: "/settings/users", label: "Users", icon: "usercog", module: "settings.users" },
          { href: "/settings/roles", label: "Roles & Permissions", icon: "shield", module: "settings.roles" },
          { href: "/settings/company", label: "Company & Branches", icon: "landmark", module: "settings.company" },
          { href: "/settings/crm", label: "CRM Settings", icon: "sliders", module: "settings.company" },
          { href: "/settings/hr", label: "HR Settings", icon: "clipboard", module: "hr.employees" },
          { href: "/settings/integrations", label: "Integrations", icon: "plug", module: "settings.company" },
          { href: "/settings/audit", label: "Audit Log", icon: "history", module: "settings.audit" },
        ],
      },
    ],
  },
];

/** Every menu as one list (search palette, "coming soon" pages, dashboard shortcuts). Groups are labelled by app. */
export const NAV: NavGroup[] = APPS.flatMap((a) => a.groups.map((g) => ({ ...g, label: a.key === "settings" ? "Settings" : a.layout === "modules" ? a.name : g.label ?? a.name })));
export const NAV_ITEMS = NAV.flatMap((g) => g.items);

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

/** data-sidebar value on the page shell; globals.css turns it into the sidebar width (--sb-w). */
export function sidebarMode(layout: AppDef["layout"], rail: boolean) {
  return layout === "modules" ? (rail ? "modules-collapsed" : "modules") : rail ? "collapsed" : "open";
}
