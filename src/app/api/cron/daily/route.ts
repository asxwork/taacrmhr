import { timingSafeEqual } from "node:crypto";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { hrApproverIds } from "@/lib/approvals";
import { loadAttendance } from "@/lib/attendance";
import { applyDueRevisions } from "@/lib/compensation";
import { renderTemplate } from "@/lib/notify-templates";
import { perfSettings } from "@/lib/performance-settings";

// Hostinger cron (once a day, e.g. 07:00): GET https://<domain>/api/cron/daily?key=<CRON_SECRET>
// Attendance and leave balances are computed live, so this job only sends reminders.

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!secret || secret === "change-me" || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) {
    return new Response("Forbidden", { status: 403 });
  }

  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);

  // 0. Approved salary revisions whose effective date has arrived.
  await applyDueRevisions();
  const employees = await db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, userId: true, fullName: true, probationEnd: true, status: true } });

  // 1. Forgot to check out yesterday.
  const att = await loadAttendance(employees.map((e) => e.id), yesterday, yesterday);
  let missing = 0;
  for (const e of employees) {
    if (att.get(e.id)?.[0]?.status === "missing" && e.userId) {
      await notify(e.userId, `No check-out recorded for ${format(yesterday, "EEE d MMM")}`, { body: "Request a correction if you forgot to punch out.", link: `/me/attendance?correct=${format(yesterday, "yyyy-MM-dd")}` });
      missing++;
    }
  }

  // 2. HR heads-up: probations ending in 7 days, documents/CNICs expiring in 30 days.
  const inWeek = addDays(today, (await perfSettings()).probationReminderDays); // Assessment → Settings → Performance
  const probation = employees.filter((e) => e.status === "probation" && e.probationEnd && e.probationEnd >= today && e.probationEnd <= inWeek);
  const expiring = await db.employeeDocument.count({ where: { expiresAt: { gte: today, lte: addDays(today, 30) }, employee: { status: { not: "left" } } } });
  if (probation.length || expiring) {
    const body = [probation.length && `Probation ending soon: ${probation.map((p) => p.fullName).join(", ")}`, expiring && `${expiring} document(s) expire within 30 days`].filter(Boolean).join("\n");
    for (const id of await hrApproverIds()) await notify(id, "HR reminders", { body, link: "/hr/employees?tab=documents", email: true });
  }

  // 3. Birthday and work-anniversary wishes (wording in System Settings → Templates → Notification).
  const people = await db.employee.findMany({ where: { status: { not: "left" }, userId: { not: null } }, select: { userId: true, fullName: true, firstName: true, dob: true, joiningDate: true } });
  const company = (await db.setting.findUnique({ where: { key: "company.name" } }))?.value || "The Advisor Associates";
  const same = (d: Date) => d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  let wishes = 0;
  for (const p of people) {
    const vars = { first_name: p.firstName ?? p.fullName.split(" ")[0]!, name: p.fullName, company, years: today.getFullYear() - p.joiningDate.getFullYear() };
    if (p.dob && same(p.dob)) { const m = await renderTemplate("birthday", vars); await notify(p.userId, m.title, { body: m.body, link: "/hr" }); wishes++; }
    if (vars.years > 0 && same(p.joiningDate)) { const m = await renderTemplate("anniversary", vars); await notify(p.userId, m.title, { body: m.body, link: "/me" }); wishes++; }
  }

  return Response.json({ ok: true, missingCheckouts: missing, probationEnding: probation.length, expiringDocuments: expiring, wishes });
}
