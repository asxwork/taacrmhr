import { after } from "next/server";
import { db } from "./db";
import { sendMail, smtpConfigured } from "./mail";

export const APP_URL = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/**
 * In-app notification, plus an email copy when SMTP is configured and the user has an address.
 * `link` is an app path like /crm/leads/abc.
 */
export async function notify(userId: string | null | undefined, title: string, opts: { body?: string; link?: string; email?: boolean; category?: NotifyCategory; priority?: NotifyPriority } = {}) {
  if (!userId) return;
  const category = opts.category ?? categoryOf(opts.link);
  const priority = opts.priority ?? priorityOf(title);
  const prefs = await (await import("./notify-prefs")).notifyPrefs(userId);
  // A muted category (Profile → Notifications) skips everything except urgent items.
  if (prefs.muted.includes(category) && priority !== "urgent") return;
  if (priority !== "urgent" && !(await forSuperAdmin(userId, opts.link))) return;
  // Limits so nobody gets flooded (imports, automations, many leads at once):
  // 1. The same notification (same title and link) within 30 minutes is not repeated.
  // 2. A burst (6+ in 10 minutes) still shows in the bell, but without more phone pushes or instant emails.
  // 3. At most 5 instant emails a day per person; anything more waits for the daily summary email.
  const ago = (min: number) => new Date(Date.now() - min * 60_000);
  const [dupe, burst, emailedToday] = await Promise.all([
    db.notification.findFirst({ where: { userId, title, link: opts.link ?? null, createdAt: { gte: ago(30) } }, select: { id: true } }),
    db.notification.count({ where: { userId, createdAt: { gte: ago(10) } } }),
    db.notification.count({ where: { userId, emailedAt: { gte: ago(24 * 60) } } }),
  ]);
  if (dupe) return;
  const quiet = burst >= 6;
  // Email: urgent items (or "every notification") go now; the rest wait for the person's one daily summary email.
  const wantsEmail = !!opts.email && prefs.email !== "off";
  const now = wantsEmail && (prefs.email === "instant" || priority === "urgent") && !quiet && emailedToday < 5;
  const n = await db.notification.create({ data: { userId, title, body: opts.body ?? null, link: opts.link ?? null, category, priority, emailWanted: wantsEmail && !now && prefs.email === "daily" } });
  // Phone / desktop push for people who turned it on (after the response, never slowing the page); none during a burst.
  if (!quiet) inBackground(async () => (await import("./push")).sendPush(userId, title, opts.body, opts.link));
  if (now && smtpConfigured()) {
    // The email goes out after the page has responded, so a slow mail server never slows down saving.
    const send = async () => {
      const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, active: true } });
      if (user?.active && !user.email.endsWith(".local")) {
        const lines = [opts.body, opts.link && `Open: ${APP_URL()}${opts.link}`].filter(Boolean).join("\n\n");
        await sendMail(user.email, title, lines || title, { userId });
        await db.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
      }
    };
    inBackground(send);
  }
}

/**
 * Super Admins see everything in AMS, so they are not copied on other people's work: they get a notification only when
 * it is urgent, about a lead or deal they own, or about themselves (their profile, leave, payslips, security).
 */
async function forSuperAdmin(userId: string, link?: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  if (!u?.isSuperAdmin) return true;
  if (!link) return false;
  if (/^\/(me|profile|payslips|chat)(\/|$|\?)/.test(link)) return true;
  const lead = link.match(/^\/crm\/leads\/([^/?#]+)/)?.[1];
  if (lead) return (await db.lead.findUnique({ where: { id: lead }, select: { ownerId: true } }))?.ownerId === userId;
  const deal = link.match(/^\/crm\/deals\/([^/?#]+)/)?.[1];
  if (deal) return (await db.deal.findUnique({ where: { id: deal }, select: { ownerId: true } }))?.ownerId === userId;
  return false;
}

/** Runs work after the response when inside a request (Next.js after()), otherwise straight away (scripts, cron). */
export function inBackground(work: () => Promise<unknown>) {
  try {
    after(() => work().catch(() => {}));
  } catch {
    void work().catch(() => {});
  }
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
export async function urgentUnread(userId: string) {
  return db.notification.count({ where: { userId, readAt: null, priority: "urgent" } });
}

export type NotifyCategory = "crm" | "hr" | "finance" | "system";
export type NotifyPriority = "urgent" | "high" | "normal";
export const NOTIFY_CATEGORIES: [NotifyCategory, string][] = [["crm", "CRM"], ["hr", "HR"], ["finance", "Finance"], ["system", "System"]];
/** Which app a notification belongs to, from where it links. */
export function categoryOf(link?: string | null): NotifyCategory {
  if (!link) return "system";
  if (/^\/(crm|calls|inventory|dashboard|reports\/(crm|agents|targets|lost|activity))/.test(link)) return "crm";
  if (/^\/finance/.test(link)) return "finance";
  if (/^\/(hr|me|approvals|payslips|org-chart|feed|reports\/hr)/.test(link)) return "hr";
  return "system";
}
/** Urgent = needs action now (overdue, over budget, low cash, failures, security); high = waiting for you (approvals, requests, due soon). */
export function priorityOf(title: string): NotifyPriority {
  if (/overdue|urgent|over budget|low on cash|failed|failure|password reset|sign-in from|big expense|difference|blocked|expired|missed|no check-out|backup/i.test(title)) return "urgent";
  if (/approve|approval|request|due|reminder|waiting|assigned|callback|top-up|follow-up/i.test(title)) return "high";
  return "normal";
}
