// The scheduled jobs, callable from their cron links and from the keep-awake ping (runDueJobs), so reminders,
// backups and machine syncs keep running even when a cron link in hPanel stops working.
import { addDays, format, startOfDay, subDays } from "date-fns";
import { db } from "./db";
import { notify } from "./notify";
import { hrApproverIds } from "./approvals";
import { loadAttendance } from "./attendance";
import { applyDueRevisions } from "./compensation";
import { renderTemplate } from "./notify-templates";
import { perfSettings } from "./performance-settings";
import { purgeOldRecordings } from "./softphone";
import { syncAllPullMachines } from "./attendance-machine";
import { sendMorningSummaries } from "./morning";
import { sendDocumentReminders } from "./doc-reminders";
import { sendWeeklyEmail } from "./weekly";
import { releaseExpiredHolds } from "./unit-holds";
import { beat } from "./heartbeat";


/** The daily job: reminders, summaries, wishes, HR heads-ups, finance alerts, weekly email. */
export async function runDaily(forceWeekly = false) {
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

  // 4. Call recordings past the retention period (Calls → Phone system).
  const recordingsPurged = await purgeOldRecordings();

  // 5. Attendance machines AMS connects to directly (also synced more often by /api/cron/machines).
  await syncAllPullMachines().catch(() => []);

  // 6. CRM morning summary for everyone with the permission (Settings → Features → Morning summary).
  const summaries = await sendMorningSummaries().catch(() => 0);
  // One summary email per person (their leads, call reports, everything since yesterday) instead of many emails.
  const digests = await (await import("@/lib/daily-digest")).sendDailyDigests().catch(() => 0);
  void digests;

  // 7. Remind employees before their own CNIC / passport / licence / documents expire.
  const docReminders = await sendDocumentReminders().catch(() => 0);

  // 7b. Finance: monthly bills due within 3 days.
  const bills = await (await import("@/lib/finance")).sendBillReminders().catch(() => 0);
  const leadRules = await (await import("@/lib/lead-rules")).runTimedLeadRules().catch(() => 0);
  const invoices = await (await import("@/lib/invoices")).runInvoiceAutomations().catch(() => null);
  const financeAlerts = await (await import("@/lib/finance-reports")).sendFinanceAlerts().catch(() => 0);
  const financeWeekly = await (await import("@/lib/finance-weekly")).sendFinanceWeekly(forceWeekly).catch(() => 0);

  // 8. Mondays: the boss weekly email (add &weekly=1 to send it today).
  // Scheduled attendance reports (HR → Attendance → Reports → saved presets).
  await (await import("@/lib/attendance-schedule")).sendDueAttReports().catch(() => 0);
  const weekly = await sendWeeklyEmail(forceWeekly).catch(() => 0);

  // 9. Google Drive backup is started by the caller after this (it can take minutes).

  // 9b. Manual unit holds past their end date go back to available.
  const holdsReleased = await releaseExpiredHolds().catch(() => 0);

  await beat("daily");
  return { ok: true, summaries, docReminders, weekly, bills, financeWeekly, financeAlerts, invoices, leadRules, holdsReleased, missingCheckouts: missing, probationEnding: probation.length, expiringDocuments: expiring, wishes, recordingsPurged };
}

/** The frequent job: punches from attendance machines, lead automation timers, end-of-shift call reports. */
export async function runMachines() {
  const machines = await syncAllPullMachines();
  const leadRules = await (await import("./lead-rules")).runTimedLeadRules().catch(() => 0);
  const callReports = await (await import("./call-daily")).sendDueCallReports().catch(() => 0);
  await beat("machines");
  return { ok: true, machines, leadRules, callReports };
}

const g = globalThis as unknown as { __cronRunning?: Record<string, boolean> };
const running = (g.__cronRunning ??= {});
async function once(key: string, fn: () => Promise<unknown>) {
  if (running[key]) return;
  running[key] = true;
  try { await fn(); } catch (e) { console.error(`Scheduled job ${key} failed:`, e); await beat(key, false, (e as Error).message).catch(() => {}); } finally { running[key] = false; }
}

/**
 * Called by the keep-awake ping (every few minutes): runs whatever is due. Machines every 10 minutes; the daily job
 * once a day after 7 am Pakistan time; backups at night (from 2 am) when due. Each also still has its own cron link.
 */
export async function runDueJobs() {
  const rows = await db.setting.findMany({ where: { key: { in: ["cron.daily", "cron.machines"] } } });
  const last = (k: string) => { try { return new Date(JSON.parse(rows.find((r) => r.key === `cron.${k}`)?.value ?? "{}").at ?? 0); } catch { return new Date(0); } };
  const pk = new Date(Date.now() + 5 * 3600_000); // Pakistan time as UTC fields
  const pkDay = pk.toISOString().slice(0, 10), pkHour = pk.getUTCHours();
  if (Date.now() - +last("machines") > 10 * 60_000) await once("machines", runMachines);
  const lastDailyPk = new Date(+last("daily") + 5 * 3600_000).toISOString().slice(0, 10);
  if (lastDailyPk !== pkDay && pkHour >= 7) await once("daily", () => runDaily());
  if (pkHour >= 2) await once("backup", async () => {
    const { backupIfDue } = await import("./backup");
    await backupIfDue();
    const off = await (await import("./features")).disabledFeatures();
    if (!off.has("crm-bitrix-backup") && !off.has("app-crm")) await (await import("./bitrix-backup")).bitrixBackupIfDue();
  });
}
