// Sidebar structure. An item shows only if the user can `view` its module (no module = everyone).
// `phase` marks modules not built yet — they render a "coming soon" page.

export type NavItem = { href: string; label: string; icon: string; module?: string; phase?: number; superAdmin?: boolean; /** Boss (and Super Admin) only. */ boss?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { items: [{ href: "/boss", label: "Boss dashboard", icon: "crown", boss: true }, { href: "/dashboard", label: "Dashboard", icon: "home" }] },
  {
    label: "CRM",
    items: [
      { href: "/crm/leads", label: "Leads", icon: "target", module: "crm.leads" },
      { href: "/crm/follow-ups", label: "My follow-ups", icon: "phonecall", module: "crm.leads" },
      { href: "/crm/deals", label: "Deals", icon: "handshake", module: "crm.deals" },
      { href: "/crm/contacts", label: "Contacts", icon: "contact", module: "crm.contacts" },
      { href: "/crm/tasks", label: "Tasks & Calendar", icon: "calendar", module: "crm.activities" },
      { href: "/inventory", label: "Inventory", icon: "building", module: "inventory.units" },
      { href: "/reports/crm", label: "CRM Reports", icon: "chart", module: "reports.crm" },
      { href: "/reports/agents", label: "Agent performance", icon: "gauge", superAdmin: true },
      { href: "/crm/automations", label: "Automations", icon: "workflow", superAdmin: true },
    ],
  },
  {
    label: "HR",
    items: [
      { href: "/hr/employees", label: "Employees", icon: "users", module: "hr.employees" },
      { href: "/hr/attendance", label: "Attendance", icon: "clock", module: "hr.attendance" },
      { href: "/hr/leave", label: "Leave", icon: "plane", module: "hr.leave" },
      { href: "/hr/payroll", label: "Payroll", icon: "wallet", module: "hr.payroll" },
      { href: "/hr/recruitment", label: "Recruitment", icon: "briefcase", module: "hr.recruitment" },
      { href: "/hr/performance", label: "Performance", icon: "trending", module: "hr.performance" },
      { href: "/hr/expenses", label: "Expenses & Loans", icon: "receipt", module: "hr.expenses" },
      { href: "/hr/assets", label: "Assets", icon: "laptop", module: "hr.assets" },
      { href: "/reports/hr", label: "HR Reports", icon: "pie", module: "reports.hr" },
    ],
  },
  {
    label: "Me",
    items: [
      { href: "/me", label: "My Profile", icon: "user" },
      { href: "/approvals", label: "Approvals & Requests", icon: "check" },
      { href: "/me/attendance", label: "My Attendance", icon: "fingerprint" },
      { href: "/me/leave", label: "My Leave", icon: "palm" },
      { href: "/me/payslips", label: "My Payslips", icon: "banknote" },
      { href: "/me/expenses", label: "My Expenses & Loans", icon: "card" },
      { href: "/me/performance", label: "My Performance", icon: "award" },
    ],
  },
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
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);
