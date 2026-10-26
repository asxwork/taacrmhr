// Lead list filters live in the URL so every filter (and saved preset) is a link.
// Multi-value params are comma-separated ids. "me" in owner means the signed-in user.
export const LEAD_FILTER_KEYS = ["q", "name", "project", "group", "stage", "phone", "owner", "source", "activity", "created", "cfrom", "cto", "modified", "mfrom", "mto", "stale", "reshuffled"] as const;
export type LeadFilters = Partial<Record<(typeof LEAD_FILTER_KEYS)[number], string>>;

export const STATUS_GROUPS = [
  { value: "", label: "In progress" },
  { value: "converted", label: "Completed" },
  { value: "junk", label: "Closed" },
  { value: "all", label: "All" },
] as const;

export const ACTIVITY_FILTERS = [
  { value: "", label: "Any" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "planned", label: "Has planned activity" },
  { value: "none", label: "Nothing planned" },
] as const;

export const DATE_FILTERS = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Exact dates" },
] as const;

/** Normalised query string of just the filter params (for matching presets and saving). */
export function filterQuery(f: LeadFilters) {
  const p = new URLSearchParams();
  for (const k of LEAD_FILTER_KEYS) if (k !== "q" && f[k]) p.set(k, f[k]!);
  p.sort();
  return p.toString();
}
