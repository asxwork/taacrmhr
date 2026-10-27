// Attendance reports (Attendance → Reports): time, scheduling and travel, for a date range and the viewer's scope.
// Shared by the report page and its CSV export.
import { differenceInCalendarDays, format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { isWorkDay, loadAttendance } from "./attendance";

export const ATT_REPORTS = [
  { value: "time", label: "Time", description: "Days present, absent and late, minutes late or early, hours worked and overtime." },
  { value: "scheduling", label: "Scheduling", description: "Planned work days and hours (usual shift plus the roster) against hours actually worked." },
  { value: "travel", label: "Travel", description: "Approved travel and official duty in the period, with days and estimated cost." },
] as const;
export type AttReport = (typeof ATT_REPORTS)[number]["value"];

const hrs = (min: number) => Math.round((min / 60) * 10) / 10;
const shiftMin = (s: { start: string; end: string }) => {
  const m = (t: string) => { const [h, mm] = t.split(":").map(Number); return (h ?? 0) * 60 + (mm ?? 0); };
  return (m(s.end) - m(s.start) + 1440) % 1440 || 480;
};

export async function attendanceReport(type: AttReport, from: Date, to: Date, scope: Prisma.EmployeeWhereInput): Promise<{ head: string[]; rows: (string | number)[][] }> {
  if (type === "travel") {
    const reqs = await db.approvalRequest.findMany({
      where: { type: { in: ["travel", "official_duty"] }, status: "approved", employee: scope },
      include: { employee: { select: { fullName: true, code: true } } }, orderBy: { createdAt: "desc" },
    });
    const rows = reqs.flatMap((r) => {
      let p: Record<string, string> = {};
      try { p = JSON.parse(r.payload); } catch {}
      const start = new Date(`${p.from ?? p.date}T00:00:00`);
      const end = new Date(`${p.to ?? p.date}T00:00:00`);
      if (Number.isNaN(start.getTime()) || end < from || start > to) return [];
      return [[r.employee.code, r.employee.fullName, r.type === "travel" ? "Travel" : "Official duty", p.destination ?? p.place ?? "", format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"), differenceInCalendarDays(end, start) + 1, Number(p.cost) || 0, p.reason ?? ""]];
    });
    return { head: ["Code", "Employee", "Type", "Where", "From", "To", "Days", "Est. cost", "Purpose"], rows };
  }

  const emps = await db.employee.findMany({ where: { ...scope, status: { not: "left" } }, select: { id: true, fullName: true, code: true, shift: true }, orderBy: { fullName: "asc" } });
  const att = await loadAttendance(emps.map((e) => e.id), from, to);
  if (type === "time") {
    const rows = emps.map((e) => {
      const d = att.get(e.id) ?? [];
      const ins = d.filter((x) => x.checkIn).map((x) => x.checkIn!.getHours() * 60 + x.checkIn!.getMinutes());
      const avg = ins.length ? Math.round(ins.reduce((a, b) => a + b, 0) / ins.length) : null;
      return [
        e.code, e.fullName, d.filter((x) => ["present", "late", "half", "missing"].includes(x.status)).length, d.filter((x) => x.status === "absent").length,
        d.filter((x) => x.status === "leave").length, d.filter((x) => x.lateMin > 0).length, d.reduce((s, x) => s + x.lateMin, 0), d.reduce((s, x) => s + x.earlyMin, 0),
        hrs(d.reduce((s, x) => s + x.workedMin, 0)), hrs(d.reduce((s, x) => s + x.overtimeMin, 0)), avg == null ? "—" : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`,
      ];
    });
    return { head: ["Code", "Employee", "Present", "Absent", "Leave", "Late days", "Late min", "Early min", "Worked h", "Overtime h", "Avg check-in"], rows };
  }

  // scheduling
  const [roster, shifts] = await Promise.all([
    db.rosterDay.findMany({ where: { employeeId: { in: emps.map((e) => e.id) }, date: { gte: from, lte: to } } }),
    db.shift.findMany(),
  ]);
  const rows = emps.map((e) => {
    const d = att.get(e.id) ?? [];
    const mine = roster.filter((r) => r.employeeId === e.id);
    const planned = d.filter((x) => !["weekend", "holiday"].includes(x.status));
    const plannedMin = planned.reduce((s, x) => {
      const r = mine.find((m) => m.date.getTime() === x.date.getTime());
      const sh = r?.shiftId ? shifts.find((s2) => s2.id === r.shiftId) : r?.start && r.end ? { start: r.start, end: r.end } : e.shift;
      return s + (sh ? shiftMin(sh) : 540);
    }, 0);
    const worked = d.reduce((s, x) => s + x.workedMin, 0);
    const usualOff = e.shift ? d.filter((x) => !isWorkDay(e.shift!, x.date)).length : 0;
    return [e.code, e.fullName, e.shift?.name ?? "Default", planned.length, d.filter((x) => x.status === "weekend").length, usualOff, mine.length, hrs(plannedMin), hrs(worked), hrs(worked - plannedMin)];
  });
  return { head: ["Code", "Employee", "Usual shift", "Planned days", "Days off", "Usual off days", "Roster changes", "Planned h", "Worked h", "Difference h"], rows };
}
