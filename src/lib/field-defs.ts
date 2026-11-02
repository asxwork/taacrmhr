// Field rules (Roles & Permissions → Field rules): per role, a sensitive field can be full, read-only, masked or
// hidden. Client-safe definitions; lib/field-rules.ts resolves them for a user.
export const FIELD_MODES = ["full", "readonly", "mask", "hidden"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];
export const FIELD_MODE_LABELS: Record<FieldMode, string> = { full: "Full access", readonly: "See, can't change", mask: "Masked (0300•••4567)", hidden: "Hidden" };
/** Most open first: a user with several roles gets the most open rule among them. */
const RANK: Record<FieldMode, number> = { full: 3, readonly: 2, mask: 1, hidden: 0 };
export const moreOpen = (a: FieldMode, b: FieldMode): FieldMode => (RANK[a] >= RANK[b] ? a : b);

export const FIELD_DEFS = [
  { key: "lead.phone", label: "Lead phone numbers", group: "CRM", modes: ["full", "readonly", "mask", "hidden"], about: "Masked: last digits only; Call and WhatsApp buttons still work" },
  { key: "lead.email", label: "Lead email", group: "CRM", modes: ["full", "readonly", "mask", "hidden"], about: "" },
  { key: "lead.budget", label: "Lead budget", group: "CRM", modes: ["full", "readonly", "hidden"], about: "" },
  { key: "deal.value", label: "Deal value & commission", group: "CRM", modes: ["full", "hidden"], about: "Deal amounts on lists, boards, deal pages and exports" },
  { key: "employee.salary", label: "Salary & benefits", group: "HR", modes: ["full", "hidden"], about: "Salary tab on employee profiles (still needs Payroll permission to see)" },
  { key: "employee.cnic", label: "CNIC & passport", group: "HR", modes: ["full", "mask", "hidden"], about: "Numbers and attachments" },
  { key: "employee.bank", label: "Bank accounts", group: "HR", modes: ["full", "hidden"], about: "Banks tab" },
  { key: "employee.documents", label: "Documents", group: "HR", modes: ["full", "hidden"], about: "Documents and letters" },
  { key: "employee.personal", label: "Personal details", group: "HR", modes: ["full", "hidden"], about: "Date of birth, family, religion, marital status, addresses, relatives" },
] as const satisfies readonly { key: string; label: string; group: string; modes: readonly FieldMode[]; about: string }[];
export type FieldKey = (typeof FIELD_DEFS)[number]["key"];
export type FieldAccess = Record<FieldKey, FieldMode>;
export const FULL_ACCESS = Object.fromEntries(FIELD_DEFS.map((f) => [f.key, "full"])) as FieldAccess;

export function maskPhone(v: string | null | undefined) {
  if (!v) return v ?? null;
  const d = v.replace(/\s/g, "");
  return d.length <= 6 ? "•••" : `${d.slice(0, 4)}•••${d.slice(-4)}`;
}
export function maskEmail(v: string | null | undefined) {
  if (!v) return v ?? null;
  const [name, domain] = v.split("@");
  return domain ? `${(name ?? "").slice(0, 1)}•••@${domain}` : "•••";
}
export function maskId(v: string | null | undefined) {
  if (!v) return v ?? null;
  return v.length <= 4 ? "•••" : `•••••${v.slice(-4)}`;
}
/** Shows a value per mode: full/readonly as is, mask through `masker`, hidden as null. */
export function shown<T extends string | null | undefined>(v: T, mode: FieldMode, masker: (x: T) => string | null = () => "•••") {
  return mode === "hidden" ? null : mode === "mask" ? masker(v) : v;
}
