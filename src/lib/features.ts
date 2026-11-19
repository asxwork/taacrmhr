// Company-wide feature switches (Settings → Features). A switched-off feature disappears from every menu and its
// pages show a notice instead; its data is kept, so switching it back on restores everything.
import { db } from "./db";
import { memo } from "./memo";

/**
 * Every switch belongs to an app. `app-*` keys are the master switch for a whole app (all its pages and menus);
 * the rest switch one feature inside it. Every new app or feature gets an entry here (Settings → Apps & features).
 */
export const APP_SWITCHES = [
  { app: "crm", label: "CRM", about: "Leads, deals, contacts, calls, inventory and CRM reports" },
  { app: "hr", label: "HR", about: "Employees, attendance, leave, payroll and HR reports" },
  { app: "finance", label: "Finance", about: "Wallets, expenses, bills, P&L and the boss's finance view" },
  { app: "invoices", label: "Invoices", about: "Invoices with approval and e-signatures (links already sent to clients keep working)" },
  { app: "chat", label: "Messenger", about: "Chat between colleagues (the chat icon disappears too)" },
  { app: "boss", label: "Boss dashboard", about: "The owner's overview of sales, HR and money" },
] as const;
export type AppSwitch = (typeof APP_SWITCHES)[number]["app"];

export const FEATURES = [
  // Master switches: switched off, the app leaves the app list and everyone's menus; its data is kept.
  { key: "app-crm", label: "CRM app", group: "CRM", app: "crm", paths: ["/dashboard", "/crm", "/calls", "/inventory", "/reports/crm", "/reports/agents", "/reports/targets", "/reports/lost", "/reports/activity", "/settings/crm", "/settings/bitrix-import"], about: "" },
  { key: "app-hr", label: "HR app", group: "HR", app: "hr", paths: ["/hr", "/reports/hr", "/settings/hr", "/approvals"], about: "" },
  { key: "app-finance", label: "Finance app", group: "Finance", app: "finance", paths: ["/finance"], about: "" },
  { key: "app-invoices", label: "Invoices app", group: "Invoices", app: "invoices", paths: ["/invoices"], about: "" },
  { key: "app-chat", label: "Messenger", group: "Messenger", app: "chat", paths: ["/chat"], about: "" },
  { key: "app-boss", label: "Boss dashboard", group: "Boss dashboard", app: "boss", paths: ["/boss"], about: "" },
  { key: "calls", label: "Calls (calling centre)", group: "CRM", app: "crm", paths: ["/calls"], about: "Dialer, campaigns, callbacks, wallboard, softphone" },
  { key: "inventory", label: "Property inventory", group: "CRM", app: "crm", paths: ["/inventory"], about: "Projects, units and listings" },
  { key: "targets", label: "Targets & leaderboard", group: "CRM", app: "crm", paths: ["/reports/targets"], about: "Monthly calls, visits and deals goals per agent" },
  { key: "matches", label: "Property-match alerts", group: "CRM", app: "crm", paths: ["/crm/matches"], about: "Tell agents when a new or freed-up unit fits their leads" },
  { key: "summary", label: "Morning summary", group: "CRM", app: "crm", paths: [], about: "A daily 'your day' notification for every agent" },
  { key: "templates", label: "Message templates", group: "CRM", app: "crm", paths: ["/crm/templates"], about: "Ready-made WhatsApp and email messages on every lead" },
  { key: "visits", label: "Site-visit check-ins", group: "CRM", app: "crm", paths: ["/crm/visits"], about: "Agents check in with phone GPS at site visits" },
  { key: "merge", label: "Duplicate merge", group: "CRM", app: "crm", paths: ["/crm/duplicates"], about: "Find leads with the same phone and merge them" },
  { key: "lostreasons", label: "Lost-reason analysis", group: "CRM", app: "crm", paths: ["/reports/lost"], about: "Why deals and leads are lost, by source and agent" },
  { key: "activityfeed", label: "Person activity feed", group: "CRM", app: "crm", paths: ["/reports/activity"], about: "Everything one person did, day by day" },
  { key: "weekly", label: "Boss weekly email", group: "CRM", app: "crm", paths: [], about: "Monday email with last week's sales and HR numbers" },
  { key: "holdexpiry", label: "Unit hold expiry", group: "CRM", app: "crm", paths: [], about: "Units put on hold by hand become available again after a set number of days" },
  { key: "automations", label: "Lead automations", group: "CRM", app: "crm", paths: ["/crm/automations"], about: "Rules that act on leads in bulk" },
  { key: "payroll", label: "Payroll", group: "HR", app: "hr", paths: ["/hr/payroll", "/payslips", "/hr/salary-revisions", "/hr/leave-encashment", "/me/payslips"], about: "Payroll runs, payslips, salary revisions, encashment" },
  { key: "expenses", label: "Expenses & loans", group: "HR", app: "hr", paths: ["/hr/expenses", "/me/expenses"], about: "Expense claims, advances and loans" },
  { key: "recruitment", label: "Recruitment", group: "HR", app: "hr", paths: ["/hr/recruitment"], about: "Job openings and candidates" },
  { key: "performance", label: "Performance & probation", group: "HR", app: "hr", paths: ["/hr/performance", "/hr/probation", "/me/performance"], about: "Appraisals, KPIs, probation reviews" },
  { key: "assets", label: "Assets", group: "HR", app: "hr", paths: ["/hr/assets"], about: "Company assets given to staff" },
  { key: "policies", label: "Policies", group: "HR", app: "hr", paths: ["/hr/policies", "/me/policies"], about: "Policy documents and acknowledgements" },
  { key: "letters", label: "Letters", group: "HR", app: "hr", paths: ["/hr/letters"], about: "Offer, experience and other letters" },
  { key: "onboarding", label: "Onboarding links", group: "HR", app: "hr", paths: ["/hr/onboarding", "/onboard"], about: "New hires fill in their own details from a link" },
  { key: "leaveplanner", label: "Leave planner", group: "HR", app: "hr", paths: ["/hr/leave/planner"], about: "Team leave calendar with clash warnings" },
  { key: "shiftswap", label: "Shift swaps", group: "HR", app: "hr", paths: ["/hr/attendance/swaps", "/me/swaps"], about: "Staff swap shifts with a colleague, manager approves" },
  { key: "payrollchecklist", label: "Payroll checklist", group: "HR", app: "hr", paths: ["/hr/payroll/checklist"], about: "Step-by-step monthly payroll run checklist" },
  { key: "checkins", label: "Monthly check-ins", group: "HR", app: "hr", paths: ["/hr/check-ins", "/me/check-ins"], about: "Monthly 1:1 notes and goals" },
  { key: "feed", label: "Announcements & kudos", group: "HR", app: "hr", paths: ["/feed"], about: "Company announcements and recognition between colleagues" },
  { key: "orgchart", label: "Org chart", group: "HR", app: "hr", paths: ["/org-chart"], about: "Who reports to whom, with photos" },
  { key: "docreminders", label: "Document expiry reminders", group: "HR", app: "hr", paths: [], about: "Remind employees before their CNIC, passport or documents expire" },
  { key: "exitinterviews", label: "Exit interviews", group: "HR", app: "hr", paths: ["/hr/exits/interviews", "/me/exit-interview"], about: "Leavers answer a short exit survey" },
  { key: "breaks", label: "Breaks (Break Out / Back)", group: "HR", app: "hr", paths: [], about: "Staff log breaks; break time comes off worked minutes" },
  { key: "loginalerts", label: "New-device sign-in alerts", group: "HR", app: "hr", paths: [], about: "Tell people (and Super Admins) when their account signs in from a new device" },
  { key: "push", label: "Phone push notifications", group: "HR", app: "hr", paths: [], about: "Notifications on phones and computers even when AMS is closed" },
  { key: "engagement", label: "Engagement surveys", group: "HR", app: "hr", paths: ["/hr/engagement", "/me/surveys"], about: "Staff surveys" },
  // Finance
  { key: "fin-quick", label: "Add expense from phone", group: "Finance", app: "finance", paths: ["/finance/quick"], about: "Quick expense entry with a receipt photo" },
  { key: "fin-approvals", label: "Expense approvals", group: "Finance", app: "finance", paths: ["/finance/approvals"], about: "Big expenses wait for approval" },
  { key: "fin-personal", label: "Sir personal", group: "Finance", app: "finance", paths: ["/finance/personal"], about: "The owner's personal spending, kept apart from the company" },
  { key: "fin-pnl", label: "Profit & loss", group: "Finance", app: "finance", paths: ["/finance/pnl"], about: "Monthly P&L from income and expenses" },
  { key: "fin-forecast", label: "Cash forecast", group: "Finance", app: "finance", paths: ["/finance/forecast"], about: "Money coming in and going out in the next weeks" },
  { key: "fin-marketing", label: "Marketing cost per lead", group: "Finance", app: "finance", paths: ["/finance/marketing"], about: "Ad spend against leads and deals" },
  { key: "fin-holders", label: "Money holders", group: "Finance", app: "finance", paths: ["/finance/holders"], about: "Who holds company cash, top-ups and settling" },
  { key: "fin-cashcount", label: "Cash count", group: "Finance", app: "finance", paths: ["/finance/cash-count"], about: "Count the cash in hand against the books" },
  { key: "fin-claims", label: "Staff claims", group: "Finance", app: "finance", paths: ["/finance/claims"], about: "Staff paid from their pocket and claim it back" },
  { key: "fin-advances", label: "Advances & loans", group: "Finance", app: "finance", paths: ["/finance/advances"], about: "Advances and loans given from finance" },
  { key: "fin-payroll", label: "Payroll link", group: "Finance", app: "finance", paths: ["/finance/payroll"], about: "Pay salaries from a payroll run" },
  { key: "fin-bills", label: "Monthly bills", group: "Finance", app: "finance", paths: ["/finance/bills"], about: "Rent, utilities and other repeating bills with reminders" },
  { key: "fin-vendors", label: "Supplier bills", group: "Finance", app: "finance", paths: ["/finance/vendors", "/finance/payees"], about: "Suppliers, what is owed and payees" },
  { key: "fin-checks", label: "Checks", group: "Finance", app: "finance", paths: ["/finance/checks"], about: "Cheques given and received, due dates" },
  { key: "fin-bank", label: "Bank matching", group: "Finance", app: "finance", paths: ["/finance/bank"], about: "Match the bank statement to entries" },
  { key: "fin-budgets", label: "Budgets", group: "Finance", app: "finance", paths: ["/finance/budgets"], about: "Monthly limits per category with alerts" },
  { key: "fin-import", label: "Import from Excel", group: "Finance", app: "finance", paths: ["/finance/import"], about: "Bring old entries in from a spreadsheet" },
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

/**
 * Who works in the HR app and who uses My Space (Settings → Apps & features). Employees whose HR rights cover only
 * themselves always use My Space. "managers": HR staff and managers get the HR app. "hr": only people with company-wide
 * HR access get it; managers see their team under My Space → My team.
 */
export type HrAccess = "managers" | "hr";
export const HR_ACCESS_SETTING = "hr.access";
export function hrAccess(): Promise<HrAccess> {
  return memo("setting:hrAccess", 60_000, async () => ((await db.setting.findUnique({ where: { key: HR_ACCESS_SETTING } }))?.value === "hr" ? "hr" : "managers"));
}
