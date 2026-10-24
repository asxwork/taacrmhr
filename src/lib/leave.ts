import { differenceInCalendarMonths, eachDayOfInterval, endOfYear, getMonth, isSameDay, max as maxDate, min as minDate, startOfDay, startOfYear } from "date-fns";
import { db } from "./db";
import { defaultShift, isWorkDay } from "./attendance";
import { submitRequest } from "./approvals";
import { addEvent } from "./hr";

const half = (n: number) => Math.round(n * 2) / 2;

type TypeLike = { id: string; quota: number; paid: boolean; accrual: string; gender: string | null; minServiceMonths: number; name: string };
type EmpLike = { id: string; gender: string | null; joiningDate: Date };

/** Days the employee is entitled to for the year as of `asOf` (Infinity = unlimited unpaid leave). */
export function entitlement(type: TypeLike, emp: EmpLike, year: number, asOf = new Date()) {
  if (type.gender && emp.gender !== type.gender) return 0;
  if (differenceInCalendarMonths(asOf, emp.joiningDate) < type.minServiceMonths) return 0;
  if (!type.paid && type.quota === 0) return Infinity;
  const yearStart = startOfYear(new Date(year, 0, 1));
  const from = maxDate([yearStart, startOfDay(emp.joiningDate)]);
  if (from > endOfYear(yearStart)) return 0;
  if (type.accrual === "monthly") {
    const until = minDate([asOf, endOfYear(yearStart)]);
    if (until < from) return 0;
    const months = differenceInCalendarMonths(until, from) + 1;
    return Math.min(type.quota, half((type.quota / 12) * months));
  }
  // Annual grant, pro-rated by the months left in the joining year.
  const monthsLeft = 12 - getMonth(from);
  return half((type.quota * monthsLeft) / 12);
}

export function eligible(type: TypeLike, emp: EmpLike) {
  return !type.gender || emp.gender === type.gender;
}

/** Working days in a leave range for this employee: skips their off days and holidays. */
export async function countLeaveDays(employeeId: string, from: Date, to: Date, halfDay: boolean) {
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { branchId: true, shift: true } });
  const shift = emp.shift ?? (await defaultShift());
  const holidays = await db.holiday.findMany({ where: { date: { gte: startOfDay(from), lte: startOfDay(to) }, OR: [{ branchId: null }, { branchId: emp.branchId }] } });
  const days = eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) })
    .filter((d) => (shift ? isWorkDay(shift, d) : true) && !holidays.some((h) => isSameDay(h.date, d))).length;
  return halfDay ? Math.min(days, 0.5) : days;
}

export async function balancesFor(employeeId: string, year = new Date().getFullYear()) {
  const [emp, types, rows, requests] = await Promise.all([
    db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, gender: true, joiningDate: true } }),
    db.leaveType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.leaveBalance.findMany({ where: { employeeId, year } }),
    db.leaveRequest.findMany({
      where: { employeeId, status: { in: ["approved", "pending"] }, from: { lte: endOfYear(new Date(year, 0, 1)) }, to: { gte: startOfYear(new Date(year, 0, 1)) } },
      select: { typeId: true, days: true, status: true },
    }),
  ]);
  return types.filter((t) => eligible(t, emp)).map((t) => {
    const row = rows.find((r) => r.typeId === t.id);
    const used = requests.filter((r) => r.typeId === t.id && r.status === "approved").reduce((s, r) => s + r.days, 0);
    const pending = requests.filter((r) => r.typeId === t.id && r.status === "pending").reduce((s, r) => s + r.days, 0);
    const entitled = entitlement(t, emp, year);
    const total = entitled + (row?.carried ?? 0) + (row?.adjusted ?? 0);
    return { type: t, entitled, carried: row?.carried ?? 0, adjusted: row?.adjusted ?? 0, used, pending, available: total - used - pending, unlimited: !Number.isFinite(entitled) };
  });
}

/** Validates and submits a leave request into the approval flow. */
export async function applyForLeave(input: { employeeId: string; typeId: string; from: Date; to: Date; halfDay: boolean; reason: string | null; requesterId: string }) {
  const { employeeId, from, to } = input;
  if (to < from) return { error: "The end date is before the start date." };
  const [emp, type] = await Promise.all([
    db.employee.findUnique({ where: { id: employeeId }, select: { id: true, fullName: true, gender: true, joiningDate: true, status: true } }),
    db.leaveType.findUnique({ where: { id: input.typeId } }),
  ]);
  if (!emp || emp.status === "left") return { error: "Employee not found." };
  if (!type?.active || !eligible(type, emp)) return { error: "This leave type isn't available for this employee." };
  const halfDay = input.halfDay && isSameDay(from, to) && type.halfDay;
  if (input.halfDay && !halfDay) return { error: type.halfDay ? "Half day applies to a single date only." : `${type.name} can't be taken as half days.` };

  const days = await countLeaveDays(employeeId, from, to, halfDay);
  if (days <= 0) return { error: "Those dates are all off days or holidays." };

  const overlap = await db.leaveRequest.findFirst({ where: { employeeId, status: { in: ["pending", "approved"] }, from: { lte: startOfDay(to) }, to: { gte: startOfDay(from) } } });
  if (overlap) return { error: "This overlaps another leave request." };

  const bal = (await balancesFor(employeeId, from.getFullYear())).find((b) => b.type.id === type.id);
  if (bal && !bal.unlimited && bal.available < days) return { error: `Only ${bal.available} day(s) of ${type.name} available.` };

  const req = await db.leaveRequest.create({ data: { employeeId, typeId: type.id, from: startOfDay(from), to: startOfDay(to), halfDay, days, reason: input.reason } });
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const approval = await submitRequest({
    type: "leave", employeeId, requesterId: input.requesterId,
    title: `${type.name} — ${emp.fullName} (${days} day${days === 1 ? "" : "s"})`,
    summary: `${fmt(from)}${isSameDay(from, to) ? "" : ` – ${fmt(to)}`}${halfDay ? " (half day)" : ""}${input.reason ? ` · ${input.reason}` : ""}`,
    payload: { leaveRequestId: req.id },
  });
  await db.leaveRequest.update({ where: { id: req.id }, data: { approvalId: approval.id } });
  return { ok: true as const, days };
}

/** Called by the approval engine when a leave request is decided. */
export async function onLeaveDecision(leaveRequestId: string, status: "approved" | "rejected" | "cancelled", actorId?: string) {
  const req = await db.leaveRequest.findUnique({ where: { id: leaveRequestId }, include: { type: true } });
  if (!req || req.status !== "pending") return;
  await db.leaveRequest.update({ where: { id: req.id }, data: { status, decidedAt: new Date() } });
  if (status === "approved") await addEvent(req.employeeId, "note", `${req.type.name}: ${req.days} day(s) approved`, { date: req.from, byId: actorId ?? null });
}
