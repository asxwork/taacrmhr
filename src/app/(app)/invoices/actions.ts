"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, scopeWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { saveSignature } from "@/lib/files";
import { emailInvoice, invoiceConfig, invoiceEvent, newPublicToken, nextInvoiceNumber, saveInvoiceConfig, totals, type LineIn } from "@/lib/invoices";
import { pkr } from "@/lib/finance";
import { str, type FormState } from "@/lib/utils";

/** An invoice the user may act on (scope of Invoices → action), or null. */
async function loadInvoice(user: SessionUser, id: string, action: "view" | "edit" | "delete" | "approve" = "view") {
  const where = await scopeWhere(user, "invoices", action);
  if (!where) return null;
  return db.invoice.findFirst({ where: { AND: [{ id }, where] }, include: { items: true } });
}

const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/[, ]/g, "")) || 0;
const date = (fd: FormData, k: string) => { const d = new Date(str(fd, k)); return Number.isNaN(+d) ? null : d; };

/** Creates or updates an invoice. Editing an approved invoice sends it back to draft (it needs approval again). */
export async function saveInvoice(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  if (!can(user, "invoices", id ? "edit" : "create")) return { error: "Your role can't do this." };
  const existing = id ? await loadInvoice(user, id, "edit") : null;
  if (id && !existing) return { error: "Invoice not found." };
  if (existing && ["paid", "void"].includes(existing.status)) return { error: "A paid or cancelled invoice can't be changed." };
  let items: LineIn[] = [];
  try { items = JSON.parse(str(fd, "items") || "[]"); } catch { return { error: "Check the items." }; }
  const t = totals(items, num(fd, "discount"), num(fd, "taxPct"));
  const clientName = str(fd, "clientName").slice(0, 150);
  const issueDate = date(fd, "issueDate"), dueDate = date(fd, "dueDate");
  if (!clientName) return { error: "Who is the invoice for?" };
  if (!t.lines.length) return { error: "Add at least one item." };
  if (!issueDate || !dueDate) return { error: "Choose the invoice and due dates." };
  if (dueDate < issueDate) return { error: "The due date is before the invoice date." };
  const repeat = ["monthly", "quarterly", "yearly"].includes(str(fd, "repeat")) ? str(fd, "repeat") : "none";
  const data = {
    clientName, clientEmail: str(fd, "clientEmail").toLowerCase().slice(0, 150) || null, clientPhone: str(fd, "clientPhone").slice(0, 40) || null, clientAddress: str(fd, "clientAddress").slice(0, 500) || null,
    dealId: str(fd, "dealId") || null, installmentId: str(fd, "installmentId") || null, contactId: str(fd, "contactId") || null,
    issueDate, dueDate, subtotal: t.subtotal, discount: t.discount, taxPct: t.taxPct, taxAmount: t.taxAmount, total: t.total,
    notes: str(fd, "notes").slice(0, 2000) || null, terms: str(fd, "terms").slice(0, 2000) || null, repeat,
    nextRunAt: repeat === "none" ? null : existing?.nextRunAt ?? null,
  };
  if (repeat !== "none" && !data.nextRunAt) {
    const n = new Date(issueDate);
    if (repeat === "monthly") n.setMonth(n.getMonth() + 1); else if (repeat === "quarterly") n.setMonth(n.getMonth() + 3); else n.setFullYear(n.getFullYear() + 1);
    data.nextRunAt = n;
  }
  let invId: string;
  if (existing) {
    const backToDraft = ["approved", "sent", "pending", "rejected"].includes(existing.status) && existing.paidAmount === 0;
    await db.$transaction([
      db.invoiceItem.deleteMany({ where: { invoiceId: existing.id } }),
      db.invoice.update({ where: { id: existing.id }, data: { ...data, ...(backToDraft ? { status: "draft", approvedById: null, approvedAt: null, approverSign: null, rejectReason: null } : {}), items: { create: t.lines } } }),
    ]);
    invId = existing.id;
    await invoiceEvent(invId, user.id, "edited", backToDraft && existing.status !== "draft" ? "Changed after approval: needs approval again" : undefined);
  } else {
    const inv = await db.invoice.create({ data: { ...data, number: await nextInvoiceNumber(), status: "draft", ownerId: user.id, branchId: user.branchId, publicToken: newPublicToken(), items: { create: t.lines } } });
    invId = inv.id;
    await invoiceEvent(invId, user.id, "created");
    await audit(user.id, "create", "invoice", invId, `Invoice ${inv.number} for ${clientName} (${pkr(t.total)})`);
  }
  revalidatePath("/invoices");
  if (str(fd, "submit") === "1") return submitInvoiceInner(user, invId, str(fd, "approverId"));
  redirect(`/invoices/${invId}`);
}

/** Sends for approval to the chosen approver (Samad, the boss…). Small invoices (below the approval amount) are approved straight away. */
export async function submitInvoice(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return submitInvoiceInner(user, str(fd, "id"), str(fd, "approverId"));
}

async function submitInvoiceInner(user: SessionUser, id: string, approverId: string): Promise<FormState> {
  const inv = await loadInvoice(user, id, "edit");
  if (!inv) return { error: "Invoice not found." };
  if (!["draft", "rejected"].includes(inv.status)) return { error: "Only drafts can be sent for approval." };
  const c = await invoiceConfig();
  if (c.approvalAbove > 0 && inv.total < c.approvalAbove) {
    await db.invoice.update({ where: { id }, data: { status: "approved", approvedById: user.id, approvedAt: new Date(), rejectReason: null } });
    await invoiceEvent(id, user.id, "approved", `No approval needed below ${pkr(c.approvalAbove)}`);
    if (c.autoSend && inv.clientEmail) await emailInvoice(id, user.id);
    revalidatePath("/invoices");
    redirect(`/invoices/${id}`);
  }
  const approver = await db.user.findFirst({ where: { id: approverId || c.approverIds[0] || "", active: true }, select: { id: true, name: true } });
  if (!approver) return { error: "Choose who should approve it." };
  await db.invoice.update({ where: { id }, data: { status: "pending", approverId: approver.id, rejectReason: null } });
  await invoiceEvent(id, user.id, "submitted", `Sent to ${approver.name} for approval`);
  await notify(approver.id, `Invoice ${inv.number} needs your approval`, { body: `${inv.clientName} · ${pkr(inv.total)} · from ${user.name}`, link: `/invoices/${id}`, email: true });
  revalidatePath("/invoices");
  redirect(`/invoices/${id}`);
}

/** The approver signs (drawn signature) and approves. */
export async function approveInvoice(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user, "invoices", "approve")) return { error: "Your role can't approve invoices." };
  const inv = await loadInvoice(user, str(fd, "id"), "approve");
  if (!inv) return { error: "Invoice not found." };
  if (inv.status !== "pending") return { error: "This invoice isn't waiting for approval." };
  if (inv.approverId && inv.approverId !== user.id && !user.isSuperAdmin) return { error: "This invoice is waiting for someone else's approval." };
  const sign = await saveSignature(str(fd, "signature"), "invoices/signatures");
  if (!sign) return { error: "Sign in the box before approving." };
  await db.invoice.update({ where: { id: inv.id }, data: { status: "approved", approvedById: user.id, approvedAt: new Date(), approverSign: sign } });
  await invoiceEvent(inv.id, user.id, "approved", "Signed and approved");
  await audit(user.id, "approve", "invoice", inv.id, `Approved invoice ${inv.number}`);
  if (inv.ownerId && inv.ownerId !== user.id) await notify(inv.ownerId, `Invoice ${inv.number} was approved`, { body: `${user.name} signed it. You can send it to ${inv.clientName} now.`, link: `/invoices/${inv.id}` });
  const c = await invoiceConfig();
  if (c.autoSend && inv.clientEmail) await emailInvoice(inv.id, user.id);
  revalidatePath("/invoices");
  return { ok: true, message: c.autoSend && inv.clientEmail ? "Approved and emailed to the client." : "Approved." };
}

export async function rejectInvoice(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user, "invoices", "approve")) return { error: "Your role can't approve invoices." };
  const inv = await loadInvoice(user, str(fd, "id"), "approve");
  if (!inv || inv.status !== "pending") return { error: "This invoice isn't waiting for approval." };
  const reason = str(fd, "reason").slice(0, 300);
  if (!reason) return { error: "Say what needs changing." };
  await db.invoice.update({ where: { id: inv.id }, data: { status: "rejected", rejectReason: reason } });
  await invoiceEvent(inv.id, user.id, "rejected", reason);
  if (inv.ownerId) await notify(inv.ownerId, `Invoice ${inv.number} needs changes`, { body: `${user.name}: ${reason}`, link: `/invoices/${inv.id}` });
  revalidatePath("/invoices");
  return { ok: true, message: "Sent back with your note." };
}

export async function sendInvoiceEmail(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const inv = await loadInvoice(user, str(fd, "id"), "edit");
  if (!inv) return { error: "Invoice not found." };
  if (!["approved", "sent"].includes(inv.status)) return { error: "Approve the invoice before sending it." };
  const why = await emailInvoice(inv.id, user.id);
  revalidatePath(`/invoices/${inv.id}`);
  return why ? { error: why } : { ok: true, message: `Emailed to ${inv.clientEmail}.` };
}

/** Shared on WhatsApp or copied: counts as sent. */
export async function markSent(id: string, how: string) {
  const user = await requireUser();
  const inv = await loadInvoice(user, id, "edit");
  if (!inv || !["approved", "sent"].includes(inv.status)) return;
  await db.invoice.update({ where: { id }, data: { status: "sent", sentAt: inv.sentAt ?? new Date() } });
  await invoiceEvent(id, user.id, "sent", how);
  revalidatePath(`/invoices/${id}`);
}

/**
 * A payment from the client. It also goes into Finance as money in (when a holder is chosen) and, for an invoice made
 * from a deal installment, marks that installment paid, so CRM, Finance and the P&L agree.
 */
export async function recordInvoicePayment(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const inv = await loadInvoice(user, str(fd, "id"), "edit");
  if (!inv) return { error: "Invoice not found." };
  if (!["approved", "sent"].includes(inv.status)) return { error: "Only approved invoices can be paid." };
  const amount = num(fd, "amount");
  const when = date(fd, "date") ?? new Date();
  if (amount <= 0) return { error: "Enter the amount received." };
  if (amount > inv.total - inv.paidAmount + 0.5) return { error: `That's more than what's left (${pkr(inv.total - inv.paidAmount)}).` };
  const method = str(fd, "method").slice(0, 40) || null, reference = str(fd, "reference").slice(0, 80) || null;
  let finEntryId: string | null = null;
  const holderId = str(fd, "holderId");
  if (holderId && can(user, "finance", "create")) {
    let cat = await db.finCategory.findFirst({ where: { name: "Client payments", parentId: null } });
    if (!cat) cat = await db.finCategory.create({ data: { name: "Client payments", sortOrder: 999 } });
    const e = await db.finEntry.create({ data: {
      date: when, kind: "in", amount, accountId: holderId, description: `Invoice ${inv.number} · ${inv.clientName}`, party: inv.clientName,
      // Installment payments already count as income in the P&L, so the Finance copy has no category there.
      categoryId: inv.installmentId ? null : cat.id, sourceType: inv.installmentId ? "installment" : "invoice", sourceId: inv.id, createdById: user.id,
      notes: [method, reference].filter(Boolean).join(" · ") || null,
    } });
    finEntryId = e.id;
  }
  await db.invoicePayment.create({ data: { invoiceId: inv.id, amount, date: when, method, reference, finEntryId, createdById: user.id } });
  const paid = inv.paidAmount + amount;
  await db.invoice.update({ where: { id: inv.id }, data: { paidAmount: paid, ...(paid >= inv.total - 0.5 ? { status: "paid" } : {}) } });
  if (inv.installmentId) {
    const i = await db.installment.findUnique({ where: { id: inv.installmentId } });
    if (i) await db.installment.update({ where: { id: i.id }, data: { paidAmount: Math.min(i.amount, i.paidAmount + amount), paidAt: when, method, reference: reference ?? inv.number } });
  }
  await invoiceEvent(inv.id, user.id, "payment", `${pkr(amount)} received${method ? ` by ${method}` : ""}`);
  if (paid >= inv.total - 0.5) void (await import("@/lib/lead-rules")).fireHook("invoice.paid", { invoice: { id: inv.id, number: inv.number, client: inv.clientName, total: inv.total, paidAt: when } });
  revalidatePath(`/invoices/${inv.id}`);
  return { ok: true, message: paid >= inv.total - 0.5 ? "Paid in full." : `Recorded. ${pkr(inv.total - paid)} still due.` };
}

export async function voidInvoice(fd: FormData) {
  const user = await requireUser();
  const inv = await loadInvoice(user, str(fd, "id"), "delete");
  if (!inv || inv.paidAmount > 0) return;
  if (inv.status === "draft") await db.invoice.delete({ where: { id: inv.id } });
  else { await db.invoice.update({ where: { id: inv.id }, data: { status: "void", repeat: "none", nextRunAt: null } }); await invoiceEvent(inv.id, user.id, "cancelled"); }
  await audit(user.id, "delete", "invoice", inv.id, `${inv.status === "draft" ? "Deleted" : "Cancelled"} invoice ${inv.number}`);
  revalidatePath("/invoices");
  redirect(inv.status === "draft" ? "/invoices" : `/invoices/${inv.id}`);
}

export async function duplicateInvoice(fd: FormData) {
  const user = await requireUser();
  if (!can(user, "invoices", "create")) return;
  const src = await loadInvoice(user, str(fd, "id"));
  if (!src) return;
  const c = await invoiceConfig();
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const inv = await db.invoice.create({ data: {
    number: await nextInvoiceNumber(), status: "draft", clientName: src.clientName, clientEmail: src.clientEmail, clientPhone: src.clientPhone, clientAddress: src.clientAddress, contactId: src.contactId, dealId: src.dealId,
    issueDate: today, dueDate: new Date(today.getTime() + c.dueDays * 86_400_000), subtotal: src.subtotal, discount: src.discount, taxPct: src.taxPct, taxAmount: src.taxAmount, total: src.total,
    notes: src.notes, terms: src.terms, ownerId: user.id, branchId: user.branchId, publicToken: newPublicToken(),
    items: { create: src.items.map((i) => ({ description: i.description, qty: i.qty, rate: i.rate, amount: i.amount, sort: i.sort })) },
  } });
  await invoiceEvent(inv.id, user.id, "created", `Copy of ${src.number}`);
  redirect(`/invoices/${inv.id}/edit`);
}

export async function saveInvoiceSettings(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin && !(can(user, "invoices", "approve") && can(user, "invoices", "edit"))) return { error: "Only Super Admins and invoice approvers can change these." };
  const prefix = str(fd, "prefix").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "INV";
  await saveInvoiceConfig({
    prefix, nextNo: Math.max(1, Math.floor(num(fd, "nextNo")) || 1), taxPct: Math.max(0, num(fd, "taxPct")), dueDays: Math.max(0, Math.floor(num(fd, "dueDays"))),
    terms: str(fd, "terms").slice(0, 2000), bank: str(fd, "bank").slice(0, 1000), approvalAbove: Math.max(0, num(fd, "approvalAbove")),
    approverIds: fd.getAll("approverIds").map(String).filter(Boolean), autoSend: fd.get("autoSend") === "on", remindersOn: fd.get("remindersOn") === "on", reminderDays: Math.max(0, Math.min(30, Math.floor(num(fd, "reminderDays")))),
  });
  await audit(user.id, "update", "setting", "invoices", "Invoice settings");
  return { ok: true, message: "Saved." };
}
