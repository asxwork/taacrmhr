// Guides for the Settings pages that didn't have one yet. Client-safe.
import type { Tutorial } from "./tutorials";

const A = (t: Omit<Tutorial, "group">): Tutorial => ({ group: "Admin", ...t });

export const ADMIN_EXTRA_TUTORIALS: Tutorial[] = [
  A({ key: "roles-matrix", module: "settings.roles", title: "Access permissions (roles)", who: "Super Admin, admins", href: "/settings/roles",
    summary: "Roles across the top, every app's sections down the side. Click a pill to change what a role can do.",
    steps: ["Find a section with the search box (e.g. Finance, Payroll).", "Click the section to open its actions: Read, Add, Edit, Delete, Approve…", "Click a pill to choose None, Own, Team, Branch or All. It saves at once.", "Click + under a role to choose who has it."] }),
  A({ key: "hr-import", module: "hr.employees", action: "import", title: "Import HR data", who: "HR, Super Admin", href: "/settings/hr-import",
    summary: "Bring employees and their details in from Excel.",
    steps: ["Download the template.", "Fill one row per employee and upload it.", "Check the preview and confirm."] }),
  A({ key: "integrations", superAdmin: true, title: "Integrations and mail logs", who: "Super Admin", href: "/settings/integrations",
    summary: "Email (SMTP), lead sources, WhatsApp and other connections, plus the log of every email sent.",
    steps: ["Open the connection you want to set up and fill its details.", "Use Send test to check it works.", "Mail logs show every email, and whether it was sent, held or failed."] }),
  A({ key: "health", superAdmin: true, title: "System health", who: "Super Admin", href: "/settings/health",
    summary: "Is everything working: database, email, backups, scheduled jobs and errors.",
    steps: ["Green = fine, amber = look soon, red = fix now.", "Click an item to see the details and what to do."] }),
  A({ key: "backup", superAdmin: true, title: "Backups to Google Drive", who: "Super Admin", href: "/settings/backup",
    summary: "Every night each app (CRM, HR, Finance, Calls, Inventory, settings) is saved as its own file in Google Drive.",
    steps: ["Click Connect Google Drive once and sign in.", "Choose how many days to keep.", "Back up now runs one straight away; the list shows every backup."] }),
  A({ key: "company", module: "settings.company", title: "Company and branches", who: "Super Admin, admins", href: "/settings/company",
    summary: "Company name, logo, branches (e.g. DHA, Bahadurabad) and shared lists.",
    steps: ["Edit the company details and logo.", "Add or rename branches; users and money holders use these names.", "Edit the lists used across AMS."] }),
  A({ key: "crm-settings", module: "settings.company", title: "CRM settings", who: "Super Admin, sales manager", href: "/settings/crm",
    summary: "Lead stages, sources, pipelines and rules for the CRM.",
    steps: ["Add or reorder lead stages and deal pipelines.", "Edit lead sources.", "Save. Changes show for everyone at once."] }),
  A({ key: "automations", module: "settings.company", title: "Lead automations", who: "Super Admin, sales manager", href: "/crm/automations",
    summary: "Rules that act on leads by themselves, e.g. assign new Facebook leads or remind after 2 days without a call.",
    steps: ["Click New automation.", "Choose when it runs (trigger) and what it does (action).", "Turn it on. The log shows each time it ran."] }),
  A({ key: "activity-log", module: "settings.audit", title: "Activity log", who: "Super Admin, admins", href: "/settings/audit",
    summary: "Everything that happens in AMS, by category: HR, attendance, payroll, CRM, finance, sign-ins…",
    steps: ["Pick a category tab or search.", "Click a row to see who did what and when.", "Super Admins can delete old entries."] }),
];
