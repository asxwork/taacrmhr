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
  { key: "app-crm", label: "CRM app", group: "CRM", app: "crm", paths: ["/dashboard", "/crm", "/calls", "/inventory", "/reports/crm", "/reports/agents", "/reports/targets", "/reports/lost", "/reports/activity", "/settings/crm", "/settings/bitrix-import", "/settings/bitrix-sync"], about: "" },
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
  { key: "crm-home", label: "CRM home", group: "CRM", app: "crm", paths: ["/dashboard"], exact: true, about: "The CRM start page with today's numbers" },
  { key: "crm-myday", label: "My day", group: "CRM", app: "crm", paths: ["/crm/my-day"], about: "Each agent's list for today" },
  { key: "crm-followups", label: "Follow-ups", group: "CRM", app: "crm", paths: ["/crm/follow-ups"], about: "Follow-ups due and overdue" },
  { key: "crm-tasks", label: "Tasks & calendar", group: "CRM", app: "crm", paths: ["/crm/tasks"], about: "Tasks and the calendar" },
  { key: "crm-focus", label: "Focus", group: "CRM", app: "crm", paths: ["/crm/focus"], about: "One lead at a time, best first" },
  { key: "crm-deals", label: "Deals", group: "CRM", app: "crm", paths: ["/crm/deals"], about: "Closed deals with their commission form (and older open deals)" },
  { key: "crm-contacts", label: "Contacts & companies", group: "CRM", app: "crm", paths: ["/crm/contacts"], about: "People and companies" },
  { key: "inv-projects", label: "Inventory projects", group: "CRM", app: "crm", paths: ["/inventory/projects", "/inventory?tab=projects"], about: "Projects inside inventory" },
  { key: "inv-developers", label: "Inventory developers", group: "CRM", app: "crm", paths: ["/inventory/developers", "/inventory?tab=developers"], about: "Developers list" },
  { key: "inv-areas", label: "Inventory areas", group: "CRM", app: "crm", paths: ["/inventory/areas", "/inventory?tab=areas"], about: "Areas list" },
  { key: "calls-callbacks", label: "Calls: callbacks", group: "CRM", app: "crm", paths: ["/calls/callbacks"], about: "Calls to return" },
  { key: "calls-templates", label: "Calls: message templates", group: "CRM", app: "crm", paths: ["/calls/templates"], about: "WhatsApp message templates agents pick in the dialer" },
  { key: "calls-history", label: "Calls: history", group: "CRM", app: "crm", paths: ["/calls/history"], about: "Every call made" },
  { key: "calls-recordings", label: "Calls: recordings", group: "CRM", app: "crm", paths: ["/calls/recordings"], about: "Call recordings" },
  { key: "calls-campaigns", label: "Calls: campaigns & batches", group: "CRM", app: "crm", paths: ["/calls/campaigns"], about: "Number lists split into batches per agent" },
  { key: "calls-wallboard", label: "Calls: wallboard", group: "CRM", app: "crm", paths: ["/calls/wallboard"], about: "Live board of agents and batches" },
  { key: "calls-reports", label: "Calls: reports & daily report", group: "CRM", app: "crm", paths: ["/calls/reports"], about: "Call reports and the end-of-shift report" },
  { key: "calls-dnc", label: "Calls: do-not-call list", group: "CRM", app: "crm", paths: ["/calls/dnc"], about: "Numbers never to call" },
  { key: "calls-phone", label: "Calls: phone system", group: "CRM", app: "crm", paths: ["/calls/phone-system"], about: "Softphone / phone line setup" },
  { key: "crm-reports", label: "CRM reports", group: "CRM", app: "crm", paths: ["/reports/crm"], about: "Sales reports" },
  { key: "crm-agents", label: "Agent performance", group: "CRM", app: "crm", paths: ["/reports/agents"], about: "Per-agent results" },
  { key: "crm-automationhub", label: "Automation hub", group: "CRM", app: "crm", paths: ["/crm/automation"], about: "Lead connections and automatic rules" },
  { key: "dev-api", label: "Developer resources (API, webhooks, AI assistant)", group: "CRM", app: "crm", paths: ["/settings/developer"], about: "Inbound and outbound webhooks and the MCP server for AI assistants; switched off, every key stops working" },
  { key: "crm-bitrix", label: "Import from Bitrix", group: "CRM", app: "crm", paths: ["/settings/bitrix-import"], about: "Bring leads in from Bitrix24" },
  { key: "crm-bitrix-backup", label: "Bitrix backup to Google Drive", group: "CRM", app: "crm", paths: [], about: "Daily full copy of all Bitrix24 leads, activities and comments in Google Drive" },
  { key: "crm-bitrix-sync", label: "Bitrix sync", group: "CRM", app: "crm", paths: ["/settings/bitrix-sync"], about: "Keep AMS updated with new and changed Bitrix24 leads automatically" },
  { key: "crm-trash", label: "Leads trash", group: "CRM", app: "crm", paths: ["/crm/leads/trash"], about: "Deleted leads kept 30 days and restorable (deletes still go to the Trash when it's off)" },
  { key: "crm-layouts", label: "CRM layouts", group: "CRM", app: "crm", paths: ["/crm/settings/layouts"], about: "Menus per role" },
  { key: "hr-dashboard", label: "HR dashboard", group: "HR", app: "hr", paths: ["/hr"], exact: true, about: "HR start page with widgets" },
  { key: "hr-employees", label: "Employees", group: "HR", app: "hr", paths: ["/hr/employees"], about: "Employee list and profiles" },
  { key: "hr-organization", label: "Organization & reporting lines", group: "HR", app: "hr", paths: ["/hr/organization"], about: "Departments, heads and who reports to whom" },
  { key: "hr-salaryrev", label: "Salary revisions", group: "HR", app: "hr", paths: ["/hr/salary-revisions"], about: "Increments and promotions" },
  { key: "hr-encashment", label: "Leave encashment", group: "HR", app: "hr", paths: ["/hr/leave-encashment"], about: "Unused leave paid out" },
  { key: "hr-exits", label: "End of employment", group: "HR", app: "hr", paths: ["/hr/exits"], about: "Resignations, exits and settlements" },
  { key: "hr-attendance", label: "Attendance (whole section)", group: "HR", app: "hr", paths: ["/hr/attendance", "/me/attendance"], about: "Daily attendance, check-in and everything under it" },
  { key: "hr-schedule", label: "Scheduling (roster)", group: "HR", app: "hr", paths: ["/hr/attendance/schedule"], about: "Shift roster per day" },
  { key: "hr-shifts", label: "Shifts", group: "HR", app: "hr", paths: ["/hr/attendance/shifts"], about: "Shift timings" },
  { key: "hr-attlogs", label: "Attendance logs", group: "HR", app: "hr", paths: ["/hr/attendance/logs"], about: "Raw punches and changes" },
  { key: "hr-devicechanges", label: "Device change approvals", group: "HR", app: "hr", paths: ["/hr/attendance/device-changes"], about: "Approve check-ins from a new phone" },
  { key: "hr-machines", label: "Attendance machines", group: "HR", app: "hr", paths: ["/hr/attendance/machines"], about: "ZKTeco machines, mapping and fetch" },
  { key: "hr-attreports", label: "Attendance reports", group: "HR", app: "hr", paths: ["/hr/attendance/reports"], about: "Report templates and scheduled emails" },
  { key: "hr-leave", label: "Leave", group: "HR", app: "hr", paths: ["/hr/leave", "/me/leave"], about: "Leave requests and balances" },
  { key: "hr-requests", label: "Other requests (WFH, travel, overtime…)", group: "HR", app: "hr", paths: ["/hr/requests"], about: "WFH, official duty, overtime, travel, tickets and more" },
  { key: "hr-vouchers", label: "Payroll vouchers", group: "HR", app: "hr", paths: ["/hr/payroll/vouchers"], about: "Salary payment vouchers" },
  { key: "hr-settlements", label: "Final settlement", group: "HR", app: "hr", paths: ["/hr/payroll/settlements"], about: "Leaver's last pay" },
  { key: "hr-commission", label: "Commission", group: "HR", app: "hr", paths: ["/hr/payroll/items/commission"], about: "Commission pay items" },
  { key: "hr-latesittings", label: "Late sittings", group: "HR", app: "hr", paths: ["/hr/payroll/items/late-sittings"], about: "Late-sitting pay items" },
  { key: "hr-rewards", label: "Rewards", group: "HR", app: "hr", paths: ["/hr/payroll/rewards"], about: "Bonuses and rewards" },
  { key: "hr-banks", label: "Disbursement banks", group: "HR", app: "hr", paths: ["/hr/payroll/banks", "/hr/payroll/account-types"], about: "Banks and account types for salary transfer" },
  { key: "hr-reports", label: "HR reports", group: "HR", app: "hr", paths: ["/reports/hr"], about: "Employee, travel, expense, loan and payroll reports" },
  { key: "hr-customfields", label: "Custom fields", group: "HR", app: "hr", paths: ["/hr/settings/custom-fields"], about: "Extra fields on employee profiles" },
  { key: "hr-import", label: "Import HR data", group: "HR", app: "hr", paths: ["/settings/hr-import"], about: "Bring employees and attendance in from spreadsheets" },
  { key: "hr-emailverify", label: "Email verification", group: "HR", app: "hr", paths: ["/hr/settings/email-verification"], about: "Check staff email addresses" },
  { key: "hr-notiftemplates", label: "Notification templates", group: "HR", app: "hr", paths: ["/hr/settings/notification-templates"], about: "Wording of HR notifications" },
  { key: "hr-layouts", label: "HR & My Space layouts", group: "HR", app: "hr", paths: ["/hr/settings/layouts", "/hr/settings/dashboard"], about: "Menus and dashboard per role" },
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
  { key: "fin-entries", label: "Entries", group: "Finance", app: "finance", paths: ["/finance/entries"], about: "All money in, out and transfers" },
  { key: "fin-boss", label: "Boss view", group: "Finance", app: "finance", paths: ["/finance/boss"], about: "The owner's finance summary" },
  { key: "fin-categories", label: "Categories", group: "Finance", app: "finance", paths: ["/finance/categories"], about: "Expense and income categories" },
  { key: "fin-layouts", label: "Finance layouts", group: "Finance", app: "finance", paths: ["/finance/layouts"], about: "Menus per role" },
  // Invoices
  { key: "invc-new", label: "New invoices", group: "Invoices", app: "invoices", paths: ["/invoices/new"], about: "Making new invoices (existing ones stay)" },
  { key: "invc-approval", label: "Approval queue", group: "Invoices", app: "invoices", paths: ["/invoices?tab=pending"], about: "Invoices waiting for approval" },
  { key: "invc-overdue", label: "Overdue list", group: "Invoices", app: "invoices", paths: ["/invoices?tab=overdue"], about: "Unpaid invoices past their due date" },
  { key: "invc-repeat", label: "Repeating invoices", group: "Invoices", app: "invoices", paths: ["/invoices?tab=repeat"], about: "Invoices made again every month" },
  { key: "invc-settings", label: "Invoice settings", group: "Invoices", app: "invoices", paths: ["/invoices/settings"], about: "Numbering, bank details and wording" },
  // Messenger
  { key: "chat-groups", label: "Group chats", group: "Messenger", app: "chat", paths: [], about: "Starting new group chats (existing groups stay)" },
  { key: "chat-files", label: "Photos & files in chat", group: "Messenger", app: "chat", paths: [], about: "Sending photos and PDFs" },
  // Boss dashboard
  { key: "boss-crm", label: "CRM report", group: "Boss dashboard", app: "boss", paths: ["/boss?tab=crm"], about: "Detailed sales report tab" },
  { key: "boss-agent", label: "Agent detail", group: "Boss dashboard", app: "boss", paths: ["/boss?tab=agent"], about: "Pick an agent: leads by stage, calls, follow-ups, closed deals and commission" },
  { key: "boss-hr", label: "HR report", group: "Boss dashboard", app: "boss", paths: ["/boss?tab=hr"], about: "Detailed HR report tab" },
  { key: "boss-layouts", label: "Boss layouts", group: "Boss dashboard", app: "boss", paths: ["/boss/layouts"], about: "What the boss dashboard shows" },
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
  const noHash = path.split("#")[0]!;
  const clean = noHash.split("?")[0]!;
  const exact = (f: (typeof FEATURES)[number]) => "exact" in f && f.exact;
  // A path with "?" (a tab, e.g. /invoices?tab=repeat) matches links carrying that query; `exact` features (a page that
  // has other features under it, e.g. /hr) match only that page.
  return FEATURES.find((f) => off.has(f.key) && f.paths.some((p: string) => p.includes("?")
    ? noHash === p || noHash.startsWith(`${p}&`)
    : clean === p || (!exact(f) && clean.startsWith(`${p}/`))));
}

/**
 * Who works in the HR app and who uses My Space (Settings → Apps & features). Employees whose HR rights cover only
 * themselves always use My Space. "hr" (default): only people with company-wide HR access (HR Manager, Administrator,
 * Super Admin) get the HR app; managers see their team under My Space → My team. "managers": managers get it too.
 */
export type HrAccess = "managers" | "hr";
export const HR_ACCESS_SETTING = "hr.access";
export function hrAccess(): Promise<HrAccess> {
  return memo("setting:hrAccess", 60_000, async () => ((await db.setting.findUnique({ where: { key: HR_ACCESS_SETTING } }))?.value === "managers" ? "managers" : "hr"));
}
