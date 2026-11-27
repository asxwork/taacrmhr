// Apps and their menus. After login people pick an app on /home (Odoo-style); each app has its own sidebar.
// An item shows only if the user can `view` its module (no module = everyone); an app with no items is hidden.
// `phase` marks modules not built yet — they render a "coming soon" page.

export type NavItem = {
  href: string; label: string; icon: string; module?: string; phase?: number; superAdmin?: boolean;
  /** Permission action needed on `module` (default "view"), e.g. "create" for supervisor-only pages. */
  action?: import("@/lib/rbac").Action;
  /** Boss (and Super Admin) only. */ boss?: boolean;
  /** Calling supervisors and Super Admins only (never the CSR Agent role): see lib/calls isCallSupervisor. */ callSupervisor?: boolean;
  /** Other paths that belong to this entry's section (it stays highlighted there), e.g. Leads → /crm/follow-ups. */
  also?: string[];
  /** Also shown when the user can view any of these modules (a section spanning several modules). */
  anyModule?: string[];
  /** Shown when allowed, but doesn't by itself make the app appear (e.g. Hierarchy, which everyone may see in My Space). */
  ungated?: boolean;
  /** Sub-menu (e.g. Compliance ▸, Settings ▸). The parent's href is its first child's. */
  children?: NavItem[];
};
/** A group of items. In a "modules" app (HR) each group is a module: an icon on the rail and its pages in the panel. */
/** `home`: where the module icon opens, when that differs from its first item (Calls icon → /calls lands Super Admins on Campaigns). */
export type NavGroup = { label?: string; icon?: string; home?: string; items: NavItem[] };
/** A collapsible sub-menu (e.g. Compliance ▸): opens on its first child's page. */
const sub = (label: string, children: NavItem[], icon = children[0]!.icon): NavItem => ({ href: children[0]!.href, label, icon, children });

export type AppKey = "crm" | "hr" | "finance" | "me" | "boss" | "settings" | "learn" | "chat" | "invoices";
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
  /** Pages of other apps its own pages link to (e.g. HR → your own leave form): opening one from this app keeps this menu. */
  keeps?: string[];
  /** "list": one column of items. "modules": icon rail of modules + panel (ResourceInn-style). */
  layout: "list" | "modules";
  groups: NavGroup[];
};

export const APPS: AppDef[] = [
  {
    key: "crm", name: "CRM", description: "Leads, deals, contacts, calls, inventory", icon: "target", tile: "from-sky-500 to-blue-700",
    home: "/dashboard", prefixes: ["/dashboard", "/crm", "/calls", "/inventory", "/reports/crm", "/reports/agents", "/reports/targets", "/reports/lost", "/reports/activity"], layout: "modules",
    keeps: ["/me/attendance"],
    // Like HR: each module is an icon on the rail, its screens (and sub-menus) in the panel.
    groups: [
      { label: "Home", icon: "home", items: [{ href: "/dashboard", label: "CRM home", icon: "home" }] },
      {
        label: "Leads", icon: "target",
        items: [
          { href: "/crm/my-day", label: "My day", icon: "sparkles", module: "crm.leads" },
          { href: "/crm/leads", label: "All leads", icon: "target", module: "crm.leads" },
          { href: "/crm/leads?owner=me", label: "My leads", icon: "user", module: "crm.leads" },
          { href: "/crm/follow-ups", label: "Follow-ups", icon: "alarm", module: "crm.leads" },
          { href: "/crm/tasks", label: "Tasks & calendar", icon: "calendar", module: "crm.activities" },
          { href: "/crm/focus", label: "Focus", icon: "sparkles", module: "crm.leads" },
          { href: "/crm/matches", label: "Matches", icon: "puzzle", module: "crm.matches" },
          { href: "/crm/visits", label: "Site visits", icon: "building", module: "crm.visits" },
          sub("More", [
            { href: "/crm/leads?group=converted", label: "Converted", icon: "check", module: "crm.leads" },
            { href: "/crm/leads?group=junk", label: "Closed", icon: "archive", module: "crm.leads" },
            { href: "/crm/duplicates", label: "Duplicates", icon: "refresh", module: "crm.merge" },
            { href: "/crm/templates", label: "Templates", icon: "file", module: "crm.templates", action: "create" },
          ], "list"),
        ],
      },
      {
        label: "Deals", icon: "handshake",
        items: [
          { href: "/crm/deals", label: "Closed deals", icon: "handshake", module: "crm.deals" },
          { href: "/crm/deals?show=all", label: "All deals", icon: "list", module: "crm.deals" },
          { href: "/crm/commissions", label: "Commissions", icon: "wallet", module: "crm.deals" },
        ],
      },
      {
        label: "Calls", icon: "phonecall", home: "/calls",
        items: [
          // ?dial=1: the Dialer item always opens the dialer, Super Admins included (the Calls icon opens /calls, their Campaigns).
          { href: "/calls?dial=1", label: "Dialer", icon: "phonecall", module: "calls", action: "edit", also: ["/calls"] },
          { href: "/calls/callbacks", label: "Callbacks", icon: "alarm", module: "calls" },
          { href: "/calls/history", label: "History", icon: "history", module: "calls" },
          { href: "/calls/templates", label: "Templates", icon: "chat", module: "calls" },
          { href: "/calls/recordings", label: "Recordings", icon: "file", superAdmin: true },
          sub("Manage", [
            { href: "/calls/campaigns", label: "Campaigns", icon: "target", module: "calls", callSupervisor: true },
            { href: "/calls/wallboard", label: "Wallboard", icon: "gauge", module: "calls", callSupervisor: true },
            { href: "/calls/targets", label: "Targets", icon: "target", module: "calls", callSupervisor: true },
            { href: "/calls/reports", label: "Reports", icon: "chart", module: "calls", callSupervisor: true },
            { href: "/calls/dnc", label: "Do-not-call", icon: "ban", module: "calls", callSupervisor: true },
            { href: "/calls/phone-system", label: "Phone system", icon: "settings", superAdmin: true },
          ], "settings"),
        ],
      },
      {
        label: "Contacts", icon: "contact",
        items: [
          { href: "/crm/contacts", label: "Contacts", icon: "contact", module: "crm.contacts" },
          { href: "/crm/contacts?tab=companies", label: "Companies", icon: "building", module: "crm.contacts", also: ["/crm/companies"] },
        ],
      },
      {
        label: "Inventory", icon: "building",
        items: [
          { href: "/inventory", label: "Units", icon: "building", module: "inventory.units" },
          { href: "/inventory?status=available", label: "Available units", icon: "check", module: "inventory.units" },
          { href: "/inventory?tab=projects", label: "Projects", icon: "landmark", module: "inventory.projects" },
          { href: "/inventory?tab=developers", label: "Developers", icon: "building", module: "inventory.units" },
          { href: "/inventory?tab=areas", label: "Areas", icon: "map", module: "inventory.units" },
        ],
      },
      {
        label: "Reports", icon: "chart",
        items: [
          { href: "/reports/crm", label: "CRM reports", icon: "chart", module: "reports.crm" },
          { href: "/reports/targets", label: "Targets", icon: "target", module: "crm.targets" },
          { href: "/reports/lost", label: "Lost reasons", icon: "ban", module: "reports.lost" },
          { href: "/reports/activity", label: "Activity feed", icon: "history", module: "reports.activity" },
          { href: "/reports/agents", label: "Agent performance", icon: "award", superAdmin: true },
        ],
      },
      {
        label: "Settings", icon: "settings",
        items: [
          sub("CRM settings", [
            { href: "/settings/crm", label: "Lead statuses", icon: "list", module: "settings.company" },
            { href: "/settings/crm#unit-holds", label: "Unit holds", icon: "building", module: "settings.company" },
            { href: "/settings/crm#on-hold-rules", label: "On-hold rules", icon: "timer", module: "settings.company" },
            { href: "/settings/crm#deal-pipelines", label: "Deal pipelines", icon: "handshake", module: "settings.company" },
            { href: "/settings/crm#lead-sources", label: "Lead sources", icon: "target", module: "settings.company" },
          ], "sliders"),
          { href: "/crm/automation", label: "Automation hub", icon: "sparkles", module: "settings.company", action: "edit" },
          { href: "/settings/bitrix-import", label: "Import from Bitrix", icon: "fileplus", superAdmin: true }, { href: "/settings/bitrix-sync", label: "Bitrix sync", icon: "refresh", superAdmin: true },
          { href: "/crm/automations", label: "Bulk actions (reshuffle)", icon: "workflow", superAdmin: true },
          { href: "/crm/settings/layouts", label: "Layouts", icon: "layout", superAdmin: true },
        ],
      },
    ],
  },
  {
    key: "hr", name: "HR", description: "People, attendance, payroll, requests", icon: "users", tile: "from-violet-500 to-fuchsia-700",
    home: "/hr", prefixes: ["/hr", "/reports/hr", "/settings/hr", "/approvals", "/org-chart"], layout: "modules",
    keeps: ["/me/attendance", "/me/leave", "/me/expenses", "/me/swaps", "/me/policies", "/feed", "/settings/company"],
    groups: [
      { label: "Dashboard", icon: "layout", items: [{ href: "/hr", label: "HR dashboard", icon: "layout", module: "hr.attendance", anyModule: ["hr.employees"] }] },
      {
        label: "People", icon: "users",
        items: [
          { href: "/profile", label: "Profile", icon: "user" },
          { href: "/org-chart", label: "Hierarchy", icon: "hierarchy", module: "hr.orgchart", ungated: true },
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
            { href: "/hr/attendance/policy", label: "Attendance Policy", icon: "clock", module: "hr.attendance" },
            { href: "/hr/requests/policy", label: "Request Policy", icon: "check", module: "hr.employees" },
            { href: "/hr/employees?tab=documents", label: "Renewals", icon: "refresh", module: "hr.employees" },
          ], "clipboard"),
          sub("End Of Employment", [
            { href: "/hr/exits", label: "Exits", icon: "doorout", module: "hr.employees" },
            { href: "/hr/exits/interviews", label: "Exit Interviews", icon: "chatplus", module: "hr.exit" },
          ], "doorout"),
          { href: "/reports/hr", label: "Reports", icon: "pie", module: "reports.hr" },
          sub("Settings", [
            { href: "/settings/hr", label: "General", icon: "sliders", module: "hr.employees" },
            { href: "/settings/hr?tab=approvals", label: "Approval Chains", icon: "check", module: "hr.employees" },
            { href: "/settings/roles", label: "Privileges", icon: "shield", module: "settings.roles" },
            { href: "/settings/hr?tab=checklists", label: "Checklist", icon: "clipboard", module: "hr.employees" },
            { href: "/hr/letters", label: "Letter Management", icon: "mail", module: "hr.employees" },
            { href: "/settings/hr?tab=org", label: "Departments & Designations", icon: "usercog", module: "hr.employees" },
            { href: "/hr/policies/manage", label: "Policy Management", icon: "filecheck", module: "hr.employees" },
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
            { href: "/hr/attendance/reports", label: "All attendance reports", icon: "file", module: "hr.attendance" },
            { href: "/hr/attendance/reports/time", label: "Time", icon: "clock", module: "hr.attendance" },
            { href: "/hr/attendance/reports/scheduling", label: "Scheduling", icon: "calendar", module: "hr.attendance" },
            { href: "/hr/leave?tab=balances", label: "Leave", icon: "plane", module: "hr.leave" },
            { href: "/hr/attendance/reports/travel", label: "Travel", icon: "plane", module: "hr.attendance" },
          ], "pie"),
          sub("Settings", [
            { href: "/hr/attendance/shifts", label: "Shifts", icon: "clock", module: "hr.attendance" },
            { href: "/settings/hr?tab=leave", label: "Leave Types", icon: "list", module: "hr.employees" },
            { href: "/hr/attendance/policy", label: "Attendance Policy", icon: "sliders", module: "hr.attendance" },
            { href: "/settings/hr?tab=shifts", label: "Check-in Location", icon: "ban", module: "hr.employees" },
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
            { href: "/hr/attendance/reports", label: "Attendance Reports", icon: "file", module: "hr.attendance" },
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
            { href: "/hr/settings/layouts", label: "Layouts (HR & My Space)", icon: "layout", superAdmin: true },
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
    keeps: ["/hr/requests", "/approvals"],
    groups: [
      {
        // Everything about me; requests and profile pages are tabs (lib/sections.ts).
        items: [
          { href: "/me/home", label: "Home", icon: "home" },
          { href: "/me/attendance", label: "Attendance", icon: "fingerprint" },
          { href: "/me/leave", label: "Requests", icon: "palm", also: ["/me/expenses", "/me/swaps", "/hr/requests", "/approvals"] },
          { href: "/me/payslips", label: "Payslips", icon: "banknote" },
          { href: "/me/documents", label: "Documents", icon: "filecheck", also: ["/me/policies"] },
          { href: "/me/assets", label: "Assets", icon: "laptop" },
          { href: "/feed", label: "Feed", icon: "award" },
          { href: "/org-chart", label: "Hierarchy", icon: "hierarchy", module: "hr.orgchart" },
          { href: "/me", label: "My profile", icon: "user", also: ["/me/performance", "/me/check-ins", "/me/exit-interview", "/me/surveys"] },
        ],
      },
      {
        // Managers who don't use the HR app (Settings → Apps & features → HR app or My Space): their team, here.
        label: "My team",
        items: [
          { href: "/hr/attendance", label: "Team attendance", icon: "clock", module: "hr.attendance" },
          { href: "/hr/leave", label: "Team leave", icon: "plane", module: "hr.leave" },
          { href: "/hr/leave/planner", label: "Leave planner", icon: "calendar", module: "hr.leaveplanner" },
          { href: "/hr/attendance/swaps", label: "Shift swaps", icon: "refresh", module: "hr.shiftswap" },
          { href: "/hr/check-ins", label: "Check-ins", icon: "chatplus", module: "hr.checkins" },
          { href: "/approvals", label: "Approvals", icon: "check", module: "hr.leave", action: "approve" },
        ],
      },
    ],
  },
  {
    key: "finance", name: "Finance", description: "Expenses, petty cash and who paid what", icon: "wallet", tile: "from-emerald-600 to-lime-700",
    home: "/finance", prefixes: ["/finance"], layout: "modules",
    // Like CRM and HR: each area is an icon on the rail, its screens in the panel.
    groups: [
      {
        label: "Home", icon: "chart",
        items: [
          { href: "/finance", label: "Dashboard", icon: "chart", module: "finance" },
          { href: "/finance/quick", label: "Add expense (phone)", icon: "plus", module: "finance", action: "create" },
          { href: "/finance/entries", label: "Entries", icon: "receipt", module: "finance" },
          { href: "/finance/approvals", label: "Approvals", icon: "check", module: "finance", action: "approve" },
        ],
      },
      {
        label: "Boss", icon: "crown",
        items: [
          { href: "/finance/boss", label: "Boss view", icon: "crown", module: "finance.boss" },
          { href: "/finance/personal", label: "Sir personal", icon: "crown", module: "finance.personal" },
        ],
      },
      {
        label: "Reports", icon: "pie",
        items: [
          { href: "/finance/pnl", label: "Profit & loss", icon: "trending", module: "finance.boss" },
          { href: "/finance/forecast", label: "Cash forecast", icon: "chart", module: "finance.boss" },
          { href: "/finance/marketing", label: "Marketing cost per lead", icon: "target", module: "finance.boss" },
        ],
      },
      {
        label: "Cash", icon: "wallet",
        items: [
          { href: "/finance/holders", label: "Money holders", icon: "wallet", module: "finance" },
          { href: "/finance/cards", label: "Cards", icon: "card", module: "finance" },
          { href: "/finance/cash-count", label: "Cash count", icon: "check", module: "finance" },
          { href: "/finance/claims", label: "Staff claims", icon: "receipt", module: "finance" },
          { href: "/finance/advances", label: "Advances & loans", icon: "card", module: "finance" },
          { href: "/finance/payroll", label: "Payroll link", icon: "banknote", module: "finance" },
        ],
      },
      {
        label: "Bills", icon: "file",
        items: [
          { href: "/finance/bills", label: "Monthly bills", icon: "calendar", module: "finance" },
          { href: "/finance/vendors", label: "Supplier bills", icon: "file", module: "finance" },
          { href: "/finance/payees", label: "Payees", icon: "users", module: "finance" },
        ],
      },
      {
        label: "Control", icon: "shield",
        items: [
          { href: "/finance/checks", label: "Checks", icon: "shield", module: "finance" },
          { href: "/finance/bank", label: "Bank matching", icon: "landmark", module: "finance" },
          { href: "/finance/budgets", label: "Budgets", icon: "gauge", module: "finance.settings" },
        ],
      },
      {
        label: "Setup", icon: "settings",
        items: [
          { href: "/finance/settings", label: "Settings", icon: "settings", module: "finance.settings", action: "edit" },
          { href: "/finance/categories", label: "Categories", icon: "list", module: "finance.settings", action: "edit" },
          { href: "/finance/import", label: "Import Excel", icon: "sheet", module: "finance", action: "import" },
          { href: "/finance/layouts", label: "Layouts", icon: "layout", superAdmin: true },
        ],
      },
    ],
  },
  {
    key: "invoices", name: "Invoices", description: "Invoices with approval, e-signatures and payment reminders", icon: "receipt", tile: "from-indigo-500 to-blue-800",
    home: "/invoices", prefixes: ["/invoices"], layout: "list",
    groups: [{ items: [
      { href: "/invoices", label: "All invoices", icon: "receipt", module: "invoices" },
      { href: "/invoices/new", label: "New invoice", icon: "plus", module: "invoices", action: "create" },
      { href: "/invoices?tab=pending", label: "Waiting for approval", icon: "check", module: "invoices" },
      { href: "/invoices?tab=overdue", label: "Overdue", icon: "alarm", module: "invoices" },
      { href: "/invoices?tab=repeat", label: "Repeating", icon: "refresh", module: "invoices" },
      { href: "/invoices/settings", label: "Settings", icon: "settings", module: "invoices", action: "approve" },
    ] }],
  },
  {
    key: "chat", name: "Messenger", description: "Chat with colleagues, one-to-one or in groups", icon: "chat", tile: "from-cyan-500 to-sky-700",
    home: "/chat", prefixes: ["/chat"], layout: "list",
    groups: [{ items: [{ href: "/chat", label: "Messages", icon: "chat", module: "chat" }] }],
  },
  {
    key: "boss", name: "Boss dashboard", description: "The whole business at a glance", icon: "crown", tile: "from-amber-400 to-orange-600",
    home: "/boss", prefixes: ["/boss"], layout: "list",
    groups: [{ items: [{ href: "/boss", label: "Boss dashboard", icon: "crown", boss: true }, { href: "/finance/boss", label: "Finance", icon: "wallet", module: "finance.boss" }, { href: "/boss/layouts", label: "Layouts", icon: "layout", superAdmin: true }] }],
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
          { href: "/help?g=finance", label: "Finance", icon: "wallet", module: "finance" },
          { href: "/help?g=me", label: "My Space", icon: "user" },
          { href: "/help?g=admin", label: "Admin", icon: "usercog", module: "settings.users", anyModule: ["settings.roles", "settings.company"] },
        ],
      },
    ],
  },
  {
    key: "settings", name: "Settings", description: "Users, roles, company, integrations", icon: "usercog", tile: "from-slate-500 to-slate-800",
    home: "/settings", prefixes: ["/settings"], layout: "modules",
    // Like CRM and HR: each area is an icon on the rail, its screens (and sub-menus) in the panel.
    groups: [
      {
        label: "Access", icon: "shield",
        items: [
          { href: "/settings/users", label: "Users", icon: "usercog", module: "settings.users" },
          { href: "/settings/roles", label: "Roles & Permissions", icon: "shield", module: "settings.roles" },
          { href: "/settings/security", label: "Security", icon: "lock", superAdmin: true },
        ],
      },
      {
        label: "Company", icon: "landmark",
        items: [
          { href: "/settings/company", label: "Company & Branches", icon: "landmark", module: "settings.company" },
          { href: "/settings/features", label: "Apps & features", icon: "sliders", module: "settings.company" },
          sub("Integrations", [
            { href: "/settings/integrations", label: "Overview", icon: "plug", module: "settings.company" },
            { href: "/settings/integrations#outgoing-email", label: "Outgoing email", icon: "mail", module: "settings.company" },
            { href: "/settings/integrations#who-gets-new-leads", label: "Who gets new leads", icon: "users", module: "settings.company" },
            { href: "/settings/integrations#api-connections", label: "API connections", icon: "plug", module: "settings.company" },
            { href: "/settings/integrations#website-form", label: "Website form", icon: "file", module: "settings.company" },
            { href: "/settings/integrations#facebook-instagram-lead-ads", label: "Facebook & Instagram", icon: "target", module: "settings.company" },
          ], "plug"),
        ],
      },
      {
        label: "CRM", icon: "target",
        items: [
          sub("CRM settings", [
            { href: "/settings/crm", label: "Lead statuses", icon: "list", module: "settings.company" },
            { href: "/settings/crm#unit-holds", label: "Unit holds", icon: "building", module: "settings.company" },
            { href: "/settings/crm#on-hold-rules", label: "On-hold rules", icon: "timer", module: "settings.company" },
            { href: "/settings/crm#deal-pipelines", label: "Deal pipelines", icon: "handshake", module: "settings.company" },
            { href: "/settings/crm#lead-sources", label: "Lead sources", icon: "target", module: "settings.company" },
          ], "sliders"),
          { href: "/crm/automation", label: "Automation hub", icon: "sparkles", module: "settings.company", action: "edit" },
          { href: "/settings/bitrix-import", label: "Import from Bitrix", icon: "fileplus", superAdmin: true }, { href: "/settings/bitrix-sync", label: "Bitrix sync", icon: "refresh", superAdmin: true },
          { href: "/crm/automations", label: "Bulk actions (reshuffle)", icon: "workflow", superAdmin: true },
        ],
      },
      {
        label: "HR", icon: "users",
        items: [
          sub("HR settings", [
            { href: "/settings/hr", label: "General", icon: "clipboard", module: "hr.employees" },
            { href: "/settings/hr?tab=org", label: "Departments & designations", icon: "hierarchy", module: "hr.employees" },
            { href: "/settings/hr?tab=shifts", label: "Check-in location", icon: "fingerprint", module: "hr.employees" },
            { href: "/settings/hr?tab=leave", label: "Leave & holidays", icon: "plane", module: "hr.employees" },
            { href: "/settings/hr?tab=approvals", label: "Approvals", icon: "check", module: "hr.employees" },
          ], "clipboard"),
          { href: "/settings/hr-import", label: "Import HR data", icon: "sheet", superAdmin: true },
        ],
      },
      {
        label: "Finance", icon: "wallet",
        items: [
          sub("Finance settings", [
            { href: "/finance/settings", label: "Receipt reading", icon: "receipt", module: "finance.settings", action: "edit" },
            { href: "/finance/settings#proof", label: "Proof (bills & receipts)", icon: "file", module: "finance.settings", action: "edit" },
            { href: "/finance/settings#approvals", label: "Approval for big expenses", icon: "check", module: "finance.settings", action: "edit" },
            { href: "/finance/settings#alerts", label: "Alerts for the owner", icon: "bell", module: "finance.settings", action: "edit" },
            { href: "/finance/settings#close-month", label: "Close a month", icon: "lock", module: "finance.settings", action: "edit" },
          ], "settings"),
          { href: "/finance/categories", label: "Categories", icon: "list", module: "finance.settings", action: "edit" },
          { href: "/finance/holders", label: "Money holders", icon: "wallet", module: "finance" },
          { href: "/finance/cards", label: "Cards", icon: "card", module: "finance" },
        ],
      },
      {
        label: "Layouts", icon: "layout",
        items: [
          { href: "/settings/layouts", label: "All layouts", icon: "layout", superAdmin: true },
          { href: "/settings/layouts?app=home", label: "Start page & app tiles", icon: "apps", superAdmin: true },
          { href: "/settings/layouts?app=settings", label: "Settings app", icon: "settings", superAdmin: true },
        ],
      },
      {
        label: "System", icon: "gauge",
        items: [
          { href: "/settings/audit", label: "Activity Log", icon: "history", module: "settings.audit" },
          { href: "/settings/health", label: "System health", icon: "gauge", superAdmin: true },
          { href: "/settings/backup", label: "Backup", icon: "archive", superAdmin: true },
          { href: "/settings/developer", label: "Developer resources", icon: "plug", module: "settings.company" },
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
export function appForPathFrom<T extends Pick<AppDef, "key" | "prefixes" | "groups" | "keeps">>(apps: T[], pathname: string, lastKey?: string): T | null {
  const last = apps.find((a) => a.key === lastKey);
  const pathOf = (h: string) => h.split(/[?#]/)[0]!;
  const under = (p: string) => p !== "/" && (pathname === p || pathname.startsWith(p + "/"));
  // Stay in the app you came from when this page (or a page under it) is in its menu, sub-menus included, or one
  // it keeps (HR → Leave → Request opens /me/leave but keeps the HR menu; My Space → New request keeps My Space).
  if (last && (last.keeps?.some(under) || last.groups.some((g) => g.items.some((i) => [i, ...(i.children ?? [])].some((c) => under(pathOf(c.href)) || c.also?.some(under)))))) return last;
  return appForPath(apps, pathname);
}

/** data-sidebar value on the page shell; globals.css turns it into the sidebar width (--sb-w). */
export function sidebarMode(layout: AppDef["layout"], rail: boolean) {
  return layout === "modules" ? (rail ? "modules-collapsed" : "modules") : rail ? "collapsed" : "open";
}
