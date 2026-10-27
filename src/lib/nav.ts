// Apps and their menus. After login people pick an app on /home (Odoo-style); each app has its own sidebar.
// An item shows only if the user can `view` its module (no module = everyone); an app with no items is hidden.
// `phase` marks modules not built yet — they render a "coming soon" page.

export type NavItem = {
  href: string; label: string; icon: string; module?: string; phase?: number; superAdmin?: boolean;
  /** Permission action needed on `module` (default "view"), e.g. "create" for supervisor-only pages. */
  action?: "view" | "create" | "edit" | "delete" | "export" | "assign" | "approve";
  /** Boss (and Super Admin) only. */ boss?: boolean;
  /** Sub-menu (e.g. Compliance ▸, Settings ▸). The parent's href is its first child's. */
  children?: NavItem[];
};
/** Shorthand for a sub-menu entry. */
const sub = (label: string, children: NavItem[], icon = children[0]!.icon): NavItem => ({ href: children[0]!.href, label, icon, children });
/** A group of items. In a "modules" app (HR) each group is a module: an icon on the rail and its pages in the panel. */
export type NavGroup = { label?: string; icon?: string; items: NavItem[] };

export type AppKey = "crm" | "hr" | "calls" | "me" | "boss" | "settings";
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
    home: "/dashboard", prefixes: ["/dashboard", "/crm", "/inventory", "/reports/crm", "/reports/agents", "/settings/crm"], layout: "modules",
    groups: [
      { label: "Dashboard", icon: "home", items: [{ href: "/dashboard", label: "Dashboard", icon: "home" }] },
      {
        label: "Leads", icon: "target",
        items: [
          { href: "/crm/leads", label: "All leads", icon: "target", module: "crm.leads" },
          { href: "/crm/leads?owner=me", label: "My leads", icon: "user", module: "crm.leads" },
          { href: "/crm/leads?view=board", label: "Kanban board", icon: "layout", module: "crm.leads" },
          { href: "/crm/leads?activity=overdue", label: "Overdue follow-ups", icon: "alarm", module: "crm.leads" },
          { href: "/crm/leads?created=today", label: "New today", icon: "sparkles", module: "crm.leads" },
          { href: "/crm/leads?group=converted", label: "Converted", icon: "check", module: "crm.leads" },
          { href: "/crm/leads?group=junk", label: "Closed / junk", icon: "archive", module: "crm.leads" },
          { href: "/crm/leads/new", label: "Add lead", icon: "plus", module: "crm.leads" },
        ],
      },
      {
        label: "Deals", icon: "handshake",
        items: [
          { href: "/crm/deals", label: "Pipeline", icon: "handshake", module: "crm.deals" },
          { href: "/crm/deals?view=list", label: "Deal list", icon: "list", module: "crm.deals" },
        ],
      },
      {
        label: "Contacts", icon: "contact",
        items: [
          { href: "/crm/contacts", label: "Contacts", icon: "contact", module: "crm.contacts" },
          { href: "/crm/contacts?tab=companies", label: "Companies", icon: "landmark", module: "crm.contacts" },
        ],
      },
      {
        label: "Activities", icon: "calendar",
        items: [
          { href: "/crm/follow-ups", label: "My follow-ups", icon: "phonecall", module: "crm.leads" },
          { href: "/crm/tasks", label: "Tasks & Calendar", icon: "calendar", module: "crm.activities" },
        ],
      },
      {
        label: "Property", icon: "building",
        items: [
          { href: "/inventory", label: "Units", icon: "building", module: "inventory.units" },
          { href: "/inventory?status=available", label: "Available units", icon: "check", module: "inventory.units" },
          { href: "/inventory?tab=projects", label: "Projects", icon: "landmark", module: "inventory.projects" },
        ],
      },
      {
        label: "Insights", icon: "chart",
        items: [
          { href: "/reports/crm", label: "CRM Reports", icon: "chart", module: "reports.crm" },
          { href: "/reports/agents", label: "Agent performance", icon: "gauge", superAdmin: true },
          { href: "/crm/automations", label: "Automations", icon: "workflow", superAdmin: true },
        ],
      },
      {
        label: "Settings", icon: "settings",
        items: [
          { href: "/settings/crm", label: "CRM Settings", icon: "sliders", module: "settings.company" },
          { href: "/settings/integrations", label: "Lead integrations", icon: "plug", module: "settings.company" },
        ],
      },
    ],
  },
  {
    key: "calls", name: "Calls", description: "Calling team: number batches, dialer, callbacks, WhatsApp", icon: "phonecall", tile: "from-emerald-500 to-cyan-700",
    home: "/calls", prefixes: ["/calls"], layout: "modules",
    groups: [
      {
        label: "Dialer", icon: "phonecall",
        items: [
          { href: "/calls", label: "Dialer", icon: "phonecall", module: "calls", action: "edit" },
          { href: "/calls/callbacks", label: "Callbacks", icon: "alarm", module: "calls" },
          { href: "/calls/history", label: "Call history", icon: "history", module: "calls" },
        ],
      },
      {
        label: "Campaigns", icon: "target",
        items: [
          { href: "/calls/campaigns", label: "Campaigns & batches", icon: "target", module: "calls", action: "create" },
          { href: "/calls/dnc", label: "Do-not-call list", icon: "ban", module: "calls", action: "create" },
        ],
      },
      {
        label: "Monitor", icon: "gauge",
        items: [
          { href: "/calls/wallboard", label: "Wallboard", icon: "gauge", module: "calls", action: "create" },
          { href: "/calls/reports", label: "Reports", icon: "chart", module: "calls", action: "create" },
        ],
      },
      { label: "Phone system", icon: "settings", items: [{ href: "/calls/phone-system", label: "Phone system (Issabel)", icon: "settings", superAdmin: true }, { href: "/calls/recordings", label: "Recordings", icon: "lock", superAdmin: true }] },
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
          { href: "/me", label: "Profile", icon: "user" },
          { href: "/hr/employees?tab=org", label: "Hierarchy", icon: "hierarchy", module: "hr.employees" },
          { href: "/hr/employees", label: "Employee", icon: "users", module: "hr.employees" },
          { href: "/hr/organization", label: "Organization", icon: "landmark", module: "hr.employees" },
          { href: "/hr/assets", label: "Asset", icon: "laptop", module: "hr.assets" },
          { href: "/hr/salary-revisions", label: "Salary Revisions", icon: "trending", module: "hr.payroll" },
          { href: "/hr/leave-encashment", label: "Leave Encashment", icon: "banknote", module: "hr.leave" },
          sub("Compliance", [
            { href: "/hr/policies", label: "Policy Documents", icon: "filecheck", module: "hr.employees" },
            { href: "/hr/policies/planner", label: "Policy Planner", icon: "calendar", module: "hr.employees" },
            { href: "/settings/hr#shifts", label: "Attendance Policy", icon: "clock", module: "hr.employees" },
            { href: "/settings/hr#approvals", label: "Request Policy", icon: "check", module: "hr.employees" },
            { href: "/hr/employees?tab=documents", label: "Renewals", icon: "refresh", module: "hr.employees" },
          ], "clipboard"),
          { href: "/hr/exits", label: "End Of Employment", icon: "doorout", module: "hr.employees" },
          { href: "/reports/hr", label: "Reports", icon: "pie", module: "reports.hr" },
          sub("Settings", [
            { href: "/settings/hr", label: "General", icon: "sliders", module: "hr.employees" },
            { href: "/settings/roles", label: "Privileges", icon: "shield", module: "settings.roles" },
            { href: "/settings/hr#checklists", label: "Checklist", icon: "clipboard", module: "hr.employees" },
            { href: "/hr/letters", label: "Letter Management", icon: "mail", module: "hr.employees" },
            { href: "/settings/hr#departments", label: "Manage Employee", icon: "usercog", module: "hr.employees" },
            { href: "/hr/policies/manage", label: "Policy Management", icon: "filecheck", module: "hr.employees" },
            { href: "/settings/hr#designations", label: "Manage Employments", icon: "briefcase", module: "hr.employees" },
            { href: "/hr/engagement", label: "Employee Engagement", icon: "heart", module: "hr.employees" },
          ], "settings"),
        ],
      },
      {
        label: "Payroll", icon: "wallet",
        items: [
          { href: "/hr/payroll/dashboard", label: "Dashboard", icon: "layout", module: "hr.payroll" },
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
          { href: "/hr/attendance?view=month", label: "Time Sheet", icon: "sheet", module: "hr.attendance" },
          { href: "/hr/attendance/logs", label: "Attendance Logs", icon: "history", module: "hr.attendance" },
          { href: "/hr/attendance/device-changes", label: "Device Change Approvals", icon: "filecheck", module: "hr.attendance" },
          { href: "/hr/leave", label: "Leave", icon: "plane", module: "hr.leave" },
          sub("Reports", [
            { href: "/hr/attendance/reports/time", label: "Time", icon: "clock", module: "hr.attendance" },
            { href: "/hr/attendance/reports/scheduling", label: "Scheduling", icon: "calendar", module: "hr.attendance" },
            { href: "/hr/leave?tab=balances", label: "Leave", icon: "plane", module: "hr.leave" },
            { href: "/hr/attendance/reports/travel", label: "Travel", icon: "plane", module: "hr.attendance" },
          ], "pie"),
          sub("Settings", [
            { href: "/settings/hr#shifts", label: "General", icon: "sliders", module: "hr.employees" },
            { href: "/settings/hr#leave-types", label: "Types", icon: "list", module: "hr.employees" },
            { href: "/settings/hr#geofence", label: "Restrictions", icon: "ban", module: "hr.employees" },
            { href: "/settings/hr#holidays", label: "Holidays", icon: "calendar", module: "hr.employees" },
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
            { href: "/settings/hr#approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "ticket"),
          sub("Punch", [
            { href: "/me/attendance", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=attendance_correction", label: "Approvals", icon: "filecheck" },
          ], "fingerprint"),
          sub("Expense", [
            { href: "/me/expenses", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=expense", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr#approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "receipt"),
          sub("Leave", [
            { href: "/me/leave", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=leave", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr#leave-types", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "plane"),
          sub("Loans & Advances", [
            { href: "/me/expenses#loans", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=loan", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr#approvals", label: "Settings", icon: "settings", module: "hr.employees" },
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
            { href: "/settings/hr#approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "coffee"),
          sub("Transfer", [
            { href: "/hr/requests/transfer/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=transfer", label: "Approvals", icon: "filecheck" },
          ], "refresh"),
          sub("Travel", [
            { href: "/hr/requests/travel/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=travel", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr#approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "plane"),
          sub("Requisition", [
            { href: "/hr/requests/requisition/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=requisition", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr#approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "users"),
          sub("Resignation", [
            { href: "/hr/requests/resignation/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=resignation", label: "Approvals", icon: "filecheck" },
          ], "doorout"),
          sub("Shift Adjustment", [
            { href: "/hr/requests/shift-adjustment/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=shift_adjustment", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr#approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "clock"),
          sub("CPL", [
            { href: "/hr/requests/cpl/new", label: "Request", icon: "chatplus" },
            { href: "/approvals?type=cpl", label: "Approvals", icon: "filecheck" },
            { href: "/settings/hr#approvals", label: "Settings", icon: "settings", module: "hr.employees" },
          ], "calendar"),
          sub("Settings", [{ href: "/settings/hr#approvals", label: "General", icon: "sliders", module: "hr.employees" }], "settings"),
        ],
      },
      {
        label: "Assessment", icon: "trending",
        items: [
          { href: "/hr/performance", label: "Performance", icon: "trending", module: "hr.performance" },
          sub("Probations", [
            { href: "/hr/employees?status=probation", label: "Probationers", icon: "briefcase", module: "hr.employees" },
            { href: "/hr/probation", label: "Probation Evaluation", icon: "filecheck", module: "hr.performance" },
          ], "briefcase"),
          { href: "/hr/performance/reports", label: "Reports", icon: "pie", module: "hr.performance" },
          sub("Settings", [
            { href: "/hr/performance/general", label: "General", icon: "sliders", module: "hr.performance" },
            { href: "/settings/hr#checklists", label: "Probation", icon: "chatplus", module: "hr.employees" },
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
          { href: "/hr/attendance?import=1", label: "Machine", icon: "fingerprint", module: "hr.attendance" },
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
    home: "/me/home", prefixes: ["/me"], layout: "list",
    groups: [
      {
        items: [
          { href: "/me/home", label: "Home", icon: "home" },
          { href: "/me", label: "My Profile", icon: "user" },
          { href: "/me/attendance", label: "My Attendance", icon: "fingerprint" },
          { href: "/me/leave", label: "My Leave", icon: "palm" },
          { href: "/me/payslips", label: "My Payslips", icon: "banknote" },
          { href: "/me/expenses", label: "My Expenses & Loans", icon: "card" },
          { href: "/me/performance", label: "My Performance", icon: "award" },
          { href: "/me/policies", label: "My Policies", icon: "filecheck" },
          { href: "/me/surveys", label: "Surveys", icon: "heart" },
          { href: "/hr/requests", label: "New request", icon: "chatplus" },
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

/** data-sidebar value on the page shell; globals.css turns it into the sidebar width (--sb-w). */
export function sidebarMode(layout: AppDef["layout"], rail: boolean) {
  return layout === "modules" ? (rail ? "modules-collapsed" : "modules") : rail ? "collapsed" : "open";
}
