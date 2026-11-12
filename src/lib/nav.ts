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
/** A collapsible sub-menu (e.g. Compliance ▸): opens on its first child's page. */
const sub = (label: string, children: NavItem[], icon = children[0]!.icon): NavItem => ({ href: children[0]!.href, label, icon, children });

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
    home: "/dashboard", prefixes: ["/dashboard", "/crm", "/calls", "/inventory", "/reports/crm", "/reports/agents", "/reports/targets", "/reports/lost", "/reports/activity"], layout: "list",
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
          { href: "/reports/crm", label: "Reports", icon: "chart", module: "reports.crm", anyModule: ["crm.targets", "reports.lost", "reports.activity"], also: ["/reports/agents", "/reports/targets", "/reports/lost", "/reports/activity"] },
        ],
      },
    ],
  },
  {
    key: "hr", name: "HR", description: "People, attendance, payroll, requests", icon: "users", tile: "from-violet-500 to-fuchsia-700",
    home: "/hr", prefixes: ["/hr", "/reports/hr", "/settings/hr", "/approvals", "/org-chart"], layout: "modules",
    groups: [
      { label: "Dashboard", icon: "layout", items: [{ href: "/hr", label: "HR dashboard", icon: "layout", module: "hr.attendance", anyModule: ["hr.employees"] }] },
      {
        label: "People", icon: "users",
        items: [
          { href: "/profile", label: "Profile", icon: "user" },
          { href: "/org-chart", label: "Hierarchy", icon: "hierarchy", module: "hr.orgchart" },
          { href: "/hr/employees", label: "Employee", icon: "users", module: "hr.employees" },
          { href: "/hr/organization", label: "Organization", icon: "landmark", module: "hr.employees" },
          { href: "/hr/organization/reporting", label: "Reporting Lines", icon: "hierarchy", module: "hr.employees" },
          { href: "/hr/onboarding", label: "Onboarding", icon: "plus", module: "hr.onboarding" },
          { href: "/hr/assets", label: "Asset", icon: "laptop", module: "hr.assets" },
          { href: "/hr/salary-revisions", label: "Salary Revisions", icon: "trending", module: "hr.payroll" },
          { href: "/hr/leave-encashment", label: "Leave Encashment", icon: "banknote", module: "hr.leave" },
          sub("Compliance", [
            { href: "/hr/policies", label: "Policy Documents", icon: "filecheck", module: "hr.employees" },
            { href: "/hr/policies/planner", label: "Policy Planner", icon: "calendar", module: "hr.employees" },
            { href: "/hr/attendance/shifts", label: "Attendance Policy", icon: "clock", module: "hr.attendance" },
            { href: "/settings/hr?tab=approvals", label: "Request Policy", icon: "check", module: "hr.employees" },
            { href: "/hr/employees?tab=documents", label: "Renewals", icon: "refresh", module: "hr.employees" },
          ], "clipboard"),
          sub("End Of Employment", [
            { href: "/hr/exits", label: "Exits", icon: "doorout", module: "hr.employees" },
            { href: "/hr/exits/interviews", label: "Exit Interviews", icon: "chatplus", module: "hr.exit" },
          ], "doorout"),
          { href: "/reports/hr", label: "Reports", icon: "pie", module: "reports.hr" },
          sub("Settings", [
            { href: "/settings/hr", label: "General", icon: "sliders", module: "hr.employees" },
            { href: "/settings/roles", label: "Privileges", icon: "shield", module: "settings.roles" },
            { href: "/settings/hr", label: "Checklist", icon: "clipboard", module: "hr.employees" },
            { href: "/hr/letters", label: "Letter Management", icon: "mail", module: "hr.employees" },
            { href: "/settings/hr?tab=org", label: "Manage Employee", icon: "usercog", module: "hr.employees" },
            { href: "/hr/policies/manage", label: "Policy Management", icon: "filecheck", module: "hr.employees" },
            { href: "/settings/hr?tab=org", label: "Manage Employments", icon: "briefcase", module: "hr.employees" },
            { href: "/hr/engagement", label: "Employee Engagement", icon: "heart", module: "hr.employees" },
            { href: "/hr/settings/custom-fields", label: "Custom Fields", icon: "list", module: "hr.employees" },
            { href: "/settings/hr-import", label: "Import HR Data", icon: "fileplus", superAdmin: true },
          ], "settings"),
        ],
      },
      {
        label: "Payroll", icon: "wallet",
        items: [
          { href: "/hr/payroll/dashboard", label: "Dashboard", icon: "layout", module: "hr.payroll" },
          { href: "/hr/payroll/checklist", label: "Checklist", icon: "check", module: "hr.payrollchecklist" },
          { href: "/hr/payroll", label: "Payrolls", icon: "wallet", module: "hr.payroll" },
          { href: "/hr/payroll?tab=salaries", label: "Salary Sheet", icon: "sheet", module: "hr.payroll" },
          { href: "/hr/payroll/payslips", label: "Payslips", icon: "receipt", module: "hr.payroll" },
          { href: "/hr/payroll/vouchers", label: "Vouchers", icon: "ticket", module: "hr.payroll" },
          { href: "/hr/payroll/settlements", label: "Final Settlement", icon: "handshake", module: "hr.payroll" },
          sub("Custom Payitems", [
            { href: "/hr/payroll/items/commission", label: "Commission", icon: "plus", module: "hr.payroll" },
            { href: "/hr/payroll/items/late-sittings", label: "No. Of Late Sittings", icon: "plus", module: "hr.payroll" },
          ], "sliders"),
          { href: "/hr/expenses", label: "Balances", icon: "scale", module: "hr.expenses" },
          { href: "/hr/payroll/reports", label: "Reports", icon: "pie", module: "hr.payroll" },
          sub("Settings", [
            { href: "/hr/payroll?tab=settings", label: "General", icon: "sliders", module: "hr.payroll" },
            { href: "/hr/payroll?tab=settings#tax", label: "Tax", icon: "percent", module: "hr.payroll" },
            { href: "/hr/payroll/rewards", label: "Rewards", icon: "award", module: "hr.payroll" },
            { href: "/hr/payroll?tab=settings#components", label: "Pay Component", icon: "puzzle", module: "hr.payroll" },
            { href: "/hr/payroll/account-types", label: "Account Type", icon: "user", module: "hr.payroll" },
            { href: "/hr/payroll/banks", label: "Disbursement Banks", icon: "landmark", module: "hr.payroll" },
          ], "settings"),
        ],
      },
      {
        label: "Attendance", icon: "clock",
        items: [
          { href: "/hr/attendance", label: "Daily attendance", icon: "clock", module: "hr.attendance" },
          { href: "/hr/attendance/schedule", label: "Scheduling", icon: "calendar", module: "hr.attendance" },
          { href: "/hr/attendance/shifts", label: "Shifts", icon: "clock", module: "hr.attendance" },
          { href: "/hr/attendance?view=people", label: "Time Sheet", icon: "sheet", module: "hr.attendance" },
          { href: "/hr/attendance/logs", label: "Attendance Logs", icon: "history", module: "hr.attendance" },
          { href: "/hr/attendance/device-changes", label: "Device Change Approvals", icon: "filecheck", module: "hr.attendance" },
          { href: "/hr/attendance/machines", label: "Attendance Machines", icon: "fingerprint", module: "hr.attendance" },
          { href: "/hr/leave", label: "Leave", icon: "plane", module: "hr.leave" },
          { href: "/hr/leave/planner", label: "Leave Planner", icon: "calendar", module: "hr.leaveplanner" },
          { href: "/hr/attendance/swaps", label: "Shift Swaps", icon: "refresh", module: "hr.shiftswap" },
          sub("Reports", [
            { href: "/hr/attendance/reports/time", label: "Time", icon: "clock", module: "hr.attendance" },
            { href: "/hr/attendance/reports/scheduling", label: "Scheduling", icon: "calendar", module: "hr.attendance" },
            { href: "/hr/leave?tab=balances", label: "Leave", icon: "plane", module: "hr.leave" },
            { href: "/hr/attendance/reports/travel", label: "Travel", icon: "plane", module: "hr.attendance" },
          ], "pie"),
          sub("Settings", [
            { href: "/hr/attendance/shifts", label: "Shifts", icon: "clock", module: "hr.attendance" },
            { href: "/settings/hr?tab=leave", label: "Types", icon: "list", module: "hr.employees" },
            { href: "/settings/hr?tab=shifts", label: "Restrictions", icon: "ban", module: "hr.employees" },
            { href: "/settings/hr?tab=leave", label: "Holidays", icon: "calendar", module: "hr.employees" },
          ], "settings"),
        ],
      },
      {
        label: "Requests", icon: "check",
        items: [
          { href: "/approvals", label: "All requests", icon: "check" },
          sub("General Tickets", [
            { href: "/hr/requests/tickets/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=ticket", label: "Assigned", icon: "filecheck" },
            { href: "/settings/hr?tab=approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "ticket"),
          sub("Punch", [
            { href: "/me/attendance", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=attendance_correction", label: "Approvals", icon: "filecheck" },
          ], "fingerprint"),
          sub("Expense", [
            { href: "/me/expenses", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=expense", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr?tab=approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "receipt"),
          sub("Leave", [
            { href: "/me/leave", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=leave", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr?tab=leave", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "plane"),
          sub("Loans & Advances", [
            { href: "/me/expenses#loans", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=loan", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr?tab=approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "banknote"),
          sub("WFH", [
            { href: "/hr/requests/wfh/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=wfh", label: "Approvals", icon: "filecheck" },
          ], "sofa"),
          sub("Official Duty", [
            { href: "/hr/requests/official-duty/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=official_duty", label: "Approvals", icon: "filecheck" },
          ], "briefcase"),
          sub("Overtime", [
            { href: "/hr/requests/overtime/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=overtime", label: "Approvals", icon: "filecheck" },
          ], "timer"),
          sub("Promotions", [
            { href: "/hr/requests/promotions/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=promotion", label: "Approvals", icon: "filecheck" },
          ], "trending"),
          sub("Relaxation", [
            { href: "/hr/requests/relaxation/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=relaxation", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr?tab=approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "coffee"),
          sub("Transfer", [
            { href: "/hr/requests/transfer/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=transfer", label: "Approvals", icon: "filecheck" },
          ], "refresh"),
          sub("Travel", [
            { href: "/hr/requests/travel/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=travel", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr?tab=approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "plane"),
          sub("Requisition", [
            { href: "/hr/requests/requisition/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=requisition", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr?tab=approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "users"),
          sub("Resignation", [
            { href: "/hr/requests/resignation/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=resignation", label: "Approvals", icon: "filecheck" },
          ], "doorout"),
          sub("Shift Adjustment", [
            { href: "/hr/requests/shift-adjustment/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=shift_adjustment", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr?tab=approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "clock"),
          sub("CPL", [
            { href: "/hr/requests/cpl/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=cpl", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr?tab=approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "calendar"),
          sub("Settings", [{ href: "/settings/hr?tab=approvals", label: "General", icon: "sliders", module: "hr.employees" }], "settings"),
        ],
      },
      {
        label: "Assessment", icon: "trending",
        items: [
          { href: "/hr/performance", label: "Performance", icon: "trending", module: "hr.performance" },
          { href: "/hr/check-ins", label: "Monthly Check-ins", icon: "chatplus", module: "hr.checkins" },
          sub("Probations", [
            { href: "/hr/employees?status=probation", label: "Probationers", icon: "briefcase", module: "hr.employees" },
            { href: "/hr/probation", label: "Probation Evaluation", icon: "filecheck", module: "hr.performance" },
          ], "briefcase"),
          { href: "/hr/performance/reports", label: "Reports", icon: "pie", module: "hr.performance" },
          sub("Settings", [
            { href: "/hr/performance/general", label: "General", icon: "sliders", module: "hr.performance" },
            { href: "/settings/hr", label: "Probation", icon: "chatplus", module: "hr.employees" },
            { href: "/hr/performance/settings", label: "Performance", icon: "gauge", module: "hr.performance" },
          ], "settings"),
        ],
      },
      { label: "Recruitment", icon: "briefcase", items: [{ href: "/hr/recruitment", label: "Recruitment", icon: "briefcase", module: "hr.recruitment" }] },
      {
        label: "Reports", icon: "pie",
        items: [
          { href: "/reports/hr", label: "All Reports", icon: "pie", module: "reports.hr" },
          sub("Generate Reports", [
            { href: "/reports/hr/employees", label: "Employee Reports", icon: "file", module: "reports.hr" },
            { href: "/reports/hr/probation", label: "Employee Probation Reports", icon: "file", module: "reports.hr" },
            { href: "/hr/leave?tab=balances", label: "Leave Reports", icon: "file", module: "hr.leave" },
            { href: "/reports/hr/travel", label: "Travel Reports", icon: "file", module: "reports.hr" },
            { href: "/reports/hr/expenses", label: "Expense Reports", icon: "file", module: "reports.hr" },
            { href: "/reports/hr/loans", label: "Loan & Advances Reports", icon: "file", module: "reports.hr" },
            { href: "/hr/attendance?view=month", label: "Attendance Reports", icon: "file", module: "hr.attendance" },
            { href: "/reports/hr/payroll", label: "Payroll Reports", icon: "file", module: "reports.hr" },
          ], "fileplus"),
        ],
      },
      {
        label: "System Settings", icon: "settings",
        items: [
          { href: "/settings/hr", label: "General", icon: "sliders", module: "hr.employees" },
          { href: "/settings/roles", label: "Access Controls", icon: "shield", module: "settings.roles" },
          { href: "/hr/settings/email-verification", label: "Email Verification", icon: "mail", module: "settings.company" },
          { href: "/hr/attendance/machines", label: "Machine", icon: "fingerprint", module: "hr.attendance" },
          { href: "/settings/integrations#email", label: "Mail Logs", icon: "mail", module: "settings.company" },
          { href: "/settings/integrations", label: "Integrations", icon: "plug", module: "settings.company" },
          sub("Customization", [
            { href: "/hr/settings/custom-fields", label: "Custom Fields", icon: "list", module: "settings.company" },
            { href: "/hr/settings/dashboard", label: "Dashboard", icon: "layout", module: "settings.company" },
          ], "sliders"),
          sub("Templates", [
            { href: "/hr/settings/notification-templates", label: "Notification", icon: "bell", module: "settings.company" },
          ], "layout"),
        ],
      },
    ],
  },
  {
    key: "me", name: "My Space", description: "Your profile, attendance, leave and payslips", icon: "user", tile: "from-emerald-500 to-teal-700",
    home: "/me/home", prefixes: ["/me", "/feed", "/org-chart"], layout: "list",
    groups: [
      {
        // Five entries; requests and profile pages are tabs (lib/sections.ts).
        items: [
          { href: "/me/home", label: "Home", icon: "home" },
          { href: "/me/attendance", label: "Attendance", icon: "fingerprint" },
          { href: "/me/leave", label: "Requests", icon: "palm", also: ["/me/expenses", "/me/swaps", "/hr/requests", "/approvals"] },
          { href: "/me/payslips", label: "Payslips", icon: "banknote" },
          { href: "/feed", label: "Feed", icon: "award", also: ["/org-chart"] },
          { href: "/me", label: "My profile", icon: "user", also: ["/me/performance", "/me/check-ins", "/me/exit-interview", "/me/policies", "/me/surveys"] },
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
          { href: "/settings/health", label: "System health", icon: "gauge", superAdmin: true },
          { href: "/settings/backup", label: "Backup", icon: "archive", superAdmin: true },
          { href: "/settings/hr-import", label: "Import HR data", icon: "clipboard", superAdmin: true },
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
  // Stay in the app you came from when this page is in its menu, sub-menus included (HR → Leave → Request opens
  // /me/leave but keeps the HR menu).
  if (last?.groups.some((g) => g.items.some((i) => [i, ...(i.children ?? [])].some((c) => pathOf(c.href) === pathname || c.also?.includes(pathname))))) return last;
  return appForPath(apps, pathname);
}

/** data-sidebar value on the page shell; globals.css turns it into the sidebar width (--sb-w). */
export function sidebarMode(layout: AppDef["layout"], rail: boolean) {
  return layout === "modules" ? (rail ? "modules-collapsed" : "modules") : rail ? "collapsed" : "open";
}
