// Cron heartbeats and the watchdog: each scheduled job records when it last ran; the keep-awake ping (every few
// minutes) checks them and tells Super Admins once a day when a job has stopped, a backup failed or new errors appeared.
import { db } from "./db";
import { notify } from "./notify";
import { backupConfig } from "./backup";

export type Beat = { at: string; ok: boolean; note?: string };
export const JOBS = [
  { key: "daily", label: "Daily job (reminders, summaries, wishes)", url: "/api/cron/daily", maxHours: 26 },
  { key: "backup", label: "Google Drive backup", url: "/api/cron/backup", maxHours: 26 },
  { key: "machines", label: "Attendance machine sync", url: "/api/cron/machines", maxHours: 3 },
  { key: "ping", label: "Keep-awake ping", url: "/api/cron/ping", maxHours: 1 },
] as const;

export async function beat(job: string, ok = true, note?: string) {
  const value = JSON.stringify({ at: new Date().toISOString(), ok, note: note?.slice(0, 300) } satisfies Beat);
  await db.setting.upsert({ where: { key: `cron.${job}` }, update: { value }, create: { key: `cron.${job}`, value } }).catch(() => {});
}

export async function beats(): Promise<Record<string, Beat | null>> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "cron." } } });
  const out: Record<string, Beat | null> = {};
  for (const r of rows) { try { out[r.key.slice(5)] = JSON.parse(r.value); } catch {} }
  return out;
}

/** Problems right now: late or failing jobs, a failed last backup. */
export async function problems() {
  const [b, cfg, lastBackup] = await Promise.all([beats(), backupConfig(), db.backupRun.findFirst({ where: { status: { not: "running" } }, orderBy: { startedAt: "desc" } })]);
  const list: string[] = [];
  for (const j of JOBS) {
    if (j.key === "backup" && !cfg.refreshToken) continue;
    const x = b[j.key];
    // Machine sync is optional: only watched once it has run at least once.
    if (!x) { if (j.key === "daily" || j.key === "backup") list.push(`${j.label} has never run — add the cron job in hPanel.`); continue; }
    const hours = (Date.now() - +new Date(x.at)) / 3600_000;
    if (hours > j.maxHours) list.push(`${j.label} last ran ${Math.round(hours)} hours ago.`);
    else if (!x.ok) list.push(`${j.label} failed: ${x.note ?? "unknown error"}`);
  }
  const starts = await (await import("./app-starts")).recentStarts(24);
  if (starts.length > 6) list.push(`The app restarted ${starts.length} times in the last 24 hours — the host is stopping it (often too little memory on the plan). Every restart makes the next click wait.`);
  if (lastBackup?.status === "failed") list.push(`Last backup failed: ${lastBackup.error ?? ""}`.slice(0, 300));
  // Attendance that stopped arriving (machine offline / not linked) makes everyone look absent.
  const [staff, lastPunch, lastDay] = await Promise.all([
    db.employee.count({ where: { status: { not: "left" }, attendanceExempt: false } }),
    db.attendancePunch.findFirst({ orderBy: { at: "desc" }, select: { at: true } }),
    db.attendanceDay.findFirst({ where: { status: { in: ["present", "late"] } }, orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const last = [lastPunch?.at, lastDay?.date].filter(Boolean).sort((a, b) => +b! - +a!)[0];
  if (staff && last && Date.now() - +last > 3 * 864e5) list.push(`No attendance received since ${last.toISOString().slice(0, 10)} — check the attendance machine connection (HR → Attendance → Machines), otherwise everyone shows as absent.`);
  return list;
}

/** Called by the ping: at most once a day, alert Super Admins about problems and new errors. */
export async function watchdog() {
  const today = new Date().toISOString().slice(0, 10);
  const flag = await db.setting.findUnique({ where: { key: "watchdog.lastAlert" } });
  if (flag?.value === today) return;
  const [list, since] = [await problems(), flag ? new Date(`${flag.value}T00:00:00`) : new Date(Date.now() - 864e5)];
  const newErrors = await db.errorLog.count({ where: { lastAt: { gte: since } } });
  await db.setting.upsert({ where: { key: "watchdog.lastAlert" }, update: { value: today }, create: { key: "watchdog.lastAlert", value: today } });
  if (!list.length && !newErrors) return;
  const body = [...list, newErrors ? `${newErrors} error(s) since yesterday — see the error log.` : null].filter(Boolean).join("\n");
  const admins = await db.user.findMany({ where: { isSuperAdmin: true, active: true }, select: { id: true } });
  for (const a of admins) await notify(a.id, "⚠️ AMS needs attention", { body, link: "/settings/health", email: true });
}
