import nodemailer, { type Transporter } from "nodemailer";
import { db } from "./db";

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
    });
  }
  return transporter;
}

export type MailContext = { userId?: string | null; leadId?: string | null; dealId?: string | null; contactId?: string | null };

/** Sends a plain-text email (rendered with simple HTML line breaks) and logs the attempt. Never throws. */
export async function sendMail(to: string, subject: string, body: string, ctx: MailContext = {}, replyTo?: string) {
  let status = "skipped";
  let error: string | null = "SMTP is not configured";
  if (smtpConfigured()) {
    try {
      await getTransport().sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to,
        replyTo,
        subject,
        text: body,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#0f1a2a">${escapeHtml(body).replace(/\n/g, "<br>")}</div>`,
      });
      status = "sent";
      error = null;
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message.slice(0, 500) : "Unknown error";
    }
  }
  await db.emailLog.create({
    data: { to, subject, body, status, error, userId: ctx.userId ?? null, leadId: ctx.leadId ?? null, dealId: ctx.dealId ?? null, contactId: ctx.contactId ?? null },
  });
  return { status, error };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
