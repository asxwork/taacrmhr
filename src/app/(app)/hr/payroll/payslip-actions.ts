"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { smtpConfigured } from "@/lib/mail";
import { emailPayslips, numberPayslips } from "@/lib/payslip-doc";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

const noSmtp = { error: "Email isn't set up yet (SMTP_HOST / SMTP_USER / SMTP_PASS on the server), so nothing was sent." };

/** Email one payslip to its employee again. */
export async function resendPayslip(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.payroll", "edit");
  const slip = await db.payslip.findUnique({ where: { id: str(fd, "id") }, select: { id: true, runId: true, run: { select: { status: true } } } });
  if (!slip || slip.run.status === "draft") return { error: "Approve the payroll first." };
  if (!smtpConfigured()) return noSmtp;
  await numberPayslips(slip.runId);
  const r = await emailPayslips(slip.runId, [slip.id]);
  await audit(user.id, "update", "payslip", slip.id, "Payslip emailed");
  revalidatePath(`/payslips/${slip.id}`);
  return r.sent ? { ok: true, message: "Payslip emailed." } : { error: r.skipped ? "This employee has no email address on their profile." : "The email could not be sent; see System health → Email log." };
}

/** Email every payslip of an approved run (e.g. after fixing emails or SMTP). */
export async function emailRun(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.payroll", "edit");
  const run = await db.payrollRun.findUnique({ where: { id: str(fd, "runId") }, select: { id: true, month: true, status: true } });
  if (!run || run.status === "draft") return { error: "Approve the payroll first." };
  if (!smtpConfigured()) return noSmtp;
  await numberPayslips(run.id);
  const r = await emailPayslips(run.id);
  await audit(user.id, "update", "payroll", run.id, `Payslips ${run.month} emailed: ${r.sent} sent, ${r.skipped} without email, ${r.failed} failed`);
  revalidatePath(`/hr/payroll/${run.month}`);
  return { ok: true, message: `${r.sent} sent${r.skipped ? ` · ${r.skipped} have no email` : ""}${r.failed ? ` · ${r.failed} failed` : ""}.` };
}
