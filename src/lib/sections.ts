// Section tabs: a few big menu entries per app, and the screens inside each section as tabs across the top of the
// page (so moving between, say, leads, follow-ups and tasks never leaves the Leads section). Client-safe.
import type { Action } from "./rbac";

export type SectionTab = {
  href: string; label: string;
  module?: string; action?: Action; superAdmin?: boolean;
  /** Calling supervisors and Super Admins only (lib/calls isCallSupervisor). */
  callSupervisor?: boolean;
  /** Query values this tab requires (null = must be absent); tabs on the same path are told apart by these. */
  params?: Record<string, string | null>;
  /** Pages under this path (e.g. /hr/attendance/logs/machine) keep this section's tabs, with this tab active. */
  nested?: boolean;
};
/** `app`: only in that app (e.g. My Space tabs don't show on HR's Approvals page). */
export type Section = { key: string; app?: string; tabs: SectionTab[] };

export const SECTIONS: Section[] = [
  {
    key: "leads",
    tabs: [
      { href: "/crm/leads", label: "All leads", module: "crm.leads", params: { owner: null, group: null } },
      { href: "/crm/focus", label: "Focus", module: "crm.leads" },
      { href: "/crm/matches", label: "Matches", module: "crm.matches" },
      { href: "/crm/visits", label: "Site visits", module: "crm.visits" },
      { href: "/crm/duplicates", label: "Duplicates", module: "crm.merge" },
      { href: "/crm/templates", label: "Templates", module: "crm.templates", action: "create" },
      { href: "/crm/leads?owner=me", label: "My leads", module: "crm.leads", params: { owner: "me", group: null } },
      { href: "/crm/follow-ups", label: "Follow-ups", module: "crm.leads" },
      { href: "/crm/tasks", label: "Tasks & calendar", module: "crm.activities" },
      { href: "/crm/leads?group=converted", label: "Converted", module: "crm.leads", params: { group: "converted" } },
      { href: "/crm/leads?group=junk", label: "Closed", module: "crm.leads", params: { group: "junk" } },
    ],
  },
  {
    key: "deals",
    tabs: [
      { href: "/crm/deals", label: "Closed deals", module: "crm.deals", params: { show: null } },
      { href: "/crm/deals?show=all", label: "All deals", module: "crm.deals", params: { show: "all" } },
    ],
  },
  {
    key: "calls",
    tabs: [
      { href: "/calls?dial=1", label: "Dialer", module: "calls", action: "edit" },
      { href: "/calls/callbacks", label: "Callbacks", module: "calls" },
      { href: "/calls/history", label: "History", module: "calls" },
      { href: "/calls/templates", label: "Templates", module: "calls" },
      { href: "/calls/campaigns", label: "Campaigns", module: "calls", callSupervisor: true },
      { href: "/calls/dnc", label: "Do-not-call", module: "calls", callSupervisor: true },
      { href: "/calls/wallboard", label: "Wallboard", module: "calls", callSupervisor: true },
      { href: "/calls/reports", label: "Reports", module: "calls", callSupervisor: true },
      { href: "/calls/recordings", label: "Recordings", superAdmin: true },
      { href: "/calls/phone-system", label: "Phone system", superAdmin: true },
    ],
  },
  {
    key: "contacts",
    tabs: [
      { href: "/crm/contacts", label: "Contacts", module: "crm.contacts", params: { tab: null } },
      { href: "/crm/contacts?tab=companies", label: "Companies", module: "crm.contacts", params: { tab: "companies" } },
    ],
  },
  {
    key: "inventory",
    tabs: [
      { href: "/inventory", label: "Units", module: "inventory.units", params: { tab: null, status: null } },
      { href: "/inventory?status=available", label: "Available units", module: "inventory.units", params: { tab: null, status: "available" } },
      { href: "/inventory?tab=projects", label: "Projects", module: "inventory.projects", params: { tab: "projects" } },
      { href: "/inventory?tab=developers", label: "Developers", module: "inventory.units", params: { tab: "developers" } },
      { href: "/inventory?tab=areas", label: "Areas", module: "inventory.units", params: { tab: "areas" } },
    ],
  },
  // My Space
  {
    key: "my-requests", app: "me",
    tabs: [
      { href: "/me/leave", label: "Leave" },
      { href: "/me/expenses", label: "Expenses & loans" },
      { href: "/me/swaps", label: "Shift swaps" },
      { href: "/hr/requests", label: "New request" },
      { href: "/approvals?tab=mine", label: "My requests", params: { tab: "mine" } },
    ],
  },
  {
    key: "my-documents", app: "me",
    tabs: [
      { href: "/me/documents", label: "Documents & letters" },
      { href: "/me/policies", label: "Policies" },
    ],
  },
  {
    key: "my-profile", app: "me",
    tabs: [
      { href: "/me", label: "Profile" },
      { href: "/me/performance", label: "Performance" },
      { href: "/me/check-ins", label: "Check-ins" },
      { href: "/me/surveys", label: "Surveys" },
    ],
  },
  // HR
  {
    key: "people",
    tabs: [
      { href: "/hr/employees", label: "Employees", module: "hr.employees" },
      { href: "/hr/organization", label: "Organization", module: "hr.employees" },
      { href: "/hr/organization/reporting", label: "Reporting lines", module: "hr.employees" },
      { href: "/hr/onboarding", label: "Onboarding", module: "hr.onboarding" },
      { href: "/hr/exits", label: "Exits", module: "hr.employees" },
      { href: "/hr/exits/interviews", label: "Exit interviews", module: "hr.exit" },
    ],
  },
  {
    key: "attendance",
    tabs: [
      { href: "/hr/attendance", label: "Daily & monthly", module: "hr.attendance" },
      { href: "/hr/attendance/schedule", label: "Scheduling", module: "hr.attendance" },
      { href: "/hr/attendance/shifts", label: "Shifts", module: "hr.attendance" },
      { href: "/hr/attendance/logs", label: "Logs", module: "hr.attendance", nested: true },
      { href: "/hr/attendance/machines", label: "Machines", module: "hr.attendance", nested: true },
      { href: "/hr/attendance/device-changes", label: "Device approvals", module: "hr.attendance" },
      { href: "/hr/attendance/swaps", label: "Shift swaps", module: "hr.shiftswap" },
      { href: "/hr/attendance/reports/time", label: "Reports", module: "hr.attendance" },
    ],
  },
  {
    key: "leave",
    tabs: [
      { href: "/hr/leave", label: "Leave", module: "hr.leave" },
      { href: "/hr/leave/planner", label: "Planner", module: "hr.leaveplanner" },
      { href: "/hr/leave-encashment", label: "Encashment", module: "hr.leave" },
    ],
  },
  {
    key: "payroll",
    tabs: [
      { href: "/hr/payroll", label: "Payroll", module: "hr.payroll" },
      { href: "/hr/payroll/checklist", label: "Checklist", module: "hr.payrollchecklist" },
      { href: "/hr/payroll/payslips", label: "Payslips", module: "hr.payroll" },
      { href: "/hr/salary-revisions", label: "Salary revisions", module: "hr.payroll" },
      { href: "/hr/expenses", label: "Loans & expenses", module: "hr.expenses" },
      { href: "/hr/payroll/settlements", label: "Final settlement", module: "hr.payroll" },
      { href: "/hr/payroll/items/commission", label: "Commission", module: "hr.payroll" },
      { href: "/hr/payroll/rewards", label: "Rewards", module: "hr.payroll" },
      { href: "/hr/payroll/reports", label: "Reports", module: "hr.payroll" },
    ],
  },
  {
    key: "reports",
    tabs: [
      { href: "/reports/crm", label: "CRM reports", module: "reports.crm" },
      { href: "/reports/targets", label: "Targets", module: "crm.targets" },
      { href: "/reports/lost", label: "Lost reasons", module: "reports.lost" },
      { href: "/reports/activity", label: "Activity feed", module: "reports.activity" },
      { href: "/reports/agents", label: "Agent performance", superAdmin: true },
    ],
  },
];

const pathOf = (href: string) => href.split("?")[0]!;

/** The section whose tabs include this exact page path (detail pages such as a single lead show no tabs). */
export const sectionForPath = (path: string, app?: string) => SECTIONS.find((s) => (!s.app || s.app === app) && s.tabs.some((t) => pathOf(t.href) === path));

/** Which tab is active for a path and query: same path, and every required query value matches. */
export function activeTab(tabs: SectionTab[], path: string, params: URLSearchParams) {
  return tabs.find((t) => pathOf(t.href) === path && Object.entries(t.params ?? {}).every(([k, v]) => (v === null ? !params.get(k) : params.get(k) === v)))
    ?? tabs.find((t) => t.nested && path.startsWith(`${pathOf(t.href)}/`));
}
/** A page under a `nested` tab's path (e.g. a machine's mapping page). */
export const underNestedTab = (t: SectionTab, path: string) => !!t.nested && path.startsWith(`${pathOf(t.href)}/`);
