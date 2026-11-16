// HR → Attendance reports: the ready-made templates (the ResourceInn list, done simpler). Each one is generated from
// the same filters (location, branch, department, employees, from–to) and the same attendance engine (loadAttendance),
// so every report agrees with the daily attendance screen.
import type { Prisma } from "@prisma/client";
import { addDays, differenceInCalendarDays, format, startOfDay, startOfMonth } from "date-fns";
import { db } from "./db";
import { loadAttendance, type DayResult } from "./attendance";
import { templateByKey, type AttFilters, type Cell, type ReportOut } from "./attendance-templates-shared";
export * from "./attendance-templates-shared";

const PRESENT = ["present", "late", "half", "missing"];
const hm = (d: Date | null) => (d ? format(d, "HH:mm") : "—");
const hrs = (min: number) => Math.round((min / 60) * 10) / 10;
const avgTime = (mins: number[]) => { if (!mins.length) return "—"; const a = Math.round(mins.reduce((x, y) => x + y, 0) / mins.length); return `${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`; };
const minOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const planned = (d: DayResult[]) => d.filter((x) => !["weekend", "holiday", "upcoming"].includes(x.status));

/** Runs one template. `scope` = the employees the viewer may see. */
export async function runTemplate(key: string, f: AttFilters, scope: Prisma.EmployeeWhereInput): Promise<ReportOut> {
  const t = templateByKey(key);
  if (!t) return { head: [], rows: [] };
  let from = f.from ? new Date(`${f.from}T00:00:00`) : startOfMonth(new Date());
  let to = f.to ? new Date(`${f.to}T00:00:00`) : startOfDay(new Date());
  if (t.day) from = to;
  let note: string | undefined;
  const cap = ["calendar", "calendar-details", "calendar-full", "sheets", "late-early-minutes"].includes(key) ? 31 : 93;
  if (differenceInCalendarDays(to, from) + 1 > cap) { to = addDays(from, cap - 1); note = `Shortened to ${cap} days (${format(from, "d MMM")} – ${format(to, "d MMM")}). Pick a shorter range for the rest.`; }
  if (to < from) return { head: [], rows: [], note: "The From date is after the To date." };

  const where: Prisma.EmployeeWhereInput = {
    AND: [scope, { status: { not: "left" } },
      ...(f.location ? [{ location: f.location }] : []),
      ...(f.branchIds?.length ? [{ branchId: { in: f.branchIds } }] : []),
      ...(f.departmentIds?.length ? [{ departmentId: { in: f.departmentIds } }] : []),
      ...(f.employeeIds?.length ? [{ id: { in: f.employeeIds } }] : []),
      ...(key === "asm" ? [{ OR: [{ isLineManager: true }, { reports: { some: {} } }] }] : []),
    ],
  };
  const emps = await db.employee.findMany({
    where, orderBy: { fullName: "asc" },
    select: { id: true, code: true, fullName: true, location: true, managerId: true, manager: { select: { fullName: true } }, department: { select: { name: true } }, designation: { select: { name: true } }, branch: { select: { name: true } }, shift: { select: { name: true, start: true, end: true } } },
  });
  if (!emps.length) return { head: [], rows: [], note: note ?? "No employees match these filters." };
  const ids = emps.map((e) => e.id);
  const shiftName = (e: (typeof emps)[number]) => e.shift?.name ?? "Default";

  // Punch-based reports
  if (key === "log" || key === "images") {
    const punches = await db.attendancePunch.findMany({
      where: { employeeId: { in: ids }, at: { gte: from, lt: addDays(to, 1) }, ...(key === "images" ? { photo: { not: null } } : {}) },
      orderBy: { at: "asc" }, take: 5000, select: { at: true, source: true, photo: true, outside: true, distanceM: true, employeeId: true },
    });
    const byId = new Map(emps.map((e) => [e.id, e]));
    const where2 = (p: (typeof punches)[number]) => (p.outside ? `Outside (${p.distanceM ?? "?"} m)` : p.distanceM != null ? `At office (${p.distanceM} m)` : "—");
    if (key === "log") return { head: ["Date", "Time", "Code", "Employee", "Department", "Source", "Location"], rows: punches.map((p) => { const e = byId.get(p.employeeId)!; return [format(p.at, "EEE d MMM"), format(p.at, "HH:mm:ss"), e.code, e.fullName, e.department?.name ?? "—", p.source, where2(p)]; }), note };
    return { head: ["Photo", "Date", "Time", "Employee", "Department", "Source", "Location"], rows: punches.map((p) => { const e = byId.get(p.employeeId)!; return [{ img: p.photo!, t: e.fullName }, format(p.at, "EEE d MMM"), format(p.at, "HH:mm"), e.fullName, e.department?.name ?? "—", p.source, where2(p)]; }), note: note ?? (punches.length ? undefined : "No check-in selfies in this period. Turn on Selfie at check-in in HR Settings → Shifts.") };
  }

  const att = await loadAttendance(ids, from, to);
  const days = (id: string) => att.get(id) ?? [];
  const dayCols = Array.from({ length: differenceInCalendarDays(to, from) + 1 }, (_, i) => addDays(from, i));
  const dayHead = dayCols.map((d) => format(d, "d EEEEEE"));
  const at = (id: string, d: Date) => days(id).find((x) => +x.date === +startOfDay(d));

  switch (key) {
    case "daily":
      return { head: ["Code", "Employee", "Department", "Shift", "Status", "In", "Out", "Hours", "Late min", "Early min", "Note"], rows: emps.map((e) => { const x = at(e.id, to); return x ? [e.code, e.fullName, e.department?.name ?? "—", shiftName(e), { s: x.status }, hm(x.checkIn), hm(x.checkOut), x.workedMin ? hrs(x.workedMin) : "—", x.lateMin || "", x.earlyMin || "", x.note ?? ""] : [e.code, e.fullName, e.department?.name ?? "—", shiftName(e), "Not joined", "", "", "", "", "", ""]; }), note };

    case "strength": {
      const groups = new Map<string, DayResult[]>();
      for (const e of emps) { const x = at(e.id, to); if (!x) continue; const k = `${e.department?.name ?? "No department"}|${shiftName(e)}`; groups.set(k, [...(groups.get(k) ?? []), x]); }
      const rows: Cell[][] = [...groups.entries()].sort().map(([k, xs]) => { const [dep, sh] = k.split("|"); const p = xs.filter((x) => PRESENT.includes(x.status)).length; const exp = xs.filter((x) => !["weekend", "holiday"].includes(x.status)).length;
        return [dep!, sh!, xs.length, p, xs.filter((x) => x.lateMin > 0).length, xs.filter((x) => x.status === "absent").length, xs.filter((x) => x.status === "leave").length, xs.filter((x) => ["weekend", "holiday"].includes(x.status)).length, pct(p, exp)]; });
      const sum = (i: number) => rows.reduce((s, r) => s + Number(r[i]), 0);
      if (rows.length > 1) rows.push(["Total", "", sum(2), sum(3), sum(4), sum(5), sum(6), sum(7), pct(sum(3), sum(2) - sum(7))]);
      return { head: ["Department", "Shift", "Strength", "Present", "Late", "Absent", "Leave", "Off / holiday", "Present %"], rows, note, total: rows.length > 1 };
    }

    case "calendar":
      return { head: ["Code", "Employee", ...dayHead], rows: emps.map((e) => [e.code, e.fullName, ...dayCols.map((d) => { const x = at(e.id, d); return x ? { s: x.status } : null; })]), grid: true, note };
    case "calendar-details":
      return { head: ["Code", "Employee", ...dayHead], rows: emps.map((e) => [e.code, e.fullName, ...dayCols.map((d) => { const x = at(e.id, d); return x ? { s: x.status, t: x.checkIn ? `${hm(x.checkIn)}–${hm(x.checkOut)}` : undefined } : null; })]), grid: true, note };
    case "calendar-full":
      return { head: ["Code", "Employee", ...dayHead, "P", "A", "LV", "Late", "Hours", "OT h"], rows: emps.map((e) => { const d = days(e.id);
        return [e.code, e.fullName, ...dayCols.map((day) => { const x = at(e.id, day); return x ? { s: x.status, t: x.checkIn ? `${hm(x.checkIn)}–${hm(x.checkOut)}${x.workedMin ? ` · ${hrs(x.workedMin)}h` : ""}` : undefined } : null; }),
          d.filter((x) => PRESENT.includes(x.status)).length, d.filter((x) => x.status === "absent").length, d.filter((x) => x.status === "leave").length, d.filter((x) => x.lateMin > 0).length, hrs(d.reduce((s, x) => s + x.workedMin, 0)), hrs(d.reduce((s, x) => s + x.overtimeMin, 0))]; }), grid: true, note };
    case "sheets":
      return { head: ["Code", "Employee", ...dayHead, "P", "A", "LV", "HD", "Late", "Off"], rows: emps.map((e) => { const d = days(e.id);
        return [e.code, e.fullName, ...dayCols.map((day) => { const x = at(e.id, day); return x ? { s: x.status } : null; }),
          d.filter((x) => ["present", "late", "missing"].includes(x.status)).length, d.filter((x) => x.status === "absent").length, d.filter((x) => x.status === "leave").length, d.filter((x) => x.status === "half").length, d.filter((x) => x.lateMin > 0).length, d.filter((x) => ["weekend", "holiday"].includes(x.status)).length]; }), grid: true, note };
    case "late-early-minutes":
      return { head: ["Code", "Employee", ...dayHead, "Late min", "Early min"], rows: emps.map((e) => { const d = days(e.id);
        return [e.code, e.fullName, ...dayCols.map((day) => { const x = at(e.id, day); if (!x || (!x.lateMin && !x.earlyMin)) return null; return [x.lateMin ? `L${x.lateMin}` : "", x.earlyMin ? `E${x.earlyMin}` : ""].filter(Boolean).join(" "); }),
          d.reduce((s, x) => s + x.lateMin, 0), d.reduce((s, x) => s + x.earlyMin, 0)]; }), grid: true, note };

    case "summary": case "asm":
      return { head: ["Code", "Employee", "Department", "Working days", "Present", "Late", "Half", "Absent", "No check-out", "Leave", "Holidays", "Off days", "Hours", "OT h", "Attendance %"], rows: emps.map((e) => { const d = days(e.id); const p = planned(d); const pres = d.filter((x) => PRESENT.includes(x.status)).length;
        return [e.code, e.fullName, e.department?.name ?? "—", p.length, pres, d.filter((x) => x.lateMin > 0).length, d.filter((x) => x.status === "half").length, d.filter((x) => x.status === "absent").length, d.filter((x) => x.status === "missing").length, d.filter((x) => x.status === "leave").length, d.filter((x) => x.status === "holiday").length, d.filter((x) => x.status === "weekend").length, hrs(d.reduce((s, x) => s + x.workedMin, 0)), hrs(d.reduce((s, x) => s + x.overtimeMin, 0)), pct(pres, p.length)]; }), note };
    case "employee":
      return { head: ["Code", "Employee", "Department", "Designation", "Branch", "Shift", "Present", "Absent", "Leave", "Late", "Hours"], rows: emps.map((e) => { const d = days(e.id);
        return [e.code, e.fullName, e.department?.name ?? "—", e.designation?.name ?? "—", e.branch?.name ?? "—", e.shift ? `${e.shift.name} (${e.shift.start}–${e.shift.end})` : "Default", d.filter((x) => PRESENT.includes(x.status)).length, d.filter((x) => x.status === "absent").length, d.filter((x) => x.status === "leave").length, d.filter((x) => x.lateMin > 0).length, hrs(d.reduce((s, x) => s + x.workedMin, 0))]; }), note };
    case "average":
      return { head: ["Code", "Employee", "Department", "Days worked", "Avg in", "Avg out", "Avg hours / day", "Avg late min", "Attendance %"], rows: emps.map((e) => { const d = days(e.id); const w = d.filter((x) => x.checkIn); const done = d.filter((x) => x.workedMin > 0); const late = d.filter((x) => x.lateMin > 0);
        return [e.code, e.fullName, e.department?.name ?? "—", w.length, avgTime(w.map((x) => minOfDay(x.checkIn!))), avgTime(w.filter((x) => x.checkOut).map((x) => minOfDay(x.checkOut!))), done.length ? hrs(done.reduce((s, x) => s + x.workedMin, 0) / done.length) : "—", late.length ? Math.round(late.reduce((s, x) => s + x.lateMin, 0) / late.length) : "—", pct(d.filter((x) => PRESENT.includes(x.status)).length, planned(d).length)]; }), note };
    case "detailed": case "shift": {
      const list = emps.flatMap((e) => days(e.id).filter((x) => x.status !== "upcoming").map((x) => ({ e, x })));
      if (key === "shift") list.sort((a, b) => shiftName(a.e).localeCompare(shiftName(b.e)) || +a.x.date - +b.x.date || a.e.fullName.localeCompare(b.e.fullName));
      if (key === "detailed") return { head: ["Date", "Code", "Employee", "Status", "In", "Out", "Break min", "Hours", "Late", "Early", "OT h", "Note"], rows: list.map(({ e, x }) => [format(x.date, "EEE d MMM"), e.code, e.fullName, { s: x.status }, hm(x.checkIn), hm(x.checkOut), x.breakMin || "", x.workedMin ? hrs(x.workedMin) : "", x.lateMin || "", x.earlyMin || "", x.overtimeMin ? hrs(x.overtimeMin) : "", x.note ?? ""]), note };
      return { head: ["Shift", "Timing", "Date", "Employee", "Status", "In", "Out", "Hours", "Late", "Early", "OT h"], rows: list.map(({ e, x }) => [shiftName(e), e.shift ? `${e.shift.start}–${e.shift.end}` : "—", format(x.date, "EEE d MMM"), e.fullName, { s: x.status }, hm(x.checkIn), hm(x.checkOut), x.workedMin ? hrs(x.workedMin) : "", x.lateMin || "", x.earlyMin || "", x.overtimeMin ? hrs(x.overtimeMin) : ""]), note };
    }
    case "late-early-summary":
      return { head: ["Code", "Employee", "Department", "Late days", "Late min", "Avg late", "Early days", "Early min", "Total min"], rows: emps.map((e) => { const d = days(e.id); const l = d.filter((x) => x.lateMin > 0), er = d.filter((x) => x.earlyMin > 0); const lm = l.reduce((s, x) => s + x.lateMin, 0), em = er.reduce((s, x) => s + x.earlyMin, 0);
        return [e.code, e.fullName, e.department?.name ?? "—", l.length, lm, l.length ? Math.round(lm / l.length) : "—", er.length, em, lm + em]; }).sort((a, b) => Number(b[8]) - Number(a[8])), note };
    case "late-early":
      return { head: ["Date", "Code", "Employee", "Shift start", "In", "Late min", "Shift end", "Out", "Early min"], rows: emps.flatMap((e) => days(e.id).filter((x) => x.lateMin || x.earlyMin).map((x) => [format(x.date, "EEE d MMM"), e.code, e.fullName, e.shift?.start ?? "—", hm(x.checkIn), x.lateMin || "", e.shift?.end ?? "—", hm(x.checkOut), x.earlyMin || ""] as Cell[])).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), note };

    case "department": case "branch": case "location": case "area-manager": {
      const label = (e: (typeof emps)[number]) => key === "department" ? e.department?.name ?? "No department" : key === "branch" ? e.branch?.name ?? "No branch" : key === "location" ? e.location ?? "Not set" : e.manager?.fullName ?? "No manager";
      const groups = new Map<string, typeof emps>();
      for (const e of emps) groups.set(label(e), [...(groups.get(label(e)) ?? []), e]);
      const rows: Cell[][] = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([g, es]) => {
        const d = es.flatMap((e) => days(e.id)); const p = planned(d).length; const pres = d.filter((x) => PRESENT.includes(x.status)).length;
        return [g, es.length, p, pres, d.filter((x) => x.status === "absent").length, d.filter((x) => x.status === "leave").length, d.filter((x) => x.lateMin > 0).length, hrs(d.reduce((s, x) => s + x.workedMin, 0)), pct(pres, p)];
      });
      const sum = (i: number) => rows.reduce((s, r) => s + Number(r[i]), 0);
      if (rows.length > 1) rows.push(["Total", sum(1), sum(2), sum(3), sum(4), sum(5), sum(6), Math.round(sum(7) * 10) / 10, pct(sum(3), sum(2))]);
      const g = key === "department" ? "Department" : key === "branch" ? "Branch" : key === "location" ? "Location" : "Manager";
      return { head: [g, key === "area-manager" ? "Team" : "Employees", "Working days", "Present", "Absent", "Leave", "Late", "Hours", "Attendance %"], rows, note, total: rows.length > 1 };
    }
  }
  return { head: [], rows: [] };
}

