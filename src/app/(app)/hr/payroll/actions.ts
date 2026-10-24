"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { approveRun, generateRun, reopenRun } from "@/lib/payroll";
import { str, type FormState } from "@/lib/utils";

/** Payroll changes affect everyone's pay, so they need company-wide payroll rights. */
async function requirePayrollAdmin(action: "edit" | "approve" = "edit") {
  const user = await requireUser();
  if (!user.isSuperAdmin && scopeFor(user, "hr.payroll", action) !== "all") redirect("/no-access");
  return user;
}

export async function createRun(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePayrollAdmin();
  const month = str(fd, "month");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "Choose a month." };
  if (await db.payrollRun.findUnique({ where: { month } })) return { error: `A payroll for ${month} already exists.` };
  const run = await db.payrollRun.create({ data: { month, createdById: user.id } });
  const res = await generateRun(run.id);
  await audit(user.id, "create", "payrollRun", run.id, `Created payroll ${month}`);
  revalidatePath("/hr/payroll");
  redirect(`/hr/payroll/${month}${res.missing.length ? `?missing=${encodeURIComponent(res.missing.join(", "))}` : ""}`);
}

export async function recalculateRun(fd: FormData) {
  const user = await requirePayrollAdmin();
  const run = await db.payrollRun.findUnique({ where: { id: str(fd, "runId") } });
  if (!run || run.status !== "draft") return;
  await generateRun(run.id);
  await audit(user.id, "update", "payrollRun", run.id, `Recalculated payroll ${run.month}`);
  revalidatePath(`/hr/payroll/${run.month}`);
}

export async function approvePayroll(fd: FormData) {
  const user = await requirePayrollAdmin("approve");
  const run = await db.payrollRun.findUnique({ where: { id: str(fd, "runId") } });
  if (!run || run.status !== "draft") return;
  await approveRun(run.id, user.id);
  await audit(user.id, "update", "payrollRun", run.id, `Approved payroll ${run.month}`);
  revalidatePath(`/hr/payroll/${run.month}`);
}

export async function markPaid(fd: FormData) {
  const user = await requirePayrollAdmin("approve");
  const run = await db.payrollRun.findUnique({ where: { id: str(fd, "runId") } });
  if (!run || run.status !== "approved") return;
  await db.payrollRun.update({ where: { id: run.id }, data: { status: "paid", paidAt: new Date() } });
  await audit(user.id, "update", "payrollRun", run.id, `Marked payroll ${run.month} as paid`);
  revalidatePath(`/hr/payroll/${run.month}`);
}

export async function reopenPayroll(fd: FormData) {
  const user = await requirePayrollAdmin("approve");
  const run = await db.payrollRun.findUnique({ where: { id: str(fd, "runId") } });
  if (!run || run.status !== "approved") return;
  await reopenRun(run.id);
  await audit(user.id, "update", "payrollRun", run.id, `Reopened payroll ${run.month}`);
  revalidatePath(`/hr/payroll/${run.month}`);
}

export async function deleteRun(fd: FormData) {
  const user = await requirePayrollAdmin();
  const run = await db.payrollRun.findUnique({ where: { id: str(fd, "runId") } });
  if (!run || run.status !== "draft") return;
  await db.expense.updateMany({ where: { runId: run.id }, data: { runId: null } });
  await db.payrollRun.delete({ where: { id: run.id } });
  await audit(user.id, "delete", "payrollRun", run.id, `Deleted draft payroll ${run.month}`);
  redirect("/hr/payroll");
}

export async function addAdjustment(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePayrollAdmin();
  const run = await db.payrollRun.findUnique({ where: { id: str(fd, "runId") } });
  if (!run || run.status !== "draft") return { error: "Only draft payrolls can be adjusted." };
  const employeeId = str(fd, "employeeId");
  const label = str(fd, "label");
  const amount = parseFloat(str(fd, "amount").replace(/,/g, ""));
  if (!label || !Number.isFinite(amount) || amount === 0) return { error: "Enter a label and a non-zero amount (negative to deduct)." };
  await db.payrollAdjustment.create({ data: { runId: run.id, employeeId, label, amount, taxable: fd.get("taxable") === "on", createdById: user.id } });
  await generateRun(run.id, employeeId);
  await audit(user.id, "update", "payrollRun", run.id, `Adjustment “${label}” ${amount} for employee ${employeeId}`);
  revalidatePath(`/hr/payroll/${run.month}`);
  return { ok: true, message: "Adjustment added." };
}

export async function removeAdjustment(fd: FormData) {
  await requirePayrollAdmin();
  const adj = await db.payrollAdjustment.findUnique({ where: { id: str(fd, "id") }, include: { run: true } });
  if (!adj || adj.run.status !== "draft") return;
  await db.payrollAdjustment.delete({ where: { id: adj.id } });
  await generateRun(adj.runId, adj.employeeId);
  revalidatePath(`/hr/payroll/${adj.run.month}`);
}

export async function saveSalary(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePayrollAdmin();
  const employeeId = str(fd, "employeeId");
  const gross = parseFloat(str(fd, "gross").replace(/,/g, ""));
  const pfPct = parseFloat(str(fd, "pfPct")) || 0;
  if (!Number.isFinite(gross) || gross <= 0) return { error: "Enter the monthly gross salary." };
  if (pfPct < 0 || pfPct > 20) return { error: "Provident fund must be 0–20%." };
  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { salary: true } });
  if (!emp) return { error: "Employee not found." };
  const data = { gross, pfPct, eobi: fd.get("eobi") === "on", taxExempt: fd.get("taxExempt") === "on", effectiveFrom: new Date(str(fd, "effectiveFrom") || Date.now()) };
  await db.salaryProfile.upsert({ where: { employeeId }, update: data, create: { employeeId, ...data } });
  if (emp.salary && emp.salary.gross !== gross) {
    await db.employeeEvent.create({ data: { employeeId, type: "note", date: data.effectiveFrom, title: `Salary changed: ${emp.salary.gross.toLocaleString("en-PK")} → ${gross.toLocaleString("en-PK")}`, byId: user.id } });
  }
  await audit(user.id, "update", "salary", employeeId, `Salary for ${emp.fullName} set to ${gross}`);
  revalidatePath("/hr/payroll");
  return { ok: true, message: "Salary saved." };
}

export async function savePayrollSettings(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePayrollAdmin();
  const set = (key: string, value: string) => db.setting.upsert({ where: { key: `payroll.${key}` }, update: { value }, create: { key: `payroll.${key}`, value } });
  for (const k of ["eobiEmployee", "eobiEmployer", "latesPerDay", "overtimeRate"]) {
    const v = parseFloat(str(fd, k));
    if (!Number.isFinite(v) || v < 0) return { error: "Numbers must be zero or more." };
    await set(k, String(v));
  }
  await set("commission", fd.get("commission") === "on" ? "on" : "off");

  // Components: name / % pairs; percentages must add up to 100.
  const comps = await db.payComponent.findMany({ orderBy: { sortOrder: "asc" } });
  let total = 0;
  for (const c of comps) total += parseFloat(str(fd, `pct:${c.id}`)) || 0;
  if (comps.length && Math.abs(total - 100) > 0.05) return { error: `Salary components must add up to 100% (now ${total.toFixed(2)}%).` };
  for (const c of comps) {
    await db.payComponent.update({ where: { id: c.id }, data: { name: str(fd, `name:${c.id}`) || c.name, pctOfGross: parseFloat(str(fd, `pct:${c.id}`)) || 0 } });
  }
  await audit(user.id, "update", "setting", "payroll", "Updated payroll settings");
  revalidatePath("/hr/payroll");
  return { ok: true, message: "Saved." };
}

export async function saveTaxSlabs(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePayrollAdmin();
  const fiscalYear = str(fd, "fiscalYear");
  if (!/^\d{4}-\d{2}$/.test(fiscalYear)) return { error: "Fiscal year looks like 2026-27." };
  const rows: { from: number; to: number | null; fixed: number; rate: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const from = str(fd, `from${i}`);
    if (from === "") continue;
    const to = str(fd, `to${i}`);
    const row = { from: Number(from), to: to === "" ? null : Number(to), fixed: Number(str(fd, `fixed${i}`) || 0), rate: Number(str(fd, `rate${i}`) || 0) };
    if ([row.from, row.fixed, row.rate].some((n) => !Number.isFinite(n) || n < 0) || (row.to != null && row.to <= row.from) || row.rate > 100) return { error: `Check row ${i + 1}.` };
    rows.push(row);
  }
  if (!rows.length) return { error: "Add at least one slab." };
  await db.$transaction([db.taxSlab.deleteMany({ where: { fiscalYear } }), db.taxSlab.createMany({ data: rows.map((r) => ({ ...r, fiscalYear })) })]);
  await audit(user.id, "update", "taxSlab", fiscalYear, `Updated tax slabs ${fiscalYear}`);
  revalidatePath("/hr/payroll");
  return { ok: true, message: `Tax slabs for ${fiscalYear} saved.` };
}

/** HR can also stop a loan or record a manual repayment (e.g. paid back in cash). */
export async function recordLoanPayment(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user, "hr.expenses", "edit")) return { error: "Not allowed." };
  const loan = await db.loan.findUnique({ where: { id: str(fd, "loanId") }, include: { repayments: true } });
  const amount = parseFloat(str(fd, "amount"));
  if (!loan || loan.status !== "active") return { error: "Loan not active." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount." };
  await db.loanRepayment.create({ data: { loanId: loan.id, amount, note: str(fd, "note") || "Manual repayment" } });
  if (loan.repayments.reduce((s, r) => s + r.amount, 0) + amount >= loan.amount - 0.5) await db.loan.update({ where: { id: loan.id }, data: { status: "closed" } });
  await audit(user.id, "update", "loan", loan.id, `Recorded repayment ${amount}`);
  revalidatePath("/hr/expenses");
  return { ok: true, message: "Repayment recorded." };
}
