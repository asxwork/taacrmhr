import { addDays, differenceInMinutes, eachDayOfInterval, getISODay, isSameDay, startOfDay } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { scopeWhere } from "./permissions";
import type { SessionUser } from "./auth";
import type { Action } from "./rbac";
import type { DayStatus } from "./attendance-shared";

export * from "./attendance-shared";

// Attendance is evaluated on demand from raw punches (web check-ins, ZKTeco imports, approved corrections),
// the employee's shift, holidays and approved leave. AttendanceDay rows only store HR overrides.
// All dates are in company local time (see instrumentation.ts).

type ShiftLike = { start: string; end: string; graceMin: number; halfDayMin: number; workDays: string };
const FALLBACK_SHIFT: ShiftLike = { start: "09:00", end: "18:00", graceMin: 15, halfDayMin: 240, workDays: "1,2,3,4,5,6" };
const OVERTIME_AFTER_MIN = 30;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const at = (day: Date, minutes: number) => new Date(startOfDay(day).getTime() + minutes * 60_000);
export const isWorkDay = (shift: ShiftLike, day: Date) => shift.workDays.split(",").map(Number).includes(getISODay(day));

export type DayResult = {
  date: Date; status: DayStatus; checkIn: Date | null; checkOut: Date | null;
  workedMin: number; lateMin: number; earlyMin: number; overtimeMin: number; note: string | null; overridden: boolean;
};

/** The single source of truth for what a day counts as. */
export function evaluateDay(input: {
  date: Date; shift: ShiftLike | null; punches: Date[]; holiday?: string | null; leave?: { halfDay: boolean; type: string } | null;
  override?: { status: string; note: string | null } | null; now?: Date;
}): DayResult {
  const shift = input.shift ?? FALLBACK_SHIFT;
  const now = input.now ?? new Date();
  const day = startOfDay(input.date);
  const punches = [...input.punches].sort((a, b) => +a - +b);
  const checkIn = punches[0] ?? null;
  const checkOut = punches.length > 1 ? punches.at(-1)! : null;
  const workedMin = checkIn && checkOut ? Math.max(0, differenceInMinutes(checkOut, checkIn)) : 0;
  const base = { date: day, checkIn, checkOut, workedMin, lateMin: 0, earlyMin: 0, overtimeMin: 0, note: input.override?.note ?? null, overridden: false };

  if (input.override && input.override.status !== "auto") return { ...base, status: input.override.status as DayStatus, overridden: true };

  const start = at(day, toMin(shift.start));
  const end = at(day, toMin(shift.end));
  const offDay = !!input.holiday || !isWorkDay(shift, day);

  if (!checkIn) {
    if (input.leave) return { ...base, status: "leave", note: base.note ?? `${input.leave.type}${input.leave.halfDay ? " (half day)" : ""}` };
    if (input.holiday) return { ...base, status: "holiday", note: input.holiday };
    if (offDay) return { ...base, status: "weekend" };
    return { ...base, status: day > now || (isSameDay(day, now) && now < end) ? "upcoming" : "absent" };
  }

  // Worked on a holiday / off day: present, all time counts as overtime.
  if (offDay) return { ...base, status: checkOut || !isSameDay(day, now) ? "present" : "present", overtimeMin: workedMin, note: base.note ?? input.holiday ?? "Worked on off day" };

  const lateMin = checkIn > at(day, toMin(shift.start) + shift.graceMin) ? differenceInMinutes(checkIn, start) : 0;
  if (!checkOut) {
    return { ...base, lateMin, status: isSameDay(day, now) ? (lateMin ? "late" : "present") : "missing" };
  }
  const earlyMin = checkOut < at(day, toMin(shift.end) - shift.graceMin) ? differenceInMinutes(end, checkOut) : 0;
  const overtimeMin = differenceInMinutes(checkOut, end) > OVERTIME_AFTER_MIN ? differenceInMinutes(checkOut, end) : 0;
  const half = workedMin < shift.halfDayMin || input.leave?.halfDay;
  return { ...base, lateMin, earlyMin, overtimeMin, status: half ? "half" : lateMin ? "late" : "present" };
}

/** Attendance for many employees over a date range, evaluated in memory from bulk queries. */
export async function loadAttendance(employeeIds: string[], from: Date, to: Date) {
  const start = startOfDay(from);
  const endExcl = addDays(startOfDay(to), 1);
  const [emps, punches, leaves, holidays, overrides, defShift] = await Promise.all([
    db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, branchId: true, joiningDate: true, leftAt: true, shift: true } }),
    db.attendancePunch.findMany({ where: { employeeId: { in: employeeIds }, at: { gte: start, lt: endExcl } }, select: { employeeId: true, at: true } }),
    db.leaveRequest.findMany({ where: { employeeId: { in: employeeIds }, status: "approved", from: { lt: endExcl }, to: { gte: start } }, include: { type: { select: { name: true } } } }),
    db.holiday.findMany({ where: { date: { gte: start, lt: endExcl } } }),
    db.attendanceDay.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: start, lt: endExcl } } }),
    defaultShift(),
  ]);
  const days = eachDayOfInterval({ start, end: startOfDay(to) });
  const now = new Date();
  const out = new Map<string, DayResult[]>();
  for (const e of emps) {
    const mine = punches.filter((p) => p.employeeId === e.id);
    out.set(e.id, days
      .filter((d) => d >= startOfDay(e.joiningDate) && (!e.leftAt || d <= startOfDay(e.leftAt)))
      .map((d) => {
        const leave = leaves.find((l) => l.employeeId === e.id && startOfDay(l.from) <= d && startOfDay(l.to) >= d);
        const holiday = holidays.find((h) => isSameDay(h.date, d) && (!h.branchId || h.branchId === e.branchId));
        const override = overrides.find((o) => o.employeeId === e.id && isSameDay(o.date, d));
        return evaluateDay({
          date: d, shift: e.shift ?? defShift, now, punches: mine.filter((p) => isSameDay(p.at, d)).map((p) => p.at),
          holiday: holiday?.name ?? null, leave: leave ? { halfDay: leave.halfDay, type: leave.type.name } : null,
          override: override ? { status: override.status, note: override.note } : null,
        });
      }));
  }
  return out;
}

/**
 * Attendance drill-down categories (HR dashboard tiles and the ?status= filter on daily attendance).
 * One definition, so a tile's count always matches the list it opens.
 */
export const ATTENDANCE_DRILL = [
  { key: "present", label: "Present", tone: "green", test: (d: DayResult) => ["present", "late", "half", "missing"].includes(d.status) },
  { key: "absent", label: "Absent", tone: "red", test: (d: DayResult) => d.status === "absent" },
  { key: "late", label: "Late arrivals", tone: "amber", test: (d: DayResult) => d.lateMin > 0 },
  { key: "early", label: "Early left", tone: "violet", test: (d: DayResult) => d.earlyMin > 0 },
  { key: "missing", label: "No check-out", tone: "orange", test: (d: DayResult) => d.status === "missing" },
  { key: "half", label: "Half day", tone: "fuchsia", test: (d: DayResult) => d.status === "half" },
  { key: "leave", label: "On leave", tone: "blue", test: (d: DayResult) => d.status === "leave" },
  { key: "holiday", label: "Holiday", tone: "teal", test: (d: DayResult) => d.status === "holiday" },
  { key: "off", label: "Days off", tone: "slate", test: (d: DayResult) => d.status === "weekend" },
  { key: "pending", label: "Not in yet", tone: "sky", test: (d: DayResult) => d.status === "upcoming" },
] as const;
export type DrillKey = (typeof ATTENDANCE_DRILL)[number]["key"];

export function summarize(days: DayResult[]) {
  const count = (s: DayStatus) => days.filter((d) => d.status === s).length;
  return {
    present: count("present") + count("late"), late: count("late"), half: count("half"), absent: count("absent"),
    missing: count("missing"), leave: count("leave"), holiday: count("holiday"), weekend: count("weekend"),
    workedMin: days.reduce((s, d) => s + d.workedMin, 0), overtimeMin: days.reduce((s, d) => s + d.overtimeMin, 0),
    lateMin: days.reduce((s, d) => s + d.lateMin, 0),
  };
}

export async function defaultShift() {
  return (await db.shift.findFirst({ where: { isDefault: true } })) ?? (await db.shift.findFirst());
}

/** Employees whose attendance the user may see/act on (hr.attendance scope; owner = linked login). */
export async function attendanceEmployeeWhere(user: SessionUser, action: Action = "view"): Promise<Prisma.EmployeeWhereInput | null> {
  return scopeWhere(user, "hr.attendance", action, { owner: "userId", branch: "branchId" }) as Promise<Prisma.EmployeeWhereInput | null>;
}

// ─── Geo-fence ───────────────────────────────────────────────

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function geofenceMode(): Promise<"off" | "warn" | "enforce"> {
  const v = (await db.setting.findUnique({ where: { key: "attendance.geofence" } }))?.value;
  return v === "enforce" || v === "off" ? v : "warn";
}

// ─── ZKTeco import ───────────────────────────────────────────

export type DevicePunch = { deviceUserId: string; at: Date };

/**
 * Reads a ZKTeco K40 export:
 *  - USB "attlog" (.dat/.txt): `  12\t2026-10-24 09:02:11\t1\t0\t1\t0` (user id, timestamp, then status columns)
 *  - ZKTime / Excel CSV: a header row with an ID column (AC-No, User ID, Enroll No…) and either a combined
 *    date-time column or separate Date and Time columns. Device times are company local time.
 */
export function parseDeviceLog(text: string): { rows: DevicePunch[]; skipped: number } {
  const rows: DevicePunch[] = [];
  let skipped = 0;
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const parseStamp = (s: string) => {
    const m = s.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/) ?? s.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const [y, mo, d] = m[1]!.length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]]; // dd/mm/yyyy when the year is last
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  const attlog = /^\s*\d+\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;
  if (lines.some((l) => attlog.test(l))) {
    for (const l of lines) {
      const m = l.match(/^\s*(\d+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
      const dt = m ? parseStamp(m[2]!) : null;
      if (m && dt) rows.push({ deviceUserId: m[1]!, at: dt });
      else skipped++;
    }
    return { rows, skipped };
  }

  const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0] ?? "").map((h) => h.toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const idCol = find("ac-no", "ac no", "user id", "userid", "enroll", "emp no", "no.", "id");
  const dtCol = find("date time", "datetime", "check time", "checktime", "punch time", "time");
  const dateCol = header.findIndex((h) => h === "date");
  const timeCol = header.findIndex((h) => h === "time");
  for (const l of lines.slice(1)) {
    const c = split(l);
    const id = c[idCol]?.replace(/\D/g, "");
    const stamp = dateCol >= 0 && timeCol >= 0 ? `${c[dateCol]} ${c[timeCol]}` : c[dtCol] ?? "";
    const dt = parseStamp(stamp);
    if (idCol >= 0 && id && dt) rows.push({ deviceUserId: id, at: dt });
    else skipped++;
  }
  return { rows, skipped };
}

/** Saves device punches for mapped employees, skipping ones already stored. */
export async function importDevicePunches(rows: DevicePunch[], byUserId: string) {
  const employees = await db.employee.findMany({ where: { deviceUserId: { in: [...new Set(rows.map((r) => r.deviceUserId))] } }, select: { id: true, deviceUserId: true } });
  const map = new Map(employees.map((e) => [e.deviceUserId!, e.id]));
  const unknown = new Set(rows.filter((r) => !map.has(r.deviceUserId)).map((r) => r.deviceUserId));
  // A device clock running fast would create punches in the future — skip those.
  const latest = Date.now() + 5 * 60_000;
  const future = rows.filter((r) => map.has(r.deviceUserId) && r.at.getTime() > latest).length;
  const known = rows.filter((r) => map.has(r.deviceUserId) && r.at.getTime() <= latest).map((r) => ({ employeeId: map.get(r.deviceUserId)!, at: r.at }));
  if (!known.length) return { added: 0, duplicates: 0, future, unknown: [...unknown] };

  const min = new Date(Math.min(...known.map((k) => +k.at)));
  const max = new Date(Math.max(...known.map((k) => +k.at)));
  const existing = await db.attendancePunch.findMany({ where: { employeeId: { in: [...new Set(known.map((k) => k.employeeId))] }, at: { gte: min, lte: max } }, select: { employeeId: true, at: true } });
  const seen = new Set(existing.map((e) => `${e.employeeId}|${+e.at}`));
  const fresh = known.filter((k) => {
    const key = `${k.employeeId}|${+k.at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (fresh.length) await db.attendancePunch.createMany({ data: fresh.map((f) => ({ ...f, source: "device", createdById: byUserId })) });
  return { added: fresh.length, duplicates: known.length - fresh.length, future, unknown: [...unknown] };
}

/** Approved correction: adds the requested in/out times as manual punches and marks the day corrected. */
export async function applyCorrection(employeeId: string, payload: { date: string; checkIn?: string; checkOut?: string; reason?: string }, actorId: string | null) {
  const day = startOfDay(new Date(payload.date));
  if (Number.isNaN(day.getTime())) return;
  for (const t of [payload.checkIn, payload.checkOut]) {
    if (!t || !/^\d{2}:\d{2}$/.test(t)) continue;
    const when = at(day, toMin(t));
    await db.attendancePunch.upsert({
      where: { employeeId_at: { employeeId, at: when } },
      update: {},
      create: { employeeId, at: when, source: "manual", createdById: actorId },
    });
  }
  await db.attendanceDay.upsert({
    where: { employeeId_date: { employeeId, date: day } },
    update: { corrected: true, note: payload.reason ? `Corrected: ${payload.reason}` : "Corrected" },
    create: { employeeId, date: day, status: "auto", corrected: true, note: payload.reason ? `Corrected: ${payload.reason}` : "Corrected" },
  });
}
