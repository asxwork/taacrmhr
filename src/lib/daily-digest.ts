// One email a day per person instead of an email per notification: their leads and follow-ups (like My day), call
// reports for supervisors, and everything else since the last summary. Urgent items were
// already emailed straight away by notify(). Sent from the daily cron in the morning.
import { addDays, format, startOfDay, subDays } from "date-fns";
import { db } from "./db";
import { sendMail, smtpConfigured } from "./mail";
import { loadUserById } from "./auth";
import { can } from "./permissions";
import { APP_URL } from "./notify";
import { notifyPrefs } from "./notify-prefs";
import { pkDay } from "./call-daily";

const MAX_ITEMS = 12;
const short = (s: string | null, n = 110) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\n+/g, " · ") : "");

/** The summary text for one person (null = nothing worth an email today). Exported for the preview on Profile. */
export async function digestFor(userId: string, now = new Date()) {
  const user = await loadUserById(userId);
  if (!user) return null;
  const today = startOfDay(now), tomorrow = addDays(today, 1), yesterday = subDays(today, 1);
  const base = APP_URL();
  const parts: string[] = [];
  let worth = false;

  // Leads (anyone who works leads): the same numbers as My day, and the next follow-ups by name.
  if (can(user, "crm.leads")) {
    const open = { status: { kind: "open" } };
    const [overdue, dueToday, fresh, untouched, next] = await Promise.all([
      db.activity.count({ where: { ownerId: userId, doneAt: null, dueAt: { lt: today } } }),
      db.activity.count({ where: { ownerId: userId, doneAt: null, dueAt: { gte: today, lt: tomorrow } } }),
      db.lead.count({ where: { ...open, ownerId: userId, createdAt: { gte: yesterday } } }),
      db.lead.count({ where: { ...open, ownerId: userId, lastActivityAt: null } }),
      db.activity.findMany({ where: { ownerId: userId, doneAt: null, dueAt: { lt: tomorrow } }, orderBy: { dueAt: "asc" }, take: 5, select: { subject: true, dueAt: true, lead: { select: { name: true } } } }),
    ]);
    if (overdue + dueToday + fresh + untouched > 0) {
      worth = true;
      parts.push([
        "YOUR LEADS TODAY",
        `• ${dueToday} follow-up${dueToday === 1 ? "" : "s"} due today${overdue ? ` · ${overdue} overdue` : ""}`,
        fresh ? `• ${fresh} new lead${fresh === 1 ? "" : "s"} since yesterday` : "",
        untouched ? `• ${untouched} lead${untouched === 1 ? "" : "s"} never contacted` : "",
        ...next.map((a) => `• ${a.dueAt && a.dueAt < today ? "Overdue" : a.dueAt ? format(a.dueAt, "h:mm a") : ""} — ${a.lead?.name ?? "Lead"}: ${short(a.subject, 60)}`),
      ].filter(Boolean).join("\n"));
      parts.push(`Open my day: ${base}/crm/my-day`);
    }
  }

  // Calling supervisors: yesterday's end-of-shift reports in one line (instead of one notification per agent).
  if (user.isSuperAdmin || can(user, "calls", "assign")) {
    const y = pkDay(subDays(now, 1)).date;
    const reports = await db.callDailyReport.findMany({ where: { date: y }, select: { data: true } });
    if (reports.length) {
      worth = true;
      const calls = reports.reduce((s, r) => { try { return s + (JSON.parse(r.data).calls ?? 0); } catch { return s; } }, 0);
      parts.push(`CALLS YESTERDAY\n• ${reports.length} agent report${reports.length === 1 ? "" : "s"} · ${calls} calls`);
      parts.push(`Daily call reports: ${base}/calls/reports?tab=daily`);
    }
  }

  // Everything else since the last summary.
  const pending = await db.notification.findMany({ where: { userId, emailWanted: true, emailedAt: null, createdAt: { gte: subDays(now, 3) } }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, body: true } });
  if (pending.length) {
    worth = true;
    parts.push(["SINCE YESTERDAY", ...pending.slice(0, MAX_ITEMS).map((n) => `• ${n.title}${n.body ? ` — ${short(n.body)}` : ""}`), pending.length > MAX_ITEMS ? `• …and ${pending.length - MAX_ITEMS} more` : ""].filter(Boolean).join("\n"));
    parts.push(`All notifications: ${base}/notifications`);
  }
  if (!worth) return null;
  return { user, subject: `Your AMS summary · ${format(now, "EEE d MMM")}`, body: [`Good morning ${user.name.split(" ")[0]}, here is your day at a glance.`, ...parts, "Change what you get by email: Profile → Notifications."].join("\n\n"), ids: pending.map((n) => n.id) };
}

/** Daily cron: one summary email per person who chose the daily summary (the default). */
export async function sendDailyDigests(now = new Date()) {
  if (!smtpConfigured()) return 0;
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, email: true } });
  let sent = 0;
  for (const u of users) {
    if (u.email.endsWith(".local")) continue;
    if ((await notifyPrefs(u.id)).email !== "daily") continue;
    const d = await digestFor(u.id, now).catch(() => null);
    if (!d) continue;
    await sendMail(u.email, d.subject, d.body, { userId: u.id });
    if (d.ids.length) await db.notification.updateMany({ where: { id: { in: d.ids } }, data: { emailedAt: now } });
    sent++;
  }
  return sent;
}
