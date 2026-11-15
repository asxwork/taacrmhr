// Invoices app: numbering, totals, approval rules, client link, payments (to Finance and deal installments),
// reminders and repeating invoices.
import { randomBytes } from "node:crypto";
import { addMonths, addYears, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { db } from "./db";
import { memo, forget } from "./memo";
import { APP_URL, notify } from "./notify";

export type InvoiceConfig = {
  prefix: string; nextNo: number; taxPct: number; dueDays: number; terms: string; bank: string;
  /** 0 = every invoice needs approval; otherwise only invoices of this amount or more. */
  approvalAbove: number; approverIds: string[]; autoSend: boolean; reminderDays: number; remindersOn: boolean;
};
const KEY = "invoices.config";
const DEFAULTS: InvoiceConfig = { prefix: "INV", nextNo: 1, taxPct: 0, dueDays: 7, terms: "Payment is due by the date above. Please quote the invoice number with your payment.", bank: "", approvalAbove: 0, approverIds: [], autoSend: false, reminderDays: 3, remindersOn: true };

export function invoiceConfig(): Promise<InvoiceConfig> {
  return memo("setting:invoices", 60_000, async () => {
    const row = await db.setting.findUnique({ where: { key: KEY } });
    try { return { ...DEFAULTS, ...(row ? JSON.parse(row.value) : {}) }; } catch { return DEFAULTS; }
  });
}
export async function saveInvoiceConfig(patch: Partial<InvoiceConfig>) {
  const value = JSON.stringify({ ...(await invoiceConfig()), ...patch });
  await db.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  forget("setting:invoices");
}

/** INV-2026-0001: the next free number (counter in settings; skips any number already used). */
export async function nextInvoiceNumber() {
  const c = await invoiceConfig();
  let n = c.nextNo;
  const year = new Date().getFullYear();
  let num = "";
  for (;;) {
    num = `${c.prefix}-${year}-${String(n).padStart(4, "0")}`;
    if (!(await db.invoice.findUnique({ where: { number: num }, select: { id: true } }))) break;
    n++;
  }
  await saveInvoiceConfig({ nextNo: n + 1 });
  return num;
}

export const newPublicToken = () => randomBytes(18).toString("base64url");

export type LineIn = { description: string; qty: number; rate: number };
export function totals(items: LineIn[], discount: number, taxPct: number) {
  const lines = items.filter((i) => i.description.trim()).map((i, sort) => ({ description: i.description.trim().slice(0, 300), qty: Math.max(0, i.qty || 0), rate: Math.max(0, i.rate || 0), amount: Math.round(Math.max(0, i.qty || 0) * Math.max(0, i.rate || 0) * 100) / 100, sort }));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const d = Math.min(Math.max(0, discount || 0), subtotal);
  const taxAmount = Math.round((subtotal - d) * (Math.max(0, taxPct || 0) / 100) * 100) / 100;
  return { lines, subtotal, discount: d, taxPct: Math.max(0, taxPct || 0), taxAmount, total: Math.round((subtotal - d + taxAmount) * 100) / 100 };
}

export const publicUrl = (token: string) => `${APP_URL()}/i/${token}`;

/** What to show: overdue and part-paid come from dates and payments, not stored. */
export function displayStatus(inv: { status: string; dueDate: Date; total: number; paidAmount: number }) {
  if (inv.status === "paid" || (inv.total > 0 && inv.paidAmount >= inv.total - 0.5)) return { key: "paid", label: "Paid", tone: "green" as const };
  if (["approved", "sent"].includes(inv.status) && inv.dueDate < startOfDay(new Date())) return { key: "overdue", label: inv.paidAmount > 0 ? "Overdue · part paid" : "Overdue", tone: "red" as const };
  if (["approved", "sent"].includes(inv.status) && inv.paidAmount > 0) return { key: "partial", label: "Part paid", tone: "amber" as const };
  const map: Record<string, [string, "neutral" | "amber" | "navy" | "green" | "red" | "gold"]> = {
    draft: ["Draft", "neutral"], pending: ["Waiting for approval", "amber"], approved: ["Approved", "navy"], sent: ["Sent", "gold"], rejected: ["Rejected", "red"], void: ["Cancelled", "neutral"],
  };
  const [label, tone] = map[inv.status] ?? [inv.status, "neutral"];
  return { key: inv.status, label, tone };
}

export async function invoiceEvent(invoiceId: string, userId: string | null, action: string, note?: string) {
  await db.invoiceEvent.create({ data: { invoiceId, userId, action, note: note?.slice(0, 500) } });
}

/** People who can approve invoices: Super Admins and anyone whose role has Invoices → approve. */
export async function invoiceApprovers() {
  const users = await db.user.findMany({
    where: { active: true, OR: [{ isSuperAdmin: true }, { roles: { some: { role: { permissions: { some: { module: "invoices", action: "approve", scope: { not: "none" } } } } } } }, { permissionOverrides: { some: { module: "invoices", action: "approve", scope: { not: "none" } } } }] },
    select: { id: true, name: true, isSuperAdmin: true }, orderBy: { name: "asc" },
  });
  return users;
}

/** Emails the client the link (and marks it sent). Returns why it couldn't, if it couldn't. */
export async function emailInvoice(id: string, userId: string | null) {
  const inv = await db.invoice.findUnique({ where: { id } });
  if (!inv) return "Invoice not found.";
  if (!inv.clientEmail) return "Add the client's email first, or share the link on WhatsApp.";
  const { sendMail } = await import("./mail");
  const { pkr } = await import("./finance");
  const company = (await db.setting.findUnique({ where: { key: "company.name" } }))?.value || "The Advisor Associates";
  await sendMail(inv.clientEmail, `Invoice ${inv.number} from ${company}`,
    `Dear ${inv.clientName},\n\nPlease find invoice ${inv.number} for ${pkr(inv.total)}, due on ${format(inv.dueDate, "d MMMM yyyy")}.\n\nView, sign and download it here: ${publicUrl(inv.publicToken)}\n\nThank you.\n${company}`);
  await db.invoice.update({ where: { id }, data: { status: inv.status === "approved" ? "sent" : inv.status, sentAt: new Date() } });
  await invoiceEvent(id, userId, "sent", `Emailed to ${inv.clientEmail}`);
  return null;
}

/**
 * Daily: reminders to clients (a few days before the due date, then weekly while overdue) and the person who made
 * the invoice; and the next copy of repeating invoices (made as drafts, or straight to approval).
 */
export async function runInvoiceAutomations(today = new Date()) {
  const c = await invoiceConfig();
  const day = startOfDay(today);
  let reminded = 0, repeated = 0;
  if (c.remindersOn) {
    const open = await db.invoice.findMany({ where: { status: { in: ["approved", "sent"] } } });
    for (const inv of open) {
      if (inv.paidAmount >= inv.total - 0.5) continue;
      const days = differenceInCalendarDays(inv.dueDate, day);
      const last = inv.lastReminderAt ? differenceInCalendarDays(day, inv.lastReminderAt) : 999;
      const due = days === c.reminderDays || days === 0 || (days < 0 && last >= 7);
      if (!due || last < 1) continue;
      if (inv.clientEmail) await emailInvoice(inv.id, null).catch(() => {});
      if (inv.ownerId) await notify(inv.ownerId, days < 0 ? `Invoice ${inv.number} is ${-days} day${days === -1 ? "" : "s"} overdue` : `Invoice ${inv.number} is due ${days ? `in ${days} days` : "today"}`, { body: `${inv.clientName}${inv.clientEmail ? " was reminded by email." : " has no email: send a WhatsApp reminder."}`, link: `/invoices/${inv.id}` }).catch(() => {});
      await db.invoice.update({ where: { id: inv.id }, data: { lastReminderAt: day } });
      await invoiceEvent(inv.id, null, "reminder", days < 0 ? `${-days} days overdue` : `Due in ${days} days`);
      reminded++;
    }
  }
  const repeating = await db.invoice.findMany({ where: { repeat: { not: "none" }, nextRunAt: { lte: today }, status: { notIn: ["void", "rejected"] } }, include: { items: true } });
  for (const src of repeating) {
    const step = (d: Date) => (src.repeat === "monthly" ? addMonths(d, 1) : src.repeat === "quarterly" ? addMonths(d, 3) : addYears(d, 1));
    const gap = differenceInCalendarDays(src.dueDate, src.issueDate);
    const issue = startOfDay(src.nextRunAt!);
    const needsApproval = c.approvalAbove === 0 || src.total >= c.approvalAbove;
    const copy = await db.invoice.create({
      data: {
        number: await nextInvoiceNumber(), status: needsApproval && src.approverId ? "pending" : needsApproval ? "draft" : "approved", clientName: src.clientName, clientEmail: src.clientEmail, clientPhone: src.clientPhone, clientAddress: src.clientAddress, contactId: src.contactId, dealId: src.dealId,
        issueDate: issue, dueDate: new Date(issue.getTime() + gap * 86_400_000), subtotal: src.subtotal, discount: src.discount, taxPct: src.taxPct, taxAmount: src.taxAmount, total: src.total,
        notes: src.notes, terms: src.terms, ownerId: src.ownerId, branchId: src.branchId, approverId: src.approverId, publicToken: newPublicToken(), parentId: src.id,
        items: { create: src.items.map((i) => ({ description: i.description, qty: i.qty, rate: i.rate, amount: i.amount, sort: i.sort })) },
      },
    });
    await db.invoice.update({ where: { id: src.id }, data: { nextRunAt: step(issue) } });
    await invoiceEvent(copy.id, null, "created", `Repeating copy of ${src.number}`);
    if (copy.status === "pending" && copy.approverId) await notify(copy.approverId, `Invoice ${copy.number} needs your approval`, { body: `${copy.clientName} · repeating invoice`, link: `/invoices/${copy.id}` }).catch(() => {});
    if (src.ownerId) await notify(src.ownerId, `Repeating invoice ${copy.number} was made`, { body: copy.clientName, link: `/invoices/${copy.id}` }).catch(() => {});
    repeated++;
  }
  return { reminded, repeated };
}
