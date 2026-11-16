// Leads list columns: which ones each person sees, and in what order (gear button on the table, Bitrix-style).
// Saved per person; a Super Admin can also set the default for everyone. Client-safe constants + server helpers.
export const LEAD_COLUMNS: { key: string; label: string }[] = [
  { key: "id", label: "ID" }, { key: "lead", label: "Lead" }, { key: "stage", label: "Stage" }, { key: "phone", label: "Phone" },
  { key: "activity", label: "Activity" }, { key: "created", label: "Created" }, { key: "owner", label: "Responsible" },
  { key: "reshuffle", label: "Reshuffle" }, { key: "source", label: "Source" }, { key: "sourceInfo", label: "Source information" },
  { key: "project", label: "Project" }, { key: "email", label: "E-mail" }, { key: "campaign", label: "Campaign" },
  { key: "location", label: "Location" }, { key: "interest", label: "Interest" }, { key: "propertyType", label: "Property type" },
  { key: "budget", label: "Budget" }, { key: "score", label: "Lead score" }, { key: "createdBy", label: "Created by" },
  { key: "lastActivity", label: "Last activity" }, { key: "modified", label: "Modified" },
];
export const DEFAULT_LEAD_COLUMNS = ["id", "lead", "stage", "phone", "activity", "created", "owner"];
export const cleanColumns = (cols: unknown) => {
  const valid = new Set(LEAD_COLUMNS.map((c) => c.key));
  const list = Array.isArray(cols) ? [...new Set(cols.map(String).filter((k) => valid.has(k)))] : [];
  return list.includes("lead") ? list : ["lead", ...list];
};

/** Columns the list can sort by (click the header): newest / oldest, A–Z / Z–A, high / low. */
export const SORTABLE_LEAD_COLUMNS = ["id", "lead", "stage", "phone", "created", "owner", "reshuffle", "source", "sourceInfo", "project", "email", "campaign", "location", "interest", "propertyType", "budget", "createdBy", "lastActivity", "modified"] as const;
/** sort param "created" = ascending, "-created" = descending. Default: newest first. */
export const parseLeadSort = (v?: string | null) => {
  const desc = !!v?.startsWith("-");
  const key = (v ?? "").replace(/^-/, "");
  return (SORTABLE_LEAD_COLUMNS as readonly string[]).includes(key) ? { key, desc } : { key: "created", desc: true };
};
