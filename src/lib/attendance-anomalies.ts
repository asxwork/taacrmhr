// HR → Attendance → Anomalies: patterns worth a word with the employee, found in the last N days of attendance:
// late streaks, late often, forgotten check-outs, absences next to off days, check-ins away from the office and
// very long days (usually a forgotten check-out).
import { format, isSameDay, subDays, startOfDay } from "date-fns";
import { db } from "./db";
import { loadAttendance, type DayResult } from "./attendance";

export type Anomaly = { kind: string; label: string; detail: string; level: "high" | "medium" };
const d = (x: Date) => format(x, "d MMM");

function findFor(days: DayResult[], outsideCount: number): Anomaly[] {
  const out: Anomaly[] = [];
  const work = days.filter((x) => !["weekend", "holiday", "upcoming", "leave"].includes(x.status) && !x.exempt);
  // Longest run of late days (work days in a row).
  let run: DayResult[] = [], best: DayResult[] = [];
  for (const x of work) { if (x.status === "late") { run.push(x); if (run.length > best.length) best = [...run]; } else run = []; }
  if (best.length >= 3) out.push({ kind: "late-streak", label: `Late ${best.length} days in a row`, detail: `${d(best[0]!.date)} – ${d(best.at(-1)!.date)}`, level: best.length >= 5 ? "high" : "medium" });
  const lates = work.filter((x) => x.status === "late");
  if (lates.length >= 5) out.push({ kind: "late-often", label: `Late ${lates.length} times`, detail: `${Math.round(lates.reduce((s, x) => s + x.lateMin, 0) / lates.length)} min late on average`, level: lates.length >= 10 ? "high" : "medium" });
  const missing = days.filter((x) => x.status === "missing" || /no check-out/i.test(x.note ?? ""));
  if (missing.length >= 3) out.push({ kind: "no-checkout", label: `Forgot to check out ${missing.length} times`, detail: missing.slice(-4).map((x) => d(x.date)).join(", "), level: missing.length >= 6 ? "high" : "medium" });
  // Absent right before or after an off day / holiday (long weekends).
  const off = (x?: DayResult) => !!x && ["weekend", "holiday"].includes(x.status);
  const bridged = days.filter((x, i) => x.status === "absent" && (off(days[i - 1]) || off(days[i + 1])));
  if (bridged.length >= 2) out.push({ kind: "weekend-absence", label: `Absent next to an off day ${bridged.length} times`, detail: bridged.map((x) => format(x.date, "EEE d MMM")).join(", "), level: bridged.length >= 3 ? "high" : "medium" });
  if (outsideCount >= 3) out.push({ kind: "outside", label: `Checked in away from the office ${outsideCount} times`, detail: "Phone check-ins outside the office area", level: outsideCount >= 6 ? "high" : "medium" });
  const long = days.filter((x) => x.workedMin >= 13 * 60);
  if (long.length >= 2) out.push({ kind: "long-days", label: `${long.length} days over 13 hours`, detail: `${long.slice(-4).map((x) => d(x.date)).join(", ")} (often a check-out pressed late or forgotten)`, level: "medium" });
  return out;
}

/** Anomalies per employee over the last `days` days, worst first. */
export async function attendanceAnomalies(employees: { id: string; fullName: string; code: string | null; photo: string | null }[], days = 30) {
  const to = startOfDay(new Date()), from = subDays(to, days - 1);
  const ids = employees.map((e) => e.id);
  const [att, outside] = await Promise.all([
    loadAttendance(ids, from, to),
    db.attendancePunch.groupBy({ by: ["employeeId"], where: { employeeId: { in: ids }, at: { gte: from }, outside: true }, _count: { _all: true } }),
  ]);
  const outBy = new Map(outside.map((o) => [o.employeeId, o._count._all]));
  return employees
    .map((e) => ({ e, list: findFor((att.get(e.id) ?? []).filter((x) => !isSameDay(x.date, new Date()) || x.status !== "absent"), outBy.get(e.id) ?? 0) }))
    .filter((x) => x.list.length)
    .sort((a, b) => b.list.filter((x) => x.level === "high").length - a.list.filter((x) => x.level === "high").length || b.list.length - a.list.length);
}
