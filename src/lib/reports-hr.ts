import type { Prisma } from "@prisma/client";
import { endOfDay, endOfMonth, format, min, startOfMonth, subMonths } from "date-fns";
import { db } from "./db";
import { scopeWhere } from "./permissions";
import { loadAttendance, summarize } from "./attendance";
import type { SessionUser } from "./auth";

/** HR report datasets limited to the user's reports.hr scope (owner = the employee's login). Null when they have none. */
export async function hrReport(user: SessionUser, f: { from: Date; to: Date; branchId?: string }) {
  const scope = (await scopeWhere(user, "reports.hr", "view", { owner: "userId", branch: "branchId" })) as Prisma.EmployeeWhereInput | null;
  if (!scope) return null;
  const inScope: Prisma.EmployeeWhereInput = { AND: [scope, f.branchId ? { branchId: f.branchId } : {}] };
  const current: Prisma.EmployeeWhereInput = { AND: [inScope, { status: { not: "left" } }] };

  const [employees, joiners, leavers, leaves, runs] = await Promise.all([
    db.employee.findMany({ where: inScope, select: { id: true, code: true, fullName: true, status: true, joiningDate: true, leftAt: true, gender: true, department: { select: { name: true } }, branch: { select: { name: true } } } }),
    db.employee.count({ where: { AND: [inScope, { joiningDate: { gte: f.from, lte: f.to } }] } }),
    db.employee.findMany({ where: { AND: [inScope, { leftAt: { gte: f.from, lte: f.to } }] }, select: { fullName: true, leftAt: true } }),
    db.leaveRequest.findMany({ where: { status: "approved", from: { lte: f.to }, to: { gte: f.from }, employee: inScope }, include: { type: { select: { name: true } } } }),
    db.payrollRun.findMany({
      where: { month: { gte: format(f.from, "yyyy-MM"), lte: format(f.to, "yyyy-MM") }, status: { in: ["approved", "paid"] } },
      include: { payslips: { where: { employee: inScope }, select: { gross: true, net: true, tax: true } } },
      orderBy: { month: "asc" },
    }),
  ]);
  const active = employees.filter((e) => e.status !== "left");

  const group = (key: (e: (typeof active)[number]) => string) => {
    const m = new Map<string, number>();
    for (const e of active) m.set(key(e), (m.get(key(e)) ?? 0) + 1);
    return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  // Headcount at each month end over the last 12 months up to the period end.
  const trend = Array.from({ length: 12 }, (_, i) => {
    const end = endOfMonth(subMonths(f.to, 11 - i));
    const value = employees.filter((e) => e.joiningDate <= end && (!e.leftAt || e.leftAt > end)).length;
    return { label: format(end, "MMMM yyyy"), short: format(end, "MMM"), value };
  });

  const leaveByType = new Map<string, number>();
  for (const l of leaves) leaveByType.set(l.type.name, (leaveByType.get(l.type.name) ?? 0) + l.days);

  // Attendance only up to today; at most 300 people to keep the page quick.
  const attTo = min([f.to, endOfDay(new Date())]);
  const people = active.slice(0, 300);
  const att = attTo >= f.from ? await loadAttendance(people.map((e) => e.id), f.from, attTo) : new Map();
  const attendance = people.map((e) => ({ ...e, ...summarize(att.get(e.id) ?? []) })).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const tot = attendance.reduce((s, r) => ({ present: s.present + r.present + r.half / 2, due: s.due + r.present + r.half + r.absent + r.missing }), { present: 0, due: 0 });

  const avgHead = (employees.filter((e) => e.joiningDate <= f.from && (!e.leftAt || e.leftAt > f.from)).length + active.length) / 2;
  return {
    kpis: {
      headcount: active.length, probation: active.filter((e) => e.status === "probation").length,
      joiners, leavers: leavers.length, attrition: avgHead ? leavers.length / avgHead : null,
      attendanceRate: tot.due ? tot.present / tot.due : null,
      leaveDays: leaves.reduce((s, l) => s + l.days, 0),
      payroll: runs.reduce((s, r) => s + r.payslips.reduce((t, p) => t + p.gross, 0), 0),
    },
    byDepartment: group((e) => e.department?.name ?? "No department"),
    byBranch: group((e) => e.branch?.name ?? "No branch"),
    byGender: group((e) => (e.gender ? e.gender[0]!.toUpperCase() + e.gender.slice(1) : "Not set")),
    trend,
    leaveByType: [...leaveByType].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    payroll: runs.map((r) => ({ month: r.month, label: format(startOfMonth(new Date(`${r.month}-01T00:00:00`)), "MMM yyyy"), gross: r.payslips.reduce((s, p) => s + p.gross, 0), net: r.payslips.reduce((s, p) => s + p.net, 0), tax: r.payslips.reduce((s, p) => s + p.tax, 0), count: r.payslips.length })),
    attendance,
    leavers,
  };
}
