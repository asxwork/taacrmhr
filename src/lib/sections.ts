// Section tabs: a few big menu entries per app, and the screens inside each section as tabs across the top of the
// page (so moving between, say, leads, follow-ups and tasks never leaves the Leads section). Client-safe.
import type { Action } from "./rbac";

export type SectionTab = {
  href: string; label: string;
  module?: string; action?: Action; superAdmin?: boolean;
  /** Query values this tab requires (null = must be absent); tabs on the same path are told apart by these. */
  params?: Record<string, string | null>;
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
      { href: "/crm/deals", label: "Pipeline", module: "crm.deals", params: { view: null } },
      { href: "/crm/deals?view=list", label: "Deal list", module: "crm.deals", params: { view: "list" } },
    ],
  },
  {
    key: "calls",
    tabs: [
      { href: "/calls", label: "Dialer", module: "calls", action: "edit" },
      { href: "/calls/callbacks", label: "Callbacks", module: "calls" },
      { href: "/calls/history", label: "History", module: "calls" },
      { href: "/calls/campaigns", label: "Campaigns", module: "calls", action: "create" },
      { href: "/calls/dnc", label: "Do-not-call", module: "calls", action: "create" },
      { href: "/calls/wallboard", label: "Wallboard", module: "calls", action: "create" },
      { href: "/calls/reports", label: "Reports", module: "calls", action: "create" },
      { href: "/calls/recordings", label: "Recordings", module: "calls", action: "listen" },
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
    key: "my-profile", app: "me",
    tabs: [
      { href: "/me", label: "Profile" },
      { href: "/me/performance", label: "Performance" },
      { href: "/me/check-ins", label: "Check-ins" },
      { href: "/me/policies", label: "Policies" },
      { href: "/me/surveys", label: "Surveys" },
    ],
  },
  // HR
  {
    key: "people",
    tabs: [
      { href: "/hr/employees", label: "Employees", module: "hr.employees" },
      { href: "/hr/organization", label: "Organization", module: "hr.employees" },
      { href: "/hr/onboarding", label: "Onboarding", module: "hr.onboarding" },
      { href: "/hr/exits", label: "Exits", module: "hr.employees" },
    ],
  },
  {
    key: "attendance",
    tabs: [
      { href: "/hr/attendance", label: "Daily & monthly", module: "hr.attendance" },
      { href: "/hr/attendance/schedule", label: "Scheduling", module: "hr.attendance" },
      { href: "/hr/attendance/logs", label: "Logs", module: "hr.attendance" },
      { href: "/hr/attendance/machines", label: "Machines", module: "hr.attendance" },
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
      { href: "/reports/agents", label: "Agent performance", superAdmin: true },
    ],
  },
];

const pathOf = (href: string) => href.split("?")[0]!;

/** The section whose tabs include this exact page path (detail pages such as a single lead show no tabs). */
export const sectionForPath = (path: string, app?: string) => SECTIONS.find((s) => (!s.app || s.app === app) && s.tabs.some((t) => pathOf(t.href) === path));

/** Which tab is active for a path and query: same path, and every required query value matches. */
export function activeTab(tabs: SectionTab[], path: string, params: URLSearchParams) {
  return tabs.find((t) => pathOf(t.href) === path && Object.entries(t.params ?? {}).every(([k, v]) => (v === null ? !params.get(k) : params.get(k) === v)));
}
