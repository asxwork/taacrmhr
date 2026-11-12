import nodemailer, { type Transporter } from "nodemailer";
import { db } from "./db";
import { memo } from "./memo";

/**
 * Who may receive email (Settings → Integrations → Outgoing email). While AMS is being tested: "admins" sends only to
 * Super Admin accounts; everything else is held (logged, not sent). "all" = normal; "off" = nobody.
 */
export type EmailMode = "all" | "admins" | "off";
export async function emailMode(): Promise<EmailMode> {
  const v = await memo("setting:email.mode", 30_000, async () => (await db.setting.findUnique({ where: { key: "email.mode" } }))?.value ?? "admins");
  return v === "all" || v === "off" ? v : "admins";
}
/** Addresses of active Super Admins: their login email plus the personal / official email on their employee record. */
async function adminAddresses() {
  return memo("setting:email.admins", 60_000, async () => {
    const admins = await db.user.findMany({ where: { isSuperAdmin: true, active: true }, select: { email: true, employee: { select: { personalEmail: true, officialEmail: true } } } });
    return admins.flatMap((a) => [a.email, a.employee?.personalEmail, a.employee?.officialEmail]).filter((x): x is string => !!x).map((x) => x.trim().toLowerCase());
  });
}

// SMTP credentials live in env vars (never in the database):
//   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASS, SMTP_FROM ("Name <address>")
// Hostinger mailboxes: host smtp.hostinger.com, port 465.

export function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;
function getTransport() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Give up quickly on an unreachable mail server instead of nodemailer's 2-minute defaults.
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      pool: true, maxConnections: 2,
    });
  }
  return transporter;
}

export type MailContext = { userId?: string | null; leadId?: string | null; dealId?: string | null; contactId?: string | null; /** What to store in the log instead of the body (e.g. when the body holds a secret link). */ logBody?: string; /** A ready HTML email (e.g. a payslip) sent instead of the plain-text body. */ html?: string };

/** Sends a plain-text email (rendered with simple HTML line breaks) and logs the attempt. Never throws. */
export async function sendMail(to: string, subject: string, body: string, ctx: MailContext = {}, replyTo?: string) {
  let status = "skipped";
  let error: string | null = "SMTP is not configured";
  const mode = await emailMode();
  const allowed = mode === "all" || (mode === "admins" && (await adminAddresses()).includes(to.trim().toLowerCase()));
  if (!allowed) {
    status = "held";
    error = mode === "off" ? "Held: email sending is off (Settings → Integrations)" : "Held: testing mode, only Super Admins get email (Settings → Integrations)";
  } else if (smtpConfigured()) {
    try {
      await getTransport().sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to,
        replyTo,
        subject,
        text: body || subject,
        html: ctx.html ?? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#0f1a2a">${escapeHtml(body).replace(/\n/g, "<br>")}</div>`,
      });
      status = "sent";
      error = null;
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message.slice(0, 500) : "Unknown error";
    }
  }
  await db.emailLog.create({
    data: { to, subject, body: ctx.logBody ?? body, status, error, userId: ctx.userId ?? null, leadId: ctx.leadId ?? null, dealId: ctx.dealId ?? null, contactId: ctx.contactId ?? null },
  });
  return { status, error };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
