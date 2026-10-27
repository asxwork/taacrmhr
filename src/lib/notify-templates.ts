// Notification templates (System Settings → Templates → Notification): the wording of the main automatic
// notifications, editable by admins. {{placeholders}} are filled per message; unknown ones stay as typed.
import { db } from "./db";

export const TEMPLATE_DEFS = [
  { key: "approval_needed", label: "Approval needed", title: "Approval needed: {{title}}", body: "{{type}}", vars: ["title", "type", "requester"] },
  { key: "approved", label: "Request approved", title: "Approved: {{title}}", body: "By {{actor}}", vars: ["title", "actor"] },
  { key: "rejected", label: "Request rejected", title: "Rejected: {{title}}", body: "{{actor}}: {{reason}}", vars: ["title", "actor", "reason"] },
  { key: "payslip_ready", label: "Payslip ready", title: "Payslip for {{month}} is ready", body: "", vars: ["month", "name"] },
  { key: "policy_published", label: "Policy published", title: "New policy: {{policy}}", body: "Please read and acknowledge it.", vars: ["policy", "version"] },
  { key: "birthday", label: "Birthday wish (to the employee)", title: "Happy birthday, {{first_name}}! 🎂", body: "Everyone at {{company}} wishes you a wonderful year ahead.", vars: ["first_name", "name", "company"] },
  { key: "anniversary", label: "Work anniversary (to the employee)", title: "Happy work anniversary, {{first_name}}! 🎉", body: "Thank you for {{years}} year(s) with {{company}}.", vars: ["first_name", "name", "years", "company"] },
] as const;
export type TemplateKey = (typeof TEMPLATE_DEFS)[number]["key"];

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** Title and body for a notification, from the saved template or the default. */
export async function renderTemplate(key: TemplateKey, vars: Record<string, string | number>) {
  const def = TEMPLATE_DEFS.find((t) => t.key === key)!;
  const row = await db.setting.findUnique({ where: { key: `tpl.${key}` } });
  let t: { title: string; body: string } = { title: def.title, body: def.body };
  try { if (row) t = JSON.parse(row.value); } catch {}
  const body = fill(t.body, vars).trim();
  return { title: fill(t.title, vars), body: body || undefined };
}

export async function savedTemplates() {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "tpl." } } });
  return TEMPLATE_DEFS.map((d) => {
    const r = rows.find((x) => x.key === `tpl.${d.key}`);
    try { return { ...d, ...(r ? (JSON.parse(r.value) as { title: string; body: string }) : {}), custom: !!r }; } catch { return { ...d, custom: false }; }
  });
}
