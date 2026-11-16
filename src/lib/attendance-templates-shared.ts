// Client-safe parts of the attendance report templates (list, filter types, periods, URL helpers).
import { endOfMonth, format, startOfDay, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
import type { DayStatus } from "./attendance-shared";

export type Cell = string | number | null | { s: DayStatus; t?: string } | { img: string; t?: string };
export type ReportOut = { head: string[]; rows: Cell[][]; grid?: boolean; note?: string; total?: boolean };

type T = { key: string; name: string; group: string; desc: string; day?: boolean };
export const ATT_TEMPLATES: T[] = [
  { key: "daily", name: "Daily Employee Attendance", group: "Daily", desc: "Everyone on one day: status, in, out, hours, late.", day: true },
  { key: "strength", name: "Department / Shift Wise Strength", group: "Daily", desc: "Head-count present, late, absent and on leave per department and shift.", day: true },
  { key: "images", name: "Attendance With Images", group: "Daily", desc: "Check-ins with the selfie taken at check-in." },
  { key: "log", name: "Attendance Log", group: "Daily", desc: "Every punch from the machine, web and app, in time order." },
  { key: "calendar", name: "Basic Attendance Calendar", group: "Calendars", desc: "One row per person, one letter per day (P, A, L, LV…)." },
  { key: "calendar-details", name: "Attendance Calendar Details", group: "Calendars", desc: "The calendar with check-in and check-out times in each day." },
  { key: "calendar-full", name: "Full Attendance Calendar", group: "Calendars", desc: "Times and hours per day plus totals for each person." },
  { key: "sheets", name: "Attendance Sheets", group: "Calendars", desc: "Monthly sheet: status per day with present / absent / leave totals." },
  { key: "summary", name: "Attendance Summary", group: "Summaries", desc: "Working days, present, absent, leave, hours and attendance % per person." },
  { key: "employee", name: "Employee Attendance", group: "Summaries", desc: "Per person with department, designation, branch and shift." },
  { key: "average", name: "Average Attendance", group: "Summaries", desc: "Average check-in, check-out and hours per day." },
  { key: "detailed", name: "Detailed Attendance", group: "Summaries", desc: "Every day of every person with all the numbers and notes." },
  { key: "shift", name: "Shift Attendance Custom", group: "Summaries", desc: "Day by day, grouped by shift, against each shift's timing." },
  { key: "late-early-summary", name: "Late Early Summary", group: "Late & early", desc: "Late and early-leaving days and minutes per person." },
  { key: "late-early", name: "Late Early", group: "Late & early", desc: "Each late arrival or early leave with the times." },
  { key: "late-early-minutes", name: "Late/Early Minutes", group: "Late & early", desc: "Minutes late (L) and early (E) per day on a calendar." },
  { key: "department", name: "Department Wise", group: "By group", desc: "Attendance totals per department." },
  { key: "branch", name: "Branch Wise", group: "By group", desc: "Attendance totals per branch." },
  { key: "location", name: "Location Wise", group: "By group", desc: "Attendance totals per work location." },
  { key: "area-manager", name: "Area Manager", group: "By group", desc: "Each manager's team: attendance totals per manager." },
  { key: "asm", name: "ASM Attendance", group: "By group", desc: "Attendance of managers / area sales managers themselves." },
];
export const templateByKey = (k: string) => ATT_TEMPLATES.find((t) => t.key === k);

export type AttFilters = { location?: string; branchIds?: string[]; departmentIds?: string[]; employeeIds?: string[]; period?: string; from?: string; to?: string };

export const PERIODS = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["month", "This month"], ["last-month", "Last month"]] as const;
/** The dates a period means right now (scheduled emails use this so "Last month" is always last month). */
export function periodRange(period: string | undefined, now = new Date()): { from: Date; to: Date } | null {
  const d = startOfDay(now);
  switch (period) {
    case "today": return { from: d, to: d };
    case "yesterday": return { from: subDays(d, 1), to: subDays(d, 1) };
    case "week": return { from: startOfWeek(d, { weekStartsOn: 1 }), to: d };
    case "month": return { from: startOfMonth(d), to: d };
    case "last-month": { const m = subMonths(d, 1); return { from: startOfMonth(m), to: startOfDay(endOfMonth(m)) }; }
    default: return null;
  }
}

/** A plain-text value for CSV / email. */
export const cellText = (c: Cell): string => c == null ? "" : typeof c === "object" ? ("s" in c ? [c.s, c.t].filter(Boolean).join(" ") : c.t ?? "") : String(c);

/** Filters from a URL / saved preset, with the period turned into dates. */
export function readFilters(sp: Record<string, string | undefined>): AttFilters {
  const list = (v?: string) => (v ? v.split(",").filter(Boolean) : []);
  const r = periodRange(sp.period);
  const ymd = (d: Date) => format(d, "yyyy-MM-dd");
  return {
    location: sp.location || undefined, branchIds: list(sp.branch), departmentIds: list(sp.department), employeeIds: list(sp.employee), period: sp.period || undefined,
    from: r ? ymd(r.from) : sp.from || ymd(startOfMonth(new Date())), to: r ? ymd(r.to) : sp.to || ymd(new Date()),
  };
}
export const filtersQuery = (f: AttFilters) => new URLSearchParams(Object.entries({
  location: f.location, branch: f.branchIds?.join(","), department: f.departmentIds?.join(","), employee: f.employeeIds?.join(","),
  ...(f.period ? { period: f.period } : { from: f.from, to: f.to }),
}).filter(([, v]) => v) as [string, string][]).toString();
