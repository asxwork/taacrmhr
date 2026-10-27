// Payroll pages beyond runs: late-sitting suggestions from attendance, commission from won deals, and the final
// settlement for leavers (last salary, unused leave, unpaid claims, loans and assets), all connected to the records
// payroll already uses.
import { differenceInCalendarDays, endOfMonth, format, getDaysInMonth, startOfDay, startOfMonth } from "date-fns";
import { db } from "./db";
import { loadAttendance } from "./attendance";
import { monthDate, payrollSettings } from "./payroll";
import { encashableBalances, perDayPay } from "./compensation";

/** Days in the month someone stayed at least an hour past their shift end (a "late sitting"). */
export async function lateSittingSuggestions(month: string, employeeIds: string[]) {
  const start = startOfMonth(monthDate(month));
  const end = endOfMonth(start) > new Date() ? startOfDay(new Date()) : endOfMonth(start);
  if (end < start || !employeeIds.length) return new Map<string, number>();
  const att = await loadAttendance(employeeIds, start, end);
  return new Map([...att.entries()].map(([id, days]) => [id, days.filter((d) => d.overtimeMin >= 60).length]));
}

/** Won deals in the month with commission %, per agent (what payroll pays when "commission" is on). */
export async function commissionFor(month: string) {
  const start = startOfMonth(monthDate(month));
  const deals = await db.deal.findMany({
    where: { stage: { kind: "won" }, closedAt: { gte: start, lte: endOfMonth(start) }, commissionPct: { gt: 0 }, ownerId: { not: null } },
    select: { id: true, title: true, value: true, commissionPct: true, closedAt: true, owner: { select: { id: true, name: true, employee: { select: { id: true } } } } },
    orderBy: { closedAt: "asc" },
  });
  return deals.map((d) => ({ ...d, commission: Math.round(((d.value ?? 0) * (d.commissionPct ?? 0)) / 100) }));
}

export type SettlementLine = { kind: "earning" | "deduction" | "info"; label: string; amount: number };

/** What a leaver is owed or owes on their last working day. Read-only; saving it is a separate step. */
export async function computeSettlement(employeeId: string) {
  const emp = await db.employee.findUniqueOrThrow({
    where: { id: employeeId },
    include: { salary: true, assets: { select: { tag: true, name: true } }, loans: { where: { status: "active" }, include: { repayments: true } } },
  });
  const lwd = startOfDay(emp.lastWorkingDay ?? emp.leftAt ?? new Date());
  const month = format(lwd, "yyyy-MM");
  const lines: SettlementLine[] = [];
  const gross = emp.salary?.gross ?? 0;

  // Last month's salary, unless that month's payroll already paid them.
  const paid = await db.payslip.findFirst({ where: { employeeId, run: { month, status: { in: ["approved", "paid"] } } } });
  if (!paid && gross) {
    const days = differenceInCalendarDays(lwd, startOfMonth(lwd)) + 1;
    lines.push({ kind: "earning", label: `Salary for ${format(lwd, "MMMM yyyy")} (${days} day${days === 1 ? "" : "s"})`, amount: Math.round((gross * days) / getDaysInMonth(lwd)) });
  } else if (paid) {
    lines.push({ kind: "info", label: `${format(lwd, "MMMM yyyy")} salary already paid by payroll`, amount: 0 });
  }

  // Unused paid leave, valued at a day's pay.
  if (gross) {
    for (const b of await encashableBalances(employeeId)) {
      lines.push({ kind: "earning", label: `Leave encashment: ${b.available} day${b.available === 1 ? "" : "s"} ${b.name}`, amount: Math.round(b.available * perDayPay(gross)) });
    }
  }
  const [expenses, encashments, items] = await Promise.all([
    db.expense.findMany({ where: { employeeId, status: "approved", runId: null } }),
    db.leaveEncashment.findMany({ where: { employeeId, status: "approved", runId: null } }),
    db.payItem.findMany({ where: { employeeId, month: { gte: month } } }),
  ]);
  for (const e of expenses) lines.push({ kind: "earning", label: `Expense claim: ${e.category}`, amount: Math.round(e.amount) });
  for (const x of encashments) lines.push({ kind: "earning", label: `Approved encashment (${x.days} days ${x.typeName})`, amount: Math.round(x.amount) });
  for (const it of items) lines.push({ kind: it.amount >= 0 ? "earning" : "deduction", label: it.label, amount: Math.round(Math.abs(it.amount)) });

  for (const l of emp.loans) {
    const left = l.amount - l.repayments.reduce((s, r) => s + r.amount, 0);
    if (left > 0.5) lines.push({ kind: "deduction", label: `${l.kind === "advance" ? "Advance" : "Loan"} outstanding`, amount: Math.round(left) });
  }
  const { eobiEmployee } = await payrollSettings();
  if (!paid && gross && emp.salary?.eobi && eobiEmployee) lines.push({ kind: "deduction", label: "EOBI", amount: eobiEmployee });
  if (emp.assets.length) lines.push({ kind: "info", label: `Assets to return: ${emp.assets.map((a) => `${a.tag} ${a.name}`).join(", ")}`, amount: 0 });

  const net = lines.reduce((s, l) => s + (l.kind === "earning" ? l.amount : l.kind === "deduction" ? -l.amount : 0), 0);
  return { emp, lastWorkingDay: lwd, lines, net, expenseIds: expenses.map((e) => e.id), encashmentIds: encashments.map((x) => x.id), loans: emp.loans };
}
