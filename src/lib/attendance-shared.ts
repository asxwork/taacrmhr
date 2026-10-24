// Client-safe attendance constants.

export const DAY_STATUSES = {
  present: { label: "Present", short: "P", color: "green" },
  late: { label: "Late", short: "L", color: "amber" },
  half: { label: "Half day", short: "HD", color: "violet" },
  absent: { label: "Absent", short: "A", color: "red" },
  missing: { label: "No check-out", short: "M", color: "amber" },
  leave: { label: "Leave", short: "LV", color: "blue" },
  holiday: { label: "Holiday", short: "H", color: "slate" },
  weekend: { label: "Off day", short: "–", color: "slate" },
  upcoming: { label: "—", short: "", color: "slate" },
} as const;
export type DayStatus = keyof typeof DAY_STATUSES;

export const WEEKDAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" },
  { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
] as const;

export const fmtMinutes = (m: number) => (m <= 0 ? "—" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`);
