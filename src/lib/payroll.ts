import { endOfMonth, format, getDaysInMonth, max as maxDate, min as minDate, parse, startOfDay, startOfMonth } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { loadAttendance, summarize } from "./attendance";
import { countLeaveDays } from "./leave";
import { notify } from "./notify";
import { scopeWhere } from "./permissions";
import type { SessionUser } from "./auth";
import type { Action } from "./rbac";

export const monthDate = (month: string) => parse(month, "yyyy-MM", new Date());
const r0 = (n: number) => Math.round(n);

/** Pakistan fiscal year: July–June. "2026-10" → "2026-27". */
export function fiscalYearOf(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Annual tax for a taxable income using fixed + rate% above the slab's lower bound. */
export function annualTax(income: number, slabs: { from: number; to: number | null; fixed: number; rate: number }[]) {
  const slab = [...slabs].sort((a, b) => b.from - a.from).find((s) => income > s.from);
  return slab ? slab.fixed + ((income - slab.from) * slab.rate) / 100 : 0;
}

export async function payrollSettings() {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "payroll." } } });
  const get = (k: string, d: string) => rows.find((r) => r.key === `payroll.${k}`)?.value ?? d;
  return {
    eobiEmployee: Number(get("eobiEmployee", "400")) || 0,
    eobiEmployer: Number(get("eobiEmployer", "2000")) || 0,
    latesPerDay: Number(get("latesPerDay", "3")) || 0,
    overtimeRate: Number(get("overtimeRate", "0")) || 0,
    commission: get("commission", "off") === "on",
    /** PKR per late sitting (Custom Payitems → No. Of Late Sittings). */
    lateSittingRate: Number(get("lateSittingRate", "1000")) || 0,
  };
}

/** Employees whose payroll the user may act on (hr.payroll scope; owner = linked login). */
export async function payrollEmployeeWhere(user: SessionUser, action: Action = "view"): Promise<Prisma.EmployeeWhereInput | null> {
  return scopeWhere(user, "hr.payroll", action, { owner: "userId", branch: "branchId" }) as Promise<Prisma.EmployeeWhereInput | null>;
}

type Line = { kind: "earning" | "deduction"; label: string; amount: number; source: string; refId?: string };

/** Builds one payslip (not saved). Expenses picked up are returned so the caller can attach them to the run. */
export async function computePayslip(employeeId: string, month: string, runId: string) {
  const start = startOfMonth(monthDate(month));
  const end = endOfMonth(start);
  const [emp, components, slabs, settings] = await Promise.all([
    db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { salary: true, designation: true, department: true } }),
    db.payComponent.findMany({ orderBy: { sortOrder: "asc" } }),
    db.taxSlab.findMany({ where: { fiscalYear: fiscalYearOf(month) } }),
    payrollSettings(),
  ]);
  if (!emp.salary) return null;

  const daysInMonth = getDaysInMonth(start);
  const from = maxDate([start, startOfDay(emp.joiningDate)]);
  const to = minDate([end, emp.leftAt ? startOfDay(emp.leftAt) : end]);
  if (to < from) return null;
  const employedDays = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 864e5) + 1;

  const gross = emp.salary.gross;
  const perDay = gross / 30;
  const earned = (gross * employedDays) / daysInMonth; // pro-rated for joiners/leavers
  const lines: Line[] = [];

  // Earnings: components split the (pro-rated) gross.
  const basicPct = components.find((c) => c.isBasic)?.pctOfGross ?? 100;
  const basic = (earned * basicPct) / 100;
  let exempt = 0;
  let allocated = 0;
  for (const [i, c] of components.entries()) {
    // The last component takes the rounding remainder so the parts always add up to the salary.
    const amount = i === components.length - 1 && Math.abs(components.reduce((t, x) => t + x.pctOfGross, 0) - 100) < 0.1 ? r0(earned) - allocated : r0((earned * c.pctOfGross) / 100);
    allocated += amount;
    if (amount) lines.push({ kind: "earning", label: c.name, amount, source: "component", refId: c.id });
    if (c.exemptPctOfBasic) exempt += Math.min(amount, (basic * c.exemptPctOfBasic) / 100);
  }
  if (!components.length) lines.push({ kind: "earning", label: "Salary", amount: r0(earned), source: "component" });

  // Attendance-based deductions and overtime.
  const att = (await loadAttendance([emp.id], from, to)).get(emp.id) ?? [];
  const s = summarize(att);
  const absentDays = s.absent + s.half * 0.5;
  if (absentDays) lines.push({ kind: "deduction", label: `Absent (${absentDays} day${absentDays === 1 ? "" : "s"})`, amount: r0(absentDays * perDay), source: "absence" });
  const lateDays = settings.latesPerDay ? Math.floor(s.late / settings.latesPerDay) : 0;
  if (lateDays) lines.push({ kind: "deduction", label: `Late arrivals (${s.late} → ${lateDays} day${lateDays === 1 ? "" : "s"})`, amount: r0(lateDays * perDay), source: "late" });

  const unpaidReqs = await db.leaveRequest.findMany({ where: { employeeId: emp.id, status: "approved", type: { paid: false }, from: { lte: to }, to: { gte: from } } });
  let unpaidLeave = 0;
  for (const l of unpaidReqs) unpaidLeave += await countLeaveDays(emp.id, maxDate([l.from, from]), minDate([l.to, to]), l.halfDay);
  if (unpaidLeave) lines.push({ kind: "deduction", label: `Unpaid leave (${unpaidLeave} day${unpaidLeave === 1 ? "" : "s"})`, amount: r0(unpaidLeave * perDay), source: "unpaid" });

  if (settings.overtimeRate > 0 && s.overtimeMin >= 60) {
    const hourly = gross / 30 / 8;
    lines.push({ kind: "earning", label: `Overtime (${Math.floor(s.overtimeMin / 60)}h)`, amount: r0(hourly * settings.overtimeRate * (s.overtimeMin / 60)), source: "overtime" });
  }

  if (settings.commission && emp.userId) {
    const won = await db.deal.findMany({ where: { ownerId: emp.userId, stage: { kind: "won" }, closedAt: { gte: start, lte: end }, commissionPct: { gt: 0 } }, select: { value: true, commissionPct: true } });
    const total = won.reduce((sum, d) => sum + ((d.value ?? 0) * (d.commissionPct ?? 0)) / 100, 0);
    if (total) lines.push({ kind: "earning", label: `Commission (${won.length} deal${won.length === 1 ? "" : "s"})`, amount: r0(total), source: "commission" });
  }

  // One-off adjustments for this run.
  const adjustments = await db.payrollAdjustment.findMany({ where: { runId, employeeId: emp.id } });
  for (const a of adjustments) {
    lines.push({ kind: a.amount >= 0 ? "earning" : "deduction", label: a.label, amount: r0(Math.abs(a.amount)), source: a.taxable ? "adjustment" : "adjustment-nontax", refId: a.id });
  }

  // Custom pay items for the month: rewards, late sittings, manual commission.
  const payItems = await db.payItem.findMany({ where: { employeeId: emp.id, month } });
  for (const it of payItems) lines.push({ kind: it.amount >= 0 ? "earning" : "deduction", label: it.label, amount: r0(Math.abs(it.amount)), source: it.taxable ? "payitem" : "adjustment-nontax", refId: it.id });

  // Approved leave encashments (HR → People → Leave Encashment): taxable, but a one-off, so not projected over the year.
  const encashments = await db.leaveEncashment.findMany({ where: { employeeId: emp.id, status: "approved", OR: [{ runId: null }, { runId }] } });
  for (const x of encashments) lines.push({ kind: "earning", label: `Leave encashment (${x.days} day${x.days === 1 ? "" : "s"} ${x.typeName})`, amount: r0(x.amount), source: "encashment", refId: x.id });
  const encashed = encashments.reduce((sum, x) => sum + x.amount, 0);

  // Taxable income: everything except tax-free reimbursements/allowances, less attendance deductions.
  const taxable = Math.max(0,
    lines.filter((l) => l.kind === "earning" && l.source !== "adjustment-nontax" && l.source !== "encashment").reduce((sum, l) => sum + l.amount, 0) - exempt
    - lines.filter((l) => l.kind === "deduction" && ["absence", "late", "unpaid", "adjustment"].includes(l.source)).reduce((sum, l) => sum + l.amount, 0));

  // Approved expense claims are reimbursed tax-free.
  const expenses = await db.expense.findMany({ where: { employeeId: emp.id, status: "approved", OR: [{ runId: null }, { runId }] } });
  for (const e of expenses) lines.push({ kind: "earning", label: `Expense: ${e.category}`, amount: r0(e.amount), source: "expense", refId: e.id });

  // Loan / advance installments.
  const loans = await db.loan.findMany({ where: { employeeId: emp.id, status: "active", startMonth: { lte: month } }, include: { repayments: true } });
  for (const l of loans) {
    const repaid = l.repayments.filter((rp) => rp.runId !== runId).reduce((sum, rp) => sum + rp.amount, 0);
    const due = Math.min(l.installment, l.amount - repaid);
    if (due > 0) lines.push({ kind: "deduction", label: `${l.kind === "advance" ? "Advance" : "Loan"} installment`, amount: r0(due), source: "loan", refId: l.id });
  }

  if (emp.salary.eobi && settings.eobiEmployee) lines.push({ kind: "deduction", label: "EOBI", amount: settings.eobiEmployee, source: "eobi" });
  if (emp.salary.pfPct > 0) lines.push({ kind: "deduction", label: `Provident fund (${emp.salary.pfPct}%)`, amount: r0((basic * emp.salary.pfPct) / 100), source: "pf" });

  // Income tax: project this month's taxable pay over the year, take 1/12 of the annual tax.
  // An encashment adds its own slice: the extra annual tax it causes on top of the projected salary.
  const tax = emp.salary.taxExempt || !slabs.length ? 0
    : r0(annualTax(taxable * 12, slabs) / 12 + (encashed ? annualTax(taxable * 12 + encashed, slabs) - annualTax(taxable * 12, slabs) : 0));
  if (tax) lines.push({ kind: "deduction", label: "Income tax", amount: tax, source: "tax" });

  const earnings = lines.filter((l) => l.kind === "earning").reduce((sum, l) => sum + l.amount, 0);
  const deductions = lines.filter((l) => l.kind === "deduction").reduce((sum, l) => sum + l.amount, 0);
  return {
    data: {
      runId, employeeId: emp.id, gross, earnings, deductions, tax, net: earnings - deductions, daysInMonth, employedDays,
      absentDays, unpaidLeave, lateCount: s.late, overtimeMin: s.overtimeMin,
      designation: emp.designation?.name ?? null, department: emp.department?.name ?? null,
      bankName: emp.bankName, accountTitle: emp.accountTitle, accountNumber: emp.accountNumber,
    },
    lines,
    expenseIds: expenses.map((e) => e.id),
    encashmentIds: encashments.map((x) => x.id),
  };
}

/** (Re)builds every payslip of a draft run. Returns employees skipped for having no salary. */
export async function generateRun(runId: string, onlyEmployeeId?: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "draft") throw new Error("Only draft runs can be recalculated.");
  await (await import("./compensation")).applyDueRevisions(); // increments that took effect since approval
  const start = startOfMonth(monthDate(run.month));
  const end = endOfMonth(start);
  const employees = await db.employee.findMany({
    where: {
      ...(onlyEmployeeId && { id: onlyEmployeeId }),
      joiningDate: { lte: end },
      OR: [{ leftAt: null }, { leftAt: { gte: start } }],
    },
    include: { salary: { select: { id: true } } },
    orderBy: { fullName: "asc" },
  });

  await db.expense.updateMany({ where: { runId, status: "approved", ...(onlyEmployeeId && { employeeId: onlyEmployeeId }) }, data: { runId: null } });
  await db.leaveEncashment.updateMany({ where: { runId, status: "approved", ...(onlyEmployeeId && { employeeId: onlyEmployeeId }) }, data: { runId: null } });
  await db.payslip.deleteMany({ where: { runId, ...(onlyEmployeeId && { employeeId: onlyEmployeeId }) } });

  const missing: string[] = [];
  for (const e of employees) {
    if (!e.salary) { missing.push(e.fullName); continue; }
    const slip = await computePayslip(e.id, run.month, runId);
    if (!slip) continue;
    await db.payslip.create({ data: { ...slip.data, lines: { create: slip.lines.map((l, i) => ({ kind: l.kind, label: l.label, amount: l.amount, source: l.source, refId: l.refId ?? null, sortOrder: i })) } } });
    if (slip.expenseIds.length) await db.expense.updateMany({ where: { id: { in: slip.expenseIds } }, data: { runId } });
    if (slip.encashmentIds.length) await db.leaveEncashment.updateMany({ where: { id: { in: slip.encashmentIds } }, data: { runId } });
  }
  return { missing };
}

/** Approve: locks figures, records loan repayments, marks expenses paid and lets employees see their payslips. */
export async function approveRun(runId: string, userId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { payslips: { include: { lines: true, employee: { select: { userId: true } } } } } });
  if (run.status !== "draft") return;
  for (const p of run.payslips) {
    for (const l of p.lines.filter((x) => x.source === "loan" && x.refId)) {
      await db.loanRepayment.create({ data: { loanId: l.refId!, amount: l.amount, runId } });
      const loan = await db.loan.findUnique({ where: { id: l.refId! }, include: { repayments: true } });
      if (loan && loan.repayments.reduce((s, r) => s + r.amount, 0) >= loan.amount - 0.5) await db.loan.update({ where: { id: loan.id }, data: { status: "closed" } });
    }
  }
  await db.expense.updateMany({ where: { runId, status: "approved" }, data: { status: "paid" } });
  await db.leaveEncashment.updateMany({ where: { runId, status: "approved" }, data: { status: "paid" } });
  await db.payrollRun.update({ where: { id: runId }, data: { status: "approved", approvedById: userId, approvedAt: new Date() } });
  const { renderTemplate } = await import("./notify-templates");
  for (const p of run.payslips) {
    const msg = await renderTemplate("payslip_ready", { month: format(monthDate(run.month), "MMMM yyyy"), name: "" });
    await notify(p.employee.userId, msg.title, { body: msg.body, link: `/payslips/${p.id}`, email: true });
  }
}

/** Back to draft (only before it's paid): undoes loan repayments and expense payouts made by approval. */
export async function reopenRun(runId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "approved") return;
  const reps = await db.loanRepayment.findMany({ where: { runId }, select: { loanId: true } });
  await db.loanRepayment.deleteMany({ where: { runId } });
  await db.loan.updateMany({ where: { id: { in: reps.map((r) => r.loanId) }, status: "closed" }, data: { status: "active" } });
  await db.expense.updateMany({ where: { runId, status: "paid" }, data: { status: "approved" } });
  await db.leaveEncashment.updateMany({ where: { runId, status: "paid" }, data: { status: "approved" } });
  await db.payrollRun.update({ where: { id: runId }, data: { status: "draft", approvedById: null, approvedAt: null } });
}
