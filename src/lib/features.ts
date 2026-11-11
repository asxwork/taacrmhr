// Company-wide feature switches (Settings → Features). A switched-off feature disappears from every menu and its
// pages show a notice instead; its data is kept, so switching it back on restores everything.
import { db } from "./db";
import { memo } from "./memo";

export const FEATURES = [
  { key: "calls", label: "Calls (calling centre)", group: "CRM", paths: ["/calls"], about: "Dialer, campaigns, callbacks, wallboard, softphone" },
  { key: "inventory", label: "Property inventory", group: "CRM", paths: ["/inventory"], about: "Projects, units and listings" },
  { key: "targets", label: "Targets & leaderboard", group: "CRM", paths: ["/reports/targets"], about: "Monthly calls, visits and deals goals per agent" },
  { key: "matches", label: "Property-match alerts", group: "CRM", paths: ["/crm/matches"], about: "Tell agents when a new or freed-up unit fits their leads" },
  { key: "summary", label: "Morning summary", group: "CRM", paths: [], about: "A daily 'your day' notification for every agent" },
  { key: "templates", label: "Message templates", group: "CRM", paths: ["/crm/templates"], about: "Ready-made WhatsApp and email messages on every lead" },
  { key: "visits", label: "Site-visit check-ins", group: "CRM", paths: ["/crm/visits"], about: "Agents check in with phone GPS at site visits" },
  { key: "merge", label: "Duplicate merge", group: "CRM", paths: ["/crm/duplicates"], about: "Find leads with the same phone and merge them" },
  { key: "lostreasons", label: "Lost-reason analysis", group: "CRM", paths: ["/reports/lost"], about: "Why deals and leads are lost, by source and agent" },
  { key: "activityfeed", label: "Person activity feed", group: "CRM", paths: ["/reports/activity"], about: "Everything one person did, day by day" },
  { key: "weekly", label: "Boss weekly email", group: "CRM", paths: [], about: "Monday email with last week's sales and HR numbers" },
  { key: "holdexpiry", label: "Unit hold expiry", group: "CRM", paths: [], about: "Units put on hold by hand become available again after a set number of days" },
  { key: "automations", label: "Lead automations", group: "CRM", paths: ["/crm/automations"], about: "Rules that act on leads in bulk" },
  { key: "payroll", label: "Payroll", group: "HR", paths: ["/hr/payroll", "/payslips", "/hr/salary-revisions", "/hr/leave-encashment", "/me/payslips"], about: "Payroll runs, payslips, salary revisions, encashment" },
  { key: "expenses", label: "Expenses & loans", group: "HR", paths: ["/hr/expenses", "/me/expenses"], about: "Expense claims, advances and loans" },
  { key: "recruitment", label: "Recruitment", group: "HR", paths: ["/hr/recruitment"], about: "Job openings and candidates" },
  { key: "performance", label: "Performance & probation", group: "HR", paths: ["/hr/performance", "/hr/probation", "/me/performance"], about: "Appraisals, KPIs, probation reviews" },
  { key: "assets", label: "Assets", group: "HR", paths: ["/hr/assets"], about: "Company assets given to staff" },
  { key: "policies", label: "Policies", group: "HR", paths: ["/hr/policies", "/me/policies"], about: "Policy documents and acknowledgements" },
  { key: "letters", label: "Letters", group: "HR", paths: ["/hr/letters"], about: "Offer, experience and other letters" },
  { key: "onboarding", label: "Onboarding links", group: "HR", paths: ["/hr/onboarding", "/onboard"], about: "New hires fill in their own details from a link" },
  { key: "leaveplanner", label: "Leave planner", group: "HR", paths: ["/hr/leave/planner"], about: "Team leave calendar with clash warnings" },
  { key: "shiftswap", label: "Shift swaps", group: "HR", paths: ["/hr/attendance/swaps", "/me/swaps"], about: "Staff swap shifts with a colleague, manager approves" },
  { key: "payrollchecklist", label: "Payroll checklist", group: "HR", paths: ["/hr/payroll/checklist"], about: "Step-by-step monthly payroll run checklist" },
  { key: "checkins", label: "Monthly check-ins", group: "HR", paths: ["/hr/check-ins", "/me/check-ins"], about: "Monthly 1:1 notes and goals" },
  { key: "feed", label: "Announcements & kudos", group: "HR", paths: ["/feed"], about: "Company announcements and recognition between colleagues" },
  { key: "orgchart", label: "Org chart", group: "HR", paths: ["/org-chart"], about: "Who reports to whom, with photos" },
  { key: "docreminders", label: "Document expiry reminders", group: "HR", paths: [], about: "Remind employees before their CNIC, passport or documents expire" },
  { key: "exitinterviews", label: "Exit interviews", group: "HR", paths: ["/hr/exits/interviews", "/me/exit-interview"], about: "Leavers answer a short exit survey" },
  { key: "loginalerts", label: "New-device sign-in alerts", group: "HR", paths: [], about: "Tell people (and Super Admins) when their account signs in from a new device" },
  { key: "push", label: "Phone push notifications", group: "HR", paths: [], about: "Notifications on phones and computers even when AMS is closed" },
  { key: "engagement", label: "Engagement surveys", group: "HR", paths: ["/hr/engagement", "/me/surveys"], about: "Staff surveys" },
] as const;
export type FeatureKey = (typeof FEATURES)[number]["key"];

export const FEATURES_SETTING = "features.off";

export function disabledFeatures(): Promise<Set<string>> {
  return memo("setting:featuresOff", 60_000, async () => {
    const row = await db.setting.findUnique({ where: { key: FEATURES_SETTING } });
    try { return new Set<string>(row ? JSON.parse(row.value) : []); } catch { return new Set<string>(); }
  });
}

/** The switched-off feature a path belongs to, if any. */
export function featureForPath(path: string, off: Set<string>) {
  const clean = path.split("?")[0]!.split("#")[0]!;
  return FEATURES.find((f) => off.has(f.key) && f.paths.some((p) => clean === p || clean.startsWith(`${p}/`)));
}
