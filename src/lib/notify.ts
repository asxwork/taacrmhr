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
  await db.notification.create({ data: { userId, title, body: opts.body ?? null, link: opts.link ?? null, category, priority } });
  // Phone / desktop push for people who turned it on (after the response, never slowing the page).
  inBackground(async () => (await import("./push")).sendPush(userId, title, opts.body, opts.link));
  if (opts.email && smtpConfigured()) {
    // The email goes out after the page has responded, so a slow mail server never slows down saving.
    const send = async () => {
      const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, active: true } });
      if (user?.active && !user.email.endsWith(".local")) {
        const lines = [opts.body, opts.link && `Open: ${APP_URL()}${opts.link}`].filter(Boolean).join("\n\n");
        await sendMail(user.email, title, lines || title, { userId });
      }
    };
    inBackground(send);
  }
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
