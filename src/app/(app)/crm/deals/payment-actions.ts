"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { editableDealFor, fmtPKR, logSystem, parseAmount } from "@/lib/crm";
import { FREQUENCIES, PAYMENT_METHODS, buildSchedule } from "@/lib/inventory";
import { str, type FormState } from "@/lib/utils";

const pct = (fd: FormData, k: string) => {
  const n = parseFloat(str(fd, k));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

/** Creates or regenerates a deal's schedule. Refuses once any payment is recorded. */
export async function savePaymentPlan(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.deals", "edit");
  const deal = await editableDealFor(user, str(fd, "dealId"));
  if (!deal) return { error: "You can't edit this deal." };

  const existing = await db.paymentPlan.findUnique({ where: { dealId: deal.id }, include: { items: true } });
  if (existing?.items.some((i) => i.paidAmount > 0)) return { error: "Payments are already recorded, so the schedule can't be regenerated." };

  const total = parseAmount(str(fd, "total"));
  const downPct = pct(fd, "downPct");
  const possessionPct = pct(fd, "possessionPct") ?? 0;
  const installments = Math.round(Number(str(fd, "installments")));
  const frequency = str(fd, "frequency");
  const startDate = new Date(str(fd, "startDate"));
  if (!total || total <= 0) return { error: "Enter the total amount." };
  if (downPct == null) return { error: "Down payment % must be between 0 and 100." };
  if (downPct + possessionPct > 100) return { error: "Down payment + possession can't exceed 100%." };
  if (!Number.isInteger(installments) || installments < 0 || installments > 240) return { error: "Installments must be 0–240." };
  if (!FREQUENCIES.some((f) => f.value === frequency)) return { error: "Choose a frequency." };
  if (Number.isNaN(startDate.getTime())) return { error: "Choose a start date." };
  if (installments === 0 && downPct + possessionPct < 100) return { error: "With no installments, down payment + possession must be 100%." };

  const items = buildSchedule({ total, downPct, installments, frequency, possessionPct, startDate });
  await db.$transaction([
    db.paymentPlan.deleteMany({ where: { dealId: deal.id } }),
    db.paymentPlan.create({ data: { dealId: deal.id, total, downPct, installments, frequency, possessionPct, startDate, items: { create: items } } }),
  ]);
  await logSystem({ dealId: deal.id }, `Payment plan ${existing ? "updated" : "created"}: ${fmtPKR(total)}, ${downPct}% down, ${installments} installments`, user.id);
  await audit(user.id, existing ? "update" : "create", "paymentPlan", deal.id, `Payment plan for ${deal.title}`);
  revalidatePath(`/crm/deals/${deal.id}`, "layout");
  return { ok: true, message: "Schedule generated." };
}

async function installmentFor(fd: FormData) {
  const user = await requirePermission("crm.deals", "edit");
  const inst = await db.installment.findUnique({ where: { id: str(fd, "installmentId") }, include: { plan: true } });
  if (!inst || !(await editableDealFor(user, inst.plan.dealId))) return null;
  return { user, inst };
}

export async function recordPayment(_: FormState, fd: FormData): Promise<FormState> {
  const found = await installmentFor(fd);
  if (!found) return { error: "You can't record payments on this deal." };
  const { user, inst } = found;

  const amount = parseAmount(str(fd, "amount"));
  if (!amount || amount <= 0) return { error: "Enter the amount received." };
  const paidOn = str(fd, "paidAt") ? new Date(str(fd, "paidAt")) : new Date();
  const method = PAYMENT_METHODS.includes(str(fd, "method") as (typeof PAYMENT_METHODS)[number]) ? str(fd, "method") : null;

  const paidAmount = inst.paidAmount + amount;
  await db.installment.update({
    where: { id: inst.id },
    data: { paidAmount, paidAt: paidAmount >= inst.amount ? paidOn : inst.paidAt, method, reference: str(fd, "reference") || inst.reference },
  });
  await logSystem({ dealId: inst.plan.dealId }, `Payment received: ${fmtPKR(amount)} for ${inst.label}${method ? ` (${method})` : ""}`, user.id);
  await audit(user.id, "update", "installment", inst.id, `Recorded ${fmtPKR(amount)} against ${inst.label}`);
  revalidatePath(`/crm/deals/${inst.plan.dealId}`, "layout");
  return { ok: true };
}

export async function undoPayment(fd: FormData) {
  const found = await installmentFor(fd);
  if (!found) return;
  const { user, inst } = found;
  await db.installment.update({ where: { id: inst.id }, data: { paidAmount: 0, paidAt: null, method: null, reference: null } });
  await logSystem({ dealId: inst.plan.dealId }, `Payment for ${inst.label} reversed`, user.id);
  await audit(user.id, "update", "installment", inst.id, `Reversed payment on ${inst.label}`);
  revalidatePath(`/crm/deals/${inst.plan.dealId}`, "layout");
}
