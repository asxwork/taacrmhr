import { db } from "./db";
import { sendMail, smtpConfigured } from "./mail";

const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";

/**
 * In-app notification, plus an email copy when SMTP is configured and the user has an address.
 * `link` is an app path like /crm/leads/abc.
 */
export async function notify(userId: string | null | undefined, title: string, opts: { body?: string; link?: string; email?: boolean } = {}) {
  if (!userId) return;
  await db.notification.create({ data: { userId, title, body: opts.body ?? null, link: opts.link ?? null } });
  if (opts.email && smtpConfigured()) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, active: true } });
    if (user?.active && !user.email.endsWith(".local")) {
      const lines = [opts.body, opts.link && `Open: ${APP_URL()}${opts.link}`].filter(Boolean).join("\n\n");
      await sendMail(user.email, title, lines || title, { userId });
    }
  }
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
