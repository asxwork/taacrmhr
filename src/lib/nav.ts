// Sidebar structure. An item shows only if the user can `view` its module (no module = everyone).
// `phase` marks modules not built yet — they render a "coming soon" page.

export type NavItem = { href: string; label: string; icon: string; module?: string; phase?: number };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: "home" }] },
  {
    label: "CRM",
    items: [
      { href: "/crm/leads", label: "Leads", icon: "target", module: "crm.leads" },
      { href: "/crm/deals", label: "Deals", icon: "handshake", module: "crm.deals" },
      { href: "/crm/contacts", label: "Contacts", icon: "contact", module: "crm.contacts" },
      { href: "/crm/tasks", label: "Tasks & Calendar", icon: "calendar", module: "crm.activities" },
      { href: "/inventory", label: "Inventory", icon: "building", module: "inventory.units" },
      { href: "/reports/crm", label: "CRM Reports", icon: "chart", module: "reports.crm" },
    ],
  },
  {
    label: "HR",
    items: [
      { href: "/hr/employees", label: "Employees", icon: "users", module: "hr.employees" },
      { href: "/hr/attendance", label: "Attendance", icon: "clock", module: "hr.attendance", phase: 5 },
      { href: "/hr/leave", label: "Leave", icon: "plane", module: "hr.leave", phase: 5 },
      { href: "/hr/payroll", label: "Payroll", icon: "wallet", module: "hr.payroll", phase: 6 },
      { href: "/hr/recruitment", label: "Recruitment", icon: "briefcase", module: "hr.recruitment", phase: 7 },
      { href: "/hr/performance", label: "Performance", icon: "trending", module: "hr.performance", phase: 7 },
      { href: "/hr/expenses", label: "Expenses & Loans", icon: "receipt", module: "hr.expenses", phase: 7 },
      { href: "/hr/assets", label: "Assets", icon: "laptop", module: "hr.assets", phase: 7 },
      { href: "/reports/hr", label: "HR Reports", icon: "chart", module: "reports.hr", phase: 7 },
    ],
  },
  {
    label: "Me",
    items: [
      { href: "/me", label: "My Profile", icon: "user" },
      { href: "/approvals", label: "Approvals & Requests", icon: "check" },
      { href: "/me/attendance", label: "My Attendance", icon: "clock", phase: 5 },
      { href: "/me/leave", label: "My Leave", icon: "plane", phase: 5 },
      { href: "/me/payslips", label: "My Payslips", icon: "wallet", phase: 6 },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings/users", label: "Users", icon: "users", module: "settings.users" },
      { href: "/settings/roles", label: "Roles & Permissions", icon: "shield", module: "settings.roles" },
      { href: "/settings/company", label: "Company & Branches", icon: "settings", module: "settings.company" },
      { href: "/settings/crm", label: "CRM Settings", icon: "sliders", module: "settings.company" },
      { href: "/settings/hr", label: "HR Settings", icon: "briefcase", module: "hr.employees" },
      { href: "/settings/integrations", label: "Integrations", icon: "plug", module: "settings.company" },
      { href: "/settings/audit", label: "Audit Log", icon: "history", module: "settings.audit" },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);
