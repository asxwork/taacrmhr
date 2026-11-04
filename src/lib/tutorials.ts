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
  /** Who sees this tutorial: people who can view `module` (with `action`), or Super Admins only. None = everyone. */
  module?: string; action?: import("./rbac").Action; superAdmin?: boolean;
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
      "The menu on the left lists the sections of the app you're in. In CRM: Home, Leads, Deals, Calls, Contacts, Inventory, Reports.",
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
    key: "add-lead", group: "CRM", module: "crm.leads", title: "Adding a lead", who: "Agents, managers", href: "/crm/leads/new", chapter: "leads",
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
    key: "leads-list", group: "CRM", module: "crm.leads", title: "Working the leads list", who: "Agents, managers", href: "/crm/leads", chapter: "leads",
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
    key: "lead-page", group: "CRM", module: "crm.leads", title: "Inside a lead: calls, notes and follow-ups", who: "Agents, managers", chapter: "lead-page",
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
    key: "follow-ups", group: "CRM", module: "crm.leads", title: "Follow-ups and tasks", who: "Agents, managers", href: "/crm/follow-ups", chapter: "follow-ups",
    summary: "Your to-do list: overdue calls, today's tasks, leads never contacted and leads with no next step.",
    steps: [
      "Open Leads → Follow-ups. Start with Overdue, then Due today.",
      "“Not contacted” are new leads nobody has called yet; “No follow-up” have no planned next step.",
      "Press “Plan next step” on a row to log the call and set the next date.",
      "Leads → Tasks & calendar shows the same tasks by day or as a calendar.",
    ],
  },
  {
    key: "deals", group: "CRM", module: "crm.deals", title: "Deals and payments", who: "Agents, managers, accounts", href: "/crm/deals", chapter: "deals",
    summary: "Track sales from offer to closing, then installments and payments.",
    steps: [
      "Deals → Pipeline shows deals by stage; drag a card to move it. Deal list shows the same as a table.",
      "Open a deal to see the client, the unit(s), value, commission and the timeline.",
      "Mark Won or Lost (a reason is needed for Lost). Won deals mark their units sold.",
      "Payments: create a payment plan (down payment + installments), then record each payment as it comes in.",
    ],
  },
  {
    key: "contacts", group: "CRM", module: "crm.contacts", title: "Contacts and companies", who: "Agents, managers", href: "/crm/contacts", chapter: "property",
    summary: "Your clients and their companies, each with their deals and history.",
    steps: [
      "Contacts in the menu opens your client list; the Companies tab lists the firms they belong to.",
      "Search by name or phone; open a contact to see their leads, deals and history.",
      "New contact adds someone who isn't a lead yet (e.g. a buyer met at a site).",
    ],
  },
  {
    key: "inventory", group: "CRM", module: "inventory.units", title: "Inventory: units and projects", who: "Agents, managers", href: "/inventory", chapter: "property",
    summary: "Your projects and units with photos, prices and availability, separate from contacts.",
    steps: [
      "Inventory in the menu opens Units: every listing with status (available, on hold, sold). Filter by project, type and price.",
      "Available units shows only what you can sell today.",
      "Projects holds blocks, photos and payment plans for each project.",
      "Open a unit to add photos, change the price or start a deal for it.",
    ],
  },
  {
    key: "matches", group: "CRM", module: "crm.matches", title: "Property-match alerts", who: "Agents, managers", href: "/crm/matches",
    summary: "AMS tells you when a new or freed-up unit fits one of your leads.",
    steps: [
      "When someone adds a unit, or a unit becomes available again, AMS checks it against every open lead: project, property type, budget (±10%) and area.",
      "If it fits, the lead's agent gets a notification, and the match appears under Leads → Matches.",
      "Tap “Offer on WhatsApp” to send the lead a ready-written message, or ✕ to dismiss the match.",
    ],
    tips: ["Leads match best when their project, property type and budget are filled in.", "Admins switch this on/off in Settings → Features and control who sees it under Roles → Property-match alerts."],
  },
  {
    key: "morning", group: "CRM", module: "crm.summary", title: "Morning summary", who: "Agents, managers", href: "/crm/focus",
    summary: "Every morning AMS sends you your day: follow-ups due, overdue, new leads and target progress.",
    steps: [
      "Each morning (when the daily job runs) you get a notification — and an email if email is set up — called “your day”.",
      "It lists follow-ups due today and overdue, new leads since yesterday, leads never contacted and how much of your monthly target is done.",
      "Managers also get their team's totals: new leads yesterday and overdue follow-ups.",
      "Tap it to open Focus and start working through the list.",
    ],
    tips: ["Who receives it is set under Roles → Morning summary (own = just their own numbers; team/branch/all adds the team totals)."],
  },
  {
    key: "templates", group: "CRM", module: "crm.templates", title: "WhatsApp & email templates", who: "Agents, managers", href: "/crm/templates",
    summary: "Send a ready-made message from a lead in one tap, with their name and project filled in.",
    steps: [
      "On a lead's page, tap the document icon next to Call / WhatsApp and pick a template.",
      "WhatsApp (or your mail app) opens with the message already written — just press send.",
      "AMS notes “WhatsApp sent: <template>” on the lead's timeline.",
      "Admins add and edit templates under Leads → Templates, using placeholders like {first_name}, {project} and {agent}.",
    ],
    tips: ["Roles → Message templates: Read lets agents use templates; Add / Edit / Delete lets someone manage them."],
  },
  {
    key: "visits", group: "CRM", module: "crm.visits", title: "Site-visit GPS check-in", who: "Agents, managers", href: "/crm/visits",
    summary: "Prove a site visit happened: check in with your phone's location when you arrive.",
    steps: [
      "Plan the visit on the lead (Site visit tab in the activity box) with a date and time.",
      "At the site, open Leads → Site visits on your phone and tap “Check in here”. Allow location when the phone asks.",
      "AMS saves where and when you checked in and marks the visit done.",
      "Managers see every check-in with an Open map link; very rough locations are flagged.",
    ],
    tips: ["Roles → Site-visit check-ins: Read shows the log (own/team/branch/all); Add lets someone check in."],
  },
  {
    key: "lost-reasons", group: "CRM", module: "reports.lost", title: "Lost-reason analysis", who: "Managers, Boss", href: "/reports/lost",
    summary: "See why deals are lost and leads are closed — by reason, source and agent.",
    steps: [
      "Open Reports → Lost reasons and pick a period.",
      "The top row shows deals lost, value lost, win rate and leads closed.",
      "The charts split lost deals (by the reason typed when the deal was lost) and closed leads (by their closing stage) by reason, source and agent.",
      "Use it to fix the biggest leak first — e.g. a source that brings mostly wrong numbers.",
    ],
    tips: ["Always type a reason when marking a deal lost — “No reason given” hides the real problem."],
  },
  {
    key: "duplicates", group: "CRM", module: "crm.merge", title: "Find and merge duplicate leads", who: "Managers, admins", href: "/crm/duplicates",
    summary: "Clean up leads that came in twice with the same phone number.",
    steps: [
      "Open Leads → Duplicates. Each card is one phone number with all the leads that share it.",
      "AMS pre-selects the lead with the most history; pick another one if you prefer.",
      "Press Merge: activities, deals and property matches move onto the kept lead, its empty fields are filled from the others, and the duplicates are deleted.",
      "A note on the kept lead lists what was merged.",
    ],
    tips: ["Merging can't be undone. Roles → Duplicate leads & merge: Read shows the list, Edit allows merging."],
  },
  {
    key: "crm-reports", group: "CRM", module: "reports.crm", title: "CRM reports", who: "Managers, Boss", href: "/reports/crm", chapter: "reports",
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
    key: "dialer", group: "Calls", module: "calls", title: "Calling from the dialer (CSR)", who: "Calling team", href: "/calls", chapter: "calls",
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
    key: "campaigns", group: "Calls", module: "calls", action: "create", title: "Campaigns, batches and the wallboard", who: "Calling supervisors", href: "/calls/campaigns", chapter: "calls",
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
    key: "softphone", group: "Calls", superAdmin: true, title: "Phone system and recordings", who: "Super Admin", href: "/calls/phone-system", chapter: "calls",
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
    key: "hr-dashboard", group: "HR", module: "hr.attendance", title: "HR dashboard", who: "HR, managers", href: "/hr", chapter: "hr",
    summary: "Today's attendance, pending approvals, birthdays, headcount and month-wise absents at a glance.",
    steps: [
      "Open HR. The tiles show who is present, late, absent or on leave today — click a tile to see the people.",
      "Charts show this month's attendance and absents for the last 12 months.",
      "Use the dashboard settings to show or hide widgets.",
    ],
  },
  {
    key: "employees", group: "HR", module: "hr.employees", title: "Employees and profiles", who: "HR", href: "/hr/employees", chapter: "hr",
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
    key: "onboarding", group: "HR", module: "hr.onboarding", title: "Onboarding links for new hires", who: "HR", href: "/hr/onboarding",
    summary: "New hires fill in their own details, CNIC and photo from a link — no typing for HR.",
    steps: [
      "Add the person in People → Employees (name, joining date, department).",
      "Open People → Onboarding, choose them and press Create link.",
      "Copy the link or tap WhatsApp to send it. It works for 14 days, once, without a login.",
      "When they submit, HR gets a notification; their details are on the profile and the CNIC pictures wait for HR to verify.",
    ],
    tips: ["Roles → Onboarding links: Read shows the list, Add creates links."],
  },
  {
    key: "leave-planner", group: "HR", module: "hr.leaveplanner", title: "Leave planner and clash warnings", who: "HR, managers", href: "/hr/leave/planner",
    summary: "See who is off each day of the month and spot days a department is short-staffed.",
    steps: [
      "Open Leave → Planner. Each row is a person, each column a day; solid = approved leave, striped = waiting.",
      "Days are flagged red when 2+ people and 30%+ of one department are off; the list above the grid names them.",
      "Filter by department, or move between months with the arrows.",
      "When approving a leave request, Approvals shows who else from that department is off on the same days.",
    ],
    tips: ["Roles → Leave planner sets who sees it (own team, branch or all)."],
  },
  {
    key: "shift-swaps", group: "HR", title: "Shift swaps", who: "Everyone, managers", href: "/me/swaps",
    summary: "Swap a day's shift with a colleague from your phone; your manager approves.",
    steps: [
      "Open My Space → Requests → Shift swaps, pick a colleague and the day, and press Ask.",
      "Your colleague gets a notification and taps Accept or Decline.",
      "Once accepted, your line manager (or HR) approves it in Attendance → Shift swaps.",
      "On approval the roster for that day changes for both of you, so attendance is judged on the new shift.",
    ],
    tips: ["Roles → Shift swaps: Read shows the list for their team/branch, Approve lets them decide."],
  },
  {
    key: "payroll-checklist", group: "HR", module: "hr.payrollchecklist", title: "Payroll run checklist", who: "HR, payroll", href: "/hr/payroll/checklist",
    summary: "Ten steps for every month's payroll, so nothing is missed.",
    steps: [
      "Open Payroll → Checklist; it opens on the current month (use the arrows for others).",
      "Each step shows a live hint — e.g. how many leave requests are still waiting — and an Open button to go there.",
      "Tick a step when it's done; AMS records who ticked it and when.",
      "Run, approve and paid tick themselves when they happen.",
    ],
    tips: ["Roles → Payroll checklist: Read shows it, Edit lets someone tick steps."],
  },
  {
    key: "check-ins", group: "HR", title: "Monthly check-ins (1:1)", who: "Everyone, managers", href: "/me/check-ins",
    summary: "Once a month: how it went, what's blocking you, and goals for next month.",
    steps: [
      "Employees: open My Space → My profile → Check-ins, pick how the month felt and write wins, blockers and goals. Your manager is notified.",
      "Managers: open HR → More → Monthly check-ins, choose the month, and open a person to read theirs.",
      "Add your notes and the agreed goals and Save — the employee is notified and sees them in My Space.",
      "Past months stay on file for appraisals.",
    ],
    tips: ["Roles → Monthly check-ins: Read shows their team's check-ins, Edit lets them add notes."],
  },
  {
    key: "feed", group: "HR", title: "Feed: announcements and kudos", who: "Everyone", href: "/feed",
    summary: "Company news in one place, and a quick way to thank a colleague publicly.",
    steps: [
      "Open My Space → Feed.",
      "Give kudos: pick a colleague, write what they did and press Send — they get a notification and everyone sees it.",
      "Tap the heart to like a post.",
      "HR / management post announcements (optionally pinned to the top); everyone is notified.",
    ],
    tips: ["Roles → Announcements & kudos: Add lets someone post announcements, Delete lets them remove any post."],
  },
  {
    key: "org-chart", group: "HR", module: "hr.orgchart", title: "Org chart", who: "Everyone", href: "/org-chart",
    summary: "See who reports to whom across the company, with photos.",
    steps: [
      "Open My Space → Feed → Org chart (or HR → More → Org chart).",
      "Each card shows the person's photo, designation and department; their team is drawn underneath.",
      "Pick a department to see just that team. HR can click a card to open the profile.",
      "The chart follows each employee's Line manager field — fix that on the profile if someone is in the wrong place.",
    ],
    tips: ["Roles → Org chart decides who can open it (on by default for everyone)."],
  },
  {
    key: "doc-reminders", group: "HR", title: "Document expiry reminders", who: "Everyone", href: "/me",
    summary: "AMS reminds you before your CNIC, passport, licence or other documents expire.",
    steps: [
      "Keep the expiry dates on your profile up to date (CNIC, Passport and Driving License sections, and the expiry on uploaded documents).",
      "You get a notification — and an email when email is set up — 30 days, 7 days and 1 day before, and on the day.",
      "Renew the document and upload the new copy in My Space → My profile → Documents; HR verifies it.",
      "HR still sees everything expiring soon under People → Employees → Documents.",
    ],
    tips: ["Admins switch this on/off in Settings → Features → Document expiry reminders."],
  },
  {
    key: "exit-interviews", group: "HR", module: "hr.exit", title: "Exit interviews", who: "HR, leavers", href: "/hr/exits/interviews",
    summary: "Find out why people leave: a short survey for everyone serving notice.",
    steps: [
      "When a resignation or termination notice is recorded, the employee gets a notification to fill in the exit interview (My Space).",
      "They pick their reasons, rate their manager, team, pay, growth and work-life balance, and say what to improve.",
      "HR sees answers under People → Exit interviews: top reasons, average ratings and the would-rejoin rate.",
      "HR can also fill it in on someone's behalf (e.g. after a face-to-face exit meeting).",
    ],
    tips: ["Roles → Exit interviews: Read shows the answers, Edit lets HR fill them in."],
  },
  {
    key: "attendance", group: "HR", module: "hr.attendance", title: "Attendance and the machine", who: "HR", href: "/hr/attendance", chapter: "attendance",
    summary: "Daily attendance, the monthly register, corrections and the attendance machine.",
    steps: [
      "HR → Attendance shows today: present, late, absent, on leave. Switch to Monthly register for the whole month (50 people per page).",
      "Click a day in the register to correct it; every change is logged in Attendance logs.",
      "Attendance → Machines: connect a ZKTeco machine by IP (port 4370) or Cloud Server, or import the USB file.",
      "Set each employee's device user ID so machine punches match the right person.",
    ],
  },
  {
    key: "leave", group: "HR", module: "hr.leave", title: "Leave", who: "HR, managers", href: "/hr/leave", chapter: "leave",
    summary: "Leave requests, approvals, balances and encashment.",
    steps: [
      "Employees apply from My Space → Requests → Leave; the request goes to their line manager, then HR.",
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
    key: "payroll", group: "HR", module: "hr.payroll", title: "Running payroll", who: "Payroll / accounts", href: "/hr/payroll", chapter: "payroll",
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
      "Open My Space → Attendance and press Check in when you arrive and Check out when you leave.",
      "Allow location if asked — it shows whether you were at the office.",
      "Forgot to punch? Request a correction for that day; your manager approves it.",
    ],
  },
  {
    key: "my-leave", group: "My Space", title: "Leave, requests and payslips", who: "Every employee", href: "/me/leave", chapter: "myspace",
    summary: "Apply for leave, raise requests (WFH, overtime, expenses…) and download payslips.",
    steps: [
      "My Space → Requests → Leave: choose the type and dates and submit; you'll be notified when it's approved.",
      "Requests → New request: work from home, official duty, overtime, travel, general tickets and more. Expenses & loans is a tab too.",
      "Payslips: open or print each month's payslip.",
      "Requests → My requests shows everything you've asked for and its status.",
    ],
  },

  // ── Admin
  {
    key: "users-roles", group: "Admin", module: "settings.users", title: "Users and roles", who: "Super Admin, admins", href: "/settings/users", chapter: "admin",
    summary: "Who can sign in, and what each role can see and do.",
    steps: [
      "Settings → Users → New user: name, email, branch, who they report to, roles and a starting password.",
      "Settings → Roles & Permissions: open a role and set each module's access — Read, Add, Edit, Delete, Export, Approve, Reassign, Import, Bulk actions, Move back/reopen, Listen to recordings.",
      "Scopes: Own items, their Team (everyone reporting to them), their Branch, or All.",
      "Changes apply on the person's next page load.",
    ],
  },
  {
    key: "access-exceptions", group: "Admin", module: "settings.roles", title: "Access exceptions for one person", who: "Super Admin, admins", chapter: "admin",
    summary: "Give someone a bit more or less than their role without making a new role.",
    steps: [
      "Settings → Users → open the person → Access exceptions.",
      "Each cell starts on “Role: …” (what their roles give). Pick a different level to override just that permission.",
      "Save. The users list shows a badge on people with exceptions.",
    ],
  },
  {
    key: "field-rules", group: "Admin", module: "settings.roles", title: "Field rules: hide or mask sensitive data", who: "Super Admin, admins", chapter: "admin",
    summary: "Hide or mask fields such as lead phone numbers, deal values, salary, CNIC and bank details per role.",
    steps: [
      "Settings → Roles & Permissions → open a role → Field rules.",
      "Choose Full access, See but can't change, Masked (0300•••4567) or Hidden for each field.",
      "Masked lead phones can still be called and messaged from AMS — the number just never shows.",
      "People always see their own profile in full.",
    ],
  },
  {
    key: "sign-in-hours", group: "Admin", superAdmin: true, title: "Sign-in hours, two-step login and auto sign-out", who: "Super Admin", href: "/settings/security", chapter: "admin",
    summary: "Control when people can use AMS and how they sign in.",
    steps: [
      "Roles & Permissions → a role → Sign-in hours: set the days and times that role may use AMS.",
      "My profile → Two-step login: set up Google or Microsoft Authenticator for yourself first.",
      "Settings → Security: require two-step login for Super Admins or everyone, and sign people out after some idle minutes.",
    ],
  },
  {
    key: "view-as", group: "Admin", superAdmin: true, title: "View as another user", who: "Super Admin", chapter: "admin",
    summary: "See AMS exactly as someone else does to check their access — read-only.",
    steps: [
      "Settings → Users → open the person → View as.",
      "A yellow bar shows you're viewing as them; nothing can be saved while it's on.",
      "Press Exit on the bar to go back to your own account. Every View as is in the audit log.",
    ],
  },
  {
    key: "features", group: "Admin", module: "settings.company", title: "Turning features on and off", who: "Super Admin, admins", href: "/settings/features", chapter: "admin",
    summary: "Hide whole features your company doesn't use (calls, inventory, payroll, recruitment…).",
    steps: [
      "Settings → Features and switch off what you don't use.",
      "It disappears from everyone's menus; its data is kept and comes back when you switch it on.",
    ],
  },
  {
    key: "layouts", group: "Admin", superAdmin: true, title: "Layouts, company settings and the audit log", who: "Super Admin", href: "/settings/layouts", chapter: "admin",
    summary: "Arrange menus per role, set company details, and see who changed what.",
    steps: [
      "Settings → Layouts: per app and role, hide menu items, reorder sections and set the start page.",
      "Settings → Company & Branches, CRM Settings (stages, sources, on-hold rules) and HR Settings (shifts, leave types, approvals).",
      "Settings → Audit Log lists every important change with who and when.",
      "Company & Branches → Sample data loads or removes demo data for training.",
    ],
  },
];
