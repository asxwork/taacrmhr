// Numbers for the HR dashboard (ResourceInn layout). Company widgets respect the viewer's attendance scope; the
// "my" widgets (clock in/out, leave summary, attendance summary, check-in trend, my team) are the viewer's own.
import { addDays, differenceInCalendarDays, differenceInMonths, differenceInYears, format, isSameDay, setYear, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { loadAttendance, type DayResult } from "./attendance";
import { balancesFor } from "./leave";

type Row = { name: string; value: number; display: string; href?: string };
const pct = (n: number, total: number) => (total ? `${n} (${Math.round((n / total) * 1000) / 10}%)` : String(n));
function grouped<T>(items: T[], key: (t: T) => string | null | undefined, href?: (k: string, t: T) => string | undefined): Row[] {
  const map = new Map<string, { n: number; first: T }>();
  for (const it of items) {
    const k = key(it) || "Not set";
    const cur = map.get(k);
    map.set(k, { n: (cur?.n ?? 0) + 1, first: cur?.first ?? it });
  }
  return [...map.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => ({ name: k, value: v.n, display: pct(v.n, items.length), href: k === "Not set" ? undefined : href?.(k, v.first) }));
}

/** Next occurrence of a yearly date (birthday, work anniversary) on or after today. */
function nextYearly(d: Date, today: Date) {
  let n = setYear(d, today.getFullYear());
  if (n < today) n = setYear(d, today.getFullYear() + 1);
  return n;
}

export async function companyWidgets(scope: Prisma.EmployeeWhereInput) {
  const now = new Date();
  const today = startOfDay(now);
  const all = await db.employee.findMany({
    where: scope,
    select: {
      id: true, fullName: true, photo: true, gender: true, dob: true, joiningDate: true, status: true, employmentType: true, leftAt: true, exitType: true,
      lastWorkingDay: true, probationEnd: true, branchId: true, departmentId: true, designationId: true, code: true,
      branch: { select: { name: true, address: true } }, department: { select: { name: true } }, designation: { select: { name: true } },
    },
  });
  const active = all.filter((e) => e.status !== "left");
  const ids = active.map((e) => e.id);

  const kpis = {
    active: active.length,
    separations30: active.filter((e) => e.status === "notice" && e.lastWorkingDay && e.lastWorkingDay <= addDays(today, 30)).length,
    confirmations30: active.filter((e) => e.status === "probation" && e.probationEnd && e.probationEnd <= addDays(today, 30)).length,
    separationsMonth: all.filter((e) => e.leftAt && e.leftAt >= startOfMonth(now)).length,
  };

  const birthdays = active.filter((e) => e.dob).map((e) => ({ e, on: nextYearly(e.dob!, today) }))
    .filter((x) => differenceInCalendarDays(x.on, today) <= 30).sort((a, b) => +a.on - +b.on).slice(0, 8);
  const anniversaries = active.map((e) => ({ e, on: nextYearly(e.joiningDate, today) }))
    .filter((x) => differenceInCalendarDays(x.on, today) <= 30 && differenceInYears(x.on, x.e.joiningDate) >= 1)
    .sort((a, b) => +a.on - +b.on).slice(0, 8).map((x) => ({ ...x, years: differenceInYears(x.on, x.e.joiningDate) }));
  const joiners = active.filter((e) => e.joiningDate >= subDays(today, 30)).sort((a, b) => +b.joiningDate - +a.joiningDate).slice(0, 8);

  const ageBucket = (e: (typeof active)[number]) => {
    if (!e.dob) return null;
    const a = differenceInYears(now, e.dob);
    return a <= 20 ? "0-20 Years" : a <= 30 ? "21-30 Years" : a <= 40 ? "31-40 Years" : a <= 50 ? "41-50 Years" : a <= 60 ? "51-60 Years" : "60+ Years";
  };
  const serviceBucket = (e: (typeof active)[number]) => {
    const m = differenceInMonths(now, e.joiningDate);
    return m < 6 ? "0-6 Months" : m < 12 ? "6 Months-1 Year" : m < 36 ? "1-3 Year" : m < 60 ? "3-5 Year" : m < 120 ? "5-10 Year" : "10+ Year";
  };
  const typeLabel: Record<string, string> = { permanent: "Permanent", contract: "Contractual", intern: "Intern", consultant: "Consultant" };
  const genderLabel = (g: string | null) => (g === "male" ? "Male" : g === "female" ? "Female" : g ? "Others" : null);
  const exitLabel: Record<string, string> = { resigned: "Resigned", terminated: "Terminated", other: "Other" };

  const headcount = {
    age: grouped(active, ageBucket),
    branch: grouped(active, (e) => e.branch?.name, (_, e) => `/hr/employees?branch=${e.branchId}`),
    department: grouped(active, (e) => e.department?.name, (_, e) => `/hr/employees?dept=${e.departmentId}`),
    designation: grouped(active, (e) => e.designation?.name, (_, e) => `/hr/employees?desig=${e.designationId}`),
    type: grouped(active, (e) => typeLabel[e.employmentType] ?? e.employmentType, (_, e) => `/hr/employees?type=${e.employmentType}`),
    location: grouped(active, (e) => e.branch?.address ?? e.branch?.name, (_, e) => `/hr/employees?branch=${e.branchId}`),
    service: grouped(active, serviceBucket),
    gender: grouped(active, (e) => genderLabel(e.gender), (_, e) => `/hr/employees?gender=${e.gender}`),
    joinersGender: grouped(active.filter((e) => e.joiningDate >= subDays(today, 90)), (e) => genderLabel(e.gender)),
    attrition: grouped(all.filter((e) => e.leftAt && e.leftAt >= subMonths(today, 12)), (e) => exitLabel[e.exitType ?? ""] ?? "Other", () => "/hr/exits?tab=left"),
  };

  const expenses = await db.expense.groupBy({
    by: ["category"], where: { employeeId: { in: ids }, date: { gte: startOfMonth(now) }, status: { in: ["pending", "approved", "paid"] } },
    _sum: { amount: true }, _count: true,
  });
  const expenseRows: Row[] = expenses.sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0)).map((x) => ({
    name: x.category, value: x._sum.amount ?? 0, display: `PKR ${Math.round(x._sum.amount ?? 0).toLocaleString("en-PK")} · ${x._count}`, href: "/hr/expenses",
  }));

  // One attendance pass for the last 12 months: month-wise absents and this month's daily report.
  // Days before the first punch on record are before attendance tracking began, not absences.
  const firstPunch = await db.attendancePunch.findFirst({ orderBy: { at: "asc" }, select: { at: true } });
  const yearAgo = startOfMonth(subMonths(now, 11));
  const from = firstPunch && startOfDay(firstPunch.at) > yearAgo ? startOfDay(firstPunch.at) : yearAgo;
  const att = ids.length && firstPunch ? await loadAttendance(ids, from, today) : new Map<string, DayResult[]>();
  const days = [...att.values()].flat();
  const months = Array.from({ length: 12 }, (_, i) => startOfMonth(subMonths(now, 11 - i)));
  const monthAbsents = months.map((m) => days.filter((d) => d.status === "absent" && d.date >= m && d.date < startOfMonth(addDays(m, 32))).length);
  const monthDays = Array.from({ length: differenceInCalendarDays(today, startOfMonth(now)) + 1 }, (_, i) => addDays(startOfMonth(now), i));
  const onDay = (day: Date, test: (d: DayResult) => boolean) => days.filter((d) => isSameDay(d.date, day) && test(d)).length;
  const monthly = {
    labels: monthDays.map((d) => format(d, "d MMM")),
    presents: monthDays.map((d) => onDay(d, (x) => ["present", "late", "half", "missing"].includes(x.status))),
    absents: monthDays.map((d) => onDay(d, (x) => x.status === "absent")),
    leaves: monthDays.map((d) => onDay(d, (x) => x.status === "leave")),
  };

  const posts = await db.hrPost.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const postEmployees = new Map((await db.employee.findMany({ where: { id: { in: posts.map((p) => p.employeeId).filter(Boolean) as string[] } }, select: { id: true, fullName: true, photo: true } })).map((e) => [e.id, e]));

  return {
    kpis, birthdays, anniversaries, joiners, headcount, expenseRows,
    monthAbsents: { labels: months.map((m) => format(m, "MMM yyyy")), values: monthAbsents },
    monthly,
    posts: (["accolade", "news", "wisdom"] as const).map((kind) => ({ kind, rows: posts.filter((p) => p.kind === kind).slice(0, 4).map((p) => ({ ...p, employee: p.employeeId ? postEmployees.get(p.employeeId) ?? null : null })) })),
  };
}

export async function myWidgets(userId: string) {
  const emp = await db.employee.findUnique({
    where: { userId },
    select: { id: true, shift: true, branch: { select: { lat: true } }, reports: { where: { status: { not: "left" } }, select: { id: true, fullName: true, photo: true, designation: { select: { name: true } } } } },
  });
  if (!emp) return null;
  const now = new Date();
  const today = startOfDay(now);
  const from = subDays(today, 30);
  const [att, punches, balances, teamAtt] = await Promise.all([
    loadAttendance([emp.id], from < startOfMonth(now) ? from : startOfMonth(now), today),
    db.attendancePunch.findMany({ where: { employeeId: emp.id, at: { gte: today } }, orderBy: { at: "asc" } }),
    balancesFor(emp.id).catch(() => []),
    emp.reports.length ? loadAttendance(emp.reports.map((r) => r.id), today, today) : new Map<string, DayResult[]>(),
  ]);
  const days = att.get(emp.id) ?? [];
  const month = days.filter((d) => d.date >= startOfMonth(now) && d.date <= today);
  const shift = emp.shift;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  const shiftMin = shift ? ((toMin(shift.end) - toMin(shift.start) + 1440) % 1440 || 480) : 540;
  const planned = month.filter((d) => !["weekend", "holiday", "leave"].includes(d.status) && d.date < today);
  const expected = planned.length * shiftMin;
  const worked = planned.reduce((s, d) => s + d.workedMin, 0);
  const trend = days.filter((d) => d.date >= from && d.checkIn);

  return {
    employeeId: emp.id, shift, punches, balances, needsLocation: emp.branch?.lat != null,
    summary: { shifts: planned.length, expected, worked, short: Math.max(0, expected - worked) },
    trend: { labels: trend.map((d) => format(d.date, "d MMM")), values: trend.map((d) => d.checkIn!.getHours() * 60 + d.checkIn!.getMinutes()) },
    team: emp.reports.map((r) => ({ ...r, today: teamAtt.get(r.id)?.[0] ?? null })),
  };
}
