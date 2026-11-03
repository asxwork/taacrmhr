// Tutorials (Help page): how to do everything in AMS, in plain steps. `chapter` links a topic to its part of the
// full video tour (public/tutorials/chapters.json). Client-safe.

export type Tutorial = {
  key: string;
  group: "Getting started" | "CRM" | "Calls" | "HR" | "My Space" | "Admin";
  title: string;
  who: string;
  summary: string;
  steps: string[];
  tips?: string[];
  /** Where to try it. */
  href?: string;
  /** Video chapter key, if the full tour covers it. */
  chapter?: string;
};

export const TUTORIAL_GROUPS = ["Getting started", "CRM", "Calls", "HR", "My Space", "Admin"] as const;

export const TUTORIALS: Tutorial[] = [
  // ── Getting started
  {
    key: "sign-in", group: "Getting started", title: "Signing in", who: "Everyone", chapter: "start",
    summary: "Sign in with your work email. Your role decides which apps and screens you see.",
    steps: [
      "Open AMS and enter your work email and password, then press Sign in.",
      "If two-step login is on for you, type the 6-digit code from your authenticator app.",
      "Pick an app on the home screen (CRM, HR, My Space…). If you only have one app, it opens straight away.",
      "Forgot your password? Ask your administrator to reset it in Settings → Users.",
    ],
    tips: ["Some roles can only sign in during working hours. Outside them you'll see an “Outside working hours” page."],
  },
  {
    key: "find-your-way", group: "Getting started", title: "Finding your way around", who: "Everyone", chapter: "start",
    summary: "Apps, the menu on the left, tabs at the top of each section, and quick search.",
    steps: [
      "The menu on the left lists the sections of the app you're in. In CRM: Home, Leads, Deals, Calls, Contacts & Property, Reports.",
      "Inside a section, the tabs across the top switch between its screens (for example Leads → All leads, My leads, Follow-ups, Tasks & calendar).",
      "Switch apps with the app name at the top of the menu, or go back to the home screen.",
      "Press Ctrl + K (⌘ K on Mac) anywhere to jump to a page or find a lead, deal, contact, unit or employee by name or phone.",
      "Click your name at the bottom of the menu to open My profile; the bell shows notifications.",
    ],
    tips: ["On a phone, the bar at the bottom has the main screens and a Menu button for the rest."],
  },
  {
    key: "my-profile", group: "Getting started", title: "My profile", who: "Everyone", href: "/profile", chapter: "profile",
    summary: "Your personal, employment, salary, documents and leave details — the same profile in every app.",
    steps: [
      "Click your name or photo at the bottom of the menu.",
      "Use the five tabs: Overview, Job & Pay, Documents, Time off & Attendance (and History for HR).",
      "To change something, open “Request a change” — HR approves it before it's saved.",
      "Download profile card gives a printable one-page summary.",
    ],
  },

  // ── CRM
  {
    key: "add-lead", group: "CRM", title: "Adding a lead", who: "Agents, managers", href: "/crm/leads/new", chapter: "leads",
    summary: "Create a lead with the client's name and at least one phone number or email.",
    steps: [
      "Go to Leads and press Create (or use the + on the phone bar).",
      "Enter the client name and phone. Add more numbers or emails with “+ add”.",
      "Choose the source (Facebook, Zameen, walk-in…), what they're interested in, budget and location.",
      "Pick who is responsible (managers can assign to their team), then Save.",
      "If the phone or email already exists, AMS warns you and shows who owns it — tick “save anyway” only if it's really a new enquiry.",
    ],
    tips: ["Leads from Facebook, Zameen and your website arrive automatically and are shared out by rotation."],
  },
  {
    key: "leads-list", group: "CRM", title: "Working the leads list", who: "Agents, managers", href: "/crm/leads", chapter: "leads",
    summary: "Filter, sort and move leads through stages; switch between list and Kanban board.",
    steps: [
      "Use the tabs: All leads, My leads, Follow-ups, Tasks & calendar, Converted, Closed.",
      "Pick a saved filter (Leads in progress, Today's leads, Not contacted 7+ days…) or open the filter panel for source, project, stage, owner and dates.",
      "The counters show Overdue, Today and Nothing planned — click one to see those leads.",
      "Change a lead's stage straight from the list (click the stage) or drag cards on the Kanban board.",
      "Tick leads to reassign, change stage, add a task or run an automation on many at once (if your role allows bulk actions).",
      "Export gives a CSV or an Excel file with all activities; the upload button next to Create imports a file.",
    ],
  },
  {
    key: "lead-page", group: "CRM", title: "Inside a lead: calls, notes and follow-ups", who: "Agents, managers", chapter: "lead-page",
    summary: "Everything about one client: details on the left, the timeline and next steps on the right.",
    steps: [
      "Open a lead from the list. The call and WhatsApp buttons at the top dial straight away.",
      "Log what happened: call, note, WhatsApp, meeting or email from the box on the right.",
      "Always plan the next step (a follow-up with a date) — leads with nothing planned show up in Follow-ups.",
      "Move the lead along with the stage bar. Matching units for the client's budget and area are listed below.",
      "When the client is ready to buy, press Convert to deal: a deal and a contact are created and the history carries over.",
    ],
    tips: ["Leads not worked in time can go On-hold and come back for reassignment (CRM Settings → On-hold rules)."],
  },
  {
    key: "follow-ups", group: "CRM", title: "Follow-ups and tasks", who: "Agents, managers", href: "/crm/follow-ups", chapter: "follow-ups",
    summary: "Your to-do list: overdue calls, today's tasks, leads never contacted and leads with no next step.",
    steps: [
      "Open Leads → Follow-ups. Start with Overdue, then Due today.",
      "“Not contacted” are new leads nobody has called yet; “No follow-up” have no planned next step.",
      "Press “Plan next step” on a row to log the call and set the next date.",
      "Leads → Tasks & calendar shows the same tasks by day or as a calendar.",
    ],
  },
  {
    key: "deals", group: "CRM", title: "Deals and payments", who: "Agents, managers, accounts", href: "/crm/deals", chapter: "deals",
    summary: "Track sales from offer to closing, then installments and payments.",
    steps: [
      "Deals → Pipeline shows deals by stage; drag a card to move it. Deal list shows the same as a table.",
      "Open a deal to see the client, the unit(s), value, commission and the timeline.",
      "Mark Won or Lost (a reason is needed for Lost). Won deals mark their units sold.",
      "Payments: create a payment plan (down payment + installments), then record each payment as it comes in.",
    ],
  },
  {
    key: "contacts-property", group: "CRM", title: "Contacts, companies and property", who: "Agents, managers", href: "/crm/contacts", chapter: "property",
    summary: "Clients and companies, plus your projects and units with photos and prices.",
    steps: [
      "Contacts & Property → Contacts / Companies lists your clients; each has their deals and history.",
      "Units lists every listing with status (available, on hold, sold). Filter by project, type and price.",
      "Projects holds blocks, photos and payment plans for each project.",
      "Open a unit to add photos, change the price or start a deal for it.",
    ],
  },
  {
    key: "crm-reports", group: "CRM", title: "CRM reports", who: "Managers, Boss", href: "/reports/crm", chapter: "reports",
    summary: "Leads by source and stage, conversion, agent leaderboard and won value.",
    steps: [
      "Open Reports. Pick the date range and branch at the top.",
      "Charts show leads by source and stage; the leaderboard ranks agents by calls, conversions and won deals.",
      "Super Admins also get Agent performance with each agent's calls per day and follow-up discipline.",
      "Export any report to a spreadsheet.",
    ],
  },

  // ── Calls
  {
    key: "dialer", group: "Calls", title: "Calling from the dialer (CSR)", who: "Calling team", href: "/calls", chapter: "calls",
    summary: "Your numbers come one by one: call, pick what happened, and the next number loads.",
    steps: [
      "Open Calls → Dialer. Numbers come in order: due callbacks, new numbers, then unanswered ones after a few hours.",
      "Press Call (through your extension if the phone system is connected) or WhatsApp to send the campaign message.",
      "Pick the outcome: Interested, Call back, Not interested, Not answered, Busy, Wrong number…",
      "For Call back choose the date and time; for Interested tick “Send to the CRM” so a sales agent gets the lead.",
      "Press Save & next number.",
    ],
    tips: ["Callbacks and History tabs show your planned callbacks and every call you made."],
  },
  {
    key: "campaigns", group: "Calls", title: "Campaigns, batches and the wallboard", who: "Calling supervisors", href: "/calls/campaigns", chapter: "calls",
    summary: "Upload numbers, split them into batches for agents, and watch the team live.",
    steps: [
      "Calls → Campaigns → New campaign: name, script and WhatsApp message.",
      "Paste numbers or upload a CSV (a phone column, optionally name and other columns). Duplicates and do-not-call numbers are skipped.",
      "Make batches: choose the agents and how many numbers each batch has.",
      "Wallboard shows each agent live (ready, ringing, on a call) and today's numbers; Reports shows totals by agent and outcome.",
      "Do-not-call keeps numbers that must never be called again.",
    ],
  },
  {
    key: "softphone", group: "Calls", title: "Phone system and recordings", who: "Super Admin", href: "/calls/phone-system", chapter: "calls",
    summary: "Connect agents' Issabel extensions so they call from AMS, with recordings for permitted people only.",
    steps: [
      "Calls → Phone system: enter the WebRTC (WSS) address of your Issabel PBX.",
      "Give each agent their extension number and SIP password (stored encrypted).",
      "Agents then see a phone panel at the bottom right of the Calls screens: call, answer, hold, mute, transfer.",
      "Answered calls are recorded and kept for the retention period; only people with “Listen to recordings” can play them, and every play is logged.",
    ],
  },

  // ── HR
  {
    key: "hr-dashboard", group: "HR", title: "HR dashboard", who: "HR, managers", href: "/hr", chapter: "hr",
    summary: "Today's attendance, pending approvals, birthdays, headcount and month-wise absents at a glance.",
    steps: [
      "Open HR. The tiles show who is present, late, absent or on leave today — click a tile to see the people.",
      "Charts show this month's attendance and absents for the last 12 months.",
      "Use the dashboard settings to show or hide widgets.",
    ],
  },
  {
    key: "employees", group: "HR", title: "Employees and profiles", who: "HR", href: "/hr/employees", chapter: "hr",
    summary: "Add employees, keep their full profile, documents and history up to date.",
    steps: [
      "HR → People → New employee: name, joining date, department, designation, branch and salary.",
      "Open an employee: the profile has five tabs — Overview, Job & Pay, Documents, Time off & Attendance, History.",
      "Upload documents (CNIC, contract…) on the Documents tab; expiring documents are flagged.",
      "Role / transfer records promotions and moves with an effective date; Exit starts the leaving process.",
      "Create a login for the employee so they can check in, apply for leave and see payslips.",
    ],
  },
  {
    key: "attendance", group: "HR", title: "Attendance and the machine", who: "HR", href: "/hr/attendance", chapter: "attendance",
    summary: "Daily attendance, the monthly register, corrections and the attendance machine.",
    steps: [
      "HR → Attendance shows today: present, late, absent, on leave. Switch to Monthly register for the whole month (50 people per page).",
      "Click a day in the register to correct it; every change is logged in Attendance logs.",
      "Attendance → Machines: connect a ZKTeco machine by IP (port 4370) or Cloud Server, or import the USB file.",
      "Set each employee's device user ID so machine punches match the right person.",
    ],
  },
  {
    key: "leave", group: "HR", title: "Leave", who: "HR, managers", href: "/hr/leave", chapter: "leave",
    summary: "Leave requests, approvals, balances and encashment.",
    steps: [
      "Employees apply from My Space → My Leave; the request goes to their line manager, then HR.",
      "Approve or reject from Approvals. Approved leave shows on attendance automatically.",
      "Balances show entitlement, carry forward, used and available per leave type; the Encashment tab pays out unused annual leave.",
    ],
  },
  {
    key: "approvals", group: "HR", title: "Approvals inbox", who: "Managers, HR", href: "/approvals", chapter: "leave",
    summary: "One place for every request waiting for you: leave, corrections, expenses, profile changes, promotions…",
    steps: [
      "Open Approvals → Waiting for me.",
      "Open a request to see the details and its approval steps, then Approve or Reject (with a comment).",
      "My requests shows what you've sent and where it is.",
    ],
  },
  {
    key: "payroll", group: "HR", title: "Running payroll", who: "Payroll / accounts", href: "/hr/payroll", chapter: "payroll",
    summary: "Monthly salaries with attendance, leave, tax, loans, expenses and commission worked out for you.",
    steps: [
      "HR → Payroll → pick the month and press Create & calculate.",
      "Check the salary sheet: unpaid leave, absents, tax, loans, expenses, rewards and commission are already applied.",
      "Approve the run; payslips appear in each employee's My Space.",
      "The Payroll tabs also hold Payslips, Salary revisions (increments with approval), Loans & expenses and Final settlement.",
    ],
    tips: ["“Do Not Use in Payroll” on an employee's salary tab leaves them out of runs."],
  },

  // ── My Space
  {
    key: "check-in", group: "My Space", title: "Checking in and out", who: "Every employee", href: "/me/attendance", chapter: "myspace",
    summary: "Mark your attendance from your phone or computer, and fix mistakes.",
    steps: [
      "Open My Space → My Attendance and press Check in when you arrive and Check out when you leave.",
      "Allow location if asked — it shows whether you were at the office.",
      "Forgot to punch? Request a correction for that day; your manager approves it.",
    ],
  },
  {
    key: "my-leave", group: "My Space", title: "Leave, requests and payslips", who: "Every employee", href: "/me/leave", chapter: "myspace",
    summary: "Apply for leave, raise requests (WFH, overtime, expenses…) and download payslips.",
    steps: [
      "My Leave: choose the type and dates and submit; you'll be notified when it's approved.",
      "New request: work from home, official duty, overtime, travel, general tickets and more.",
      "My Payslips: open or print each month's payslip.",
      "My Requests shows everything you've asked for and its status.",
    ],
  },

  // ── Admin
  {
    key: "users-roles", group: "Admin", title: "Users and roles", who: "Super Admin, admins", href: "/settings/users", chapter: "admin",
    summary: "Who can sign in, and what each role can see and do.",
    steps: [
      "Settings → Users → New user: name, email, branch, who they report to, roles and a starting password.",
      "Settings → Roles & Permissions: open a role and set each module's access — Read, Add, Edit, Delete, Export, Approve, Reassign, Import, Bulk actions, Move back/reopen, Listen to recordings.",
      "Scopes: Own items, their Team (everyone reporting to them), their Branch, or All.",
      "Changes apply on the person's next page load.",
    ],
  },
  {
    key: "access-exceptions", group: "Admin", title: "Access exceptions for one person", who: "Super Admin, admins", chapter: "admin",
    summary: "Give someone a bit more or less than their role without making a new role.",
    steps: [
      "Settings → Users → open the person → Access exceptions.",
      "Each cell starts on “Role: …” (what their roles give). Pick a different level to override just that permission.",
      "Save. The users list shows a badge on people with exceptions.",
    ],
  },
  {
    key: "field-rules", group: "Admin", title: "Field rules: hide or mask sensitive data", who: "Super Admin, admins", chapter: "admin",
    summary: "Hide or mask fields such as lead phone numbers, deal values, salary, CNIC and bank details per role.",
    steps: [
      "Settings → Roles & Permissions → open a role → Field rules.",
      "Choose Full access, See but can't change, Masked (0300•••4567) or Hidden for each field.",
      "Masked lead phones can still be called and messaged from AMS — the number just never shows.",
      "People always see their own profile in full.",
    ],
  },
  {
    key: "sign-in-hours", group: "Admin", title: "Sign-in hours, two-step login and auto sign-out", who: "Super Admin", href: "/settings/security", chapter: "admin",
    summary: "Control when people can use AMS and how they sign in.",
    steps: [
      "Roles & Permissions → a role → Sign-in hours: set the days and times that role may use AMS.",
      "My profile → Two-step login: set up Google or Microsoft Authenticator for yourself first.",
      "Settings → Security: require two-step login for Super Admins or everyone, and sign people out after some idle minutes.",
    ],
  },
  {
    key: "view-as", group: "Admin", title: "View as another user", who: "Super Admin", chapter: "admin",
    summary: "See AMS exactly as someone else does to check their access — read-only.",
    steps: [
      "Settings → Users → open the person → View as.",
      "A yellow bar shows you're viewing as them; nothing can be saved while it's on.",
      "Press Exit on the bar to go back to your own account. Every View as is in the audit log.",
    ],
  },
  {
    key: "features", group: "Admin", title: "Turning features on and off", who: "Super Admin, admins", href: "/settings/features", chapter: "admin",
    summary: "Hide whole features your company doesn't use (calls, inventory, payroll, recruitment…).",
    steps: [
      "Settings → Features and switch off what you don't use.",
      "It disappears from everyone's menus; its data is kept and comes back when you switch it on.",
    ],
  },
  {
    key: "layouts", group: "Admin", title: "Layouts, company settings and the audit log", who: "Super Admin", href: "/settings/layouts", chapter: "admin",
    summary: "Arrange menus per role, set company details, and see who changed what.",
    steps: [
      "Settings → Layouts: per app and role, hide menu items, reorder sections and set the start page.",
      "Settings → Company & Branches, CRM Settings (stages, sources, on-hold rules) and HR Settings (shifts, leave types, approvals).",
      "Settings → Audit Log lists every important change with who and when.",
      "Company & Branches → Sample data loads or removes demo data for training.",
    ],
  },
];
