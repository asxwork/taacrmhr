// Client-safe inventory constants and helpers.
import { addMonths } from "date-fns";

export const UNIT_STATUSES = [
  { value: "available", label: "Available", color: "green" },
  { value: "hold", label: "On hold", color: "amber" },
  { value: "booked", label: "Booked", color: "blue" },
  { value: "sold", label: "Sold", color: "red" },
  { value: "rented", label: "Rented", color: "violet" },
  { value: "offmarket", label: "Off-market", color: "slate" },
] as const;
export const unitStatus = (v: string) => UNIT_STATUSES.find((s) => s.value === v) ?? UNIT_STATUSES[5];

export const UNIT_TYPES = ["Apartment", "House", "Plot", "Shop", "Office", "Penthouse", "Farmhouse", "Building"] as const;
export const SIZE_UNITS = [
  { value: "sqft", label: "sq ft" },
  { value: "sqyd", label: "sq yd" },
  { value: "marla", label: "marla" },
  { value: "kanal", label: "kanal" },
] as const;
export const sizeLabel = (size: number | null, unit: string) => (size ? `${size.toLocaleString("en-PK")} ${SIZE_UNITS.find((u) => u.value === unit)?.label ?? unit}` : "—");

/** Common Karachi areas offered as suggestions (any other area can be typed). */
export const KNOWN_AREAS = [
  "DHA Phase 1", "DHA Phase 2", "DHA Phase 2 Ext", "DHA Phase 4", "DHA Phase 5", "DHA Phase 6", "DHA Phase 7", "DHA Phase 7 Ext", "DHA Phase 8", "DHA City",
  "Clifton", "Bahria Town Karachi", "Scheme 33", "Scheme 45", "Gulshan-e-Iqbal", "Gulistan-e-Jauhar", "PECHS", "Bahadurabad", "Tariq Road",
  "North Nazimabad", "Federal B Area", "Saddar", "Shahrah-e-Faisal", "Malir Cantt", "Karachi Cantt", "KDA Scheme 1", "Naya Nazimabad", "Gadap", "Super Highway",
] as const;

/** Best guess of a listing's area from its address: the longest known area (or project location) it mentions. */
export function guessArea(address: string | null | undefined, extra: string[] = []) {
  if (!address) return null;
  const a = address.toLowerCase();
  const hit = [...extra, ...KNOWN_AREAS].filter((k) => k && a.includes(k.toLowerCase())).sort((x, y) => y.length - x.length)[0];
  return hit ?? null;
}

/** A unit's area: its own, else its project's location, else guessed from the address. */
export const areaOf = (u: { area?: string | null; address?: string | null; project?: { location: string | null } | null }) => u.area || u.project?.location || guessArea(u.address);

export const LISTING_TYPES = [
  { value: "project", label: "Project stock" },
  { value: "resale", label: "Resale listing" },
  { value: "rental", label: "Rental listing" },
] as const;

export const FREQUENCIES = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "quarterly", label: "Quarterly", months: 3 },
  { value: "biannual", label: "Every 6 months", months: 6 },
] as const;

export const PAYMENT_METHODS = ["Cash", "Cheque", "Bank transfer", "Pay order", "Online"] as const;

/** Down payment → equal installments → optional possession amount. Rounds to whole rupees; remainder goes on the last row. */
export function buildSchedule(p: { total: number; downPct: number; installments: number; frequency: string; possessionPct: number; startDate: Date }) {
  const months = FREQUENCIES.find((f) => f.value === p.frequency)?.months ?? 1;
  const down = Math.round((p.total * p.downPct) / 100);
  const possession = Math.round((p.total * p.possessionPct) / 100);
  const remaining = p.total - down - possession;
  const each = p.installments > 0 ? Math.floor(remaining / p.installments) : 0;

  const rows: { seq: number; label: string; dueDate: Date; amount: number }[] = [];
  if (down > 0) rows.push({ seq: 0, label: "Down payment", dueDate: p.startDate, amount: down });
  for (let i = 1; i <= p.installments; i++) {
    const amount = i === p.installments ? remaining - each * (p.installments - 1) : each;
    rows.push({ seq: i, label: `Installment ${i}`, dueDate: addMonths(p.startDate, i * months), amount });
  }
  if (possession > 0) rows.push({ seq: p.installments + 1, label: "On possession", dueDate: addMonths(p.startDate, (p.installments + 1) * months), amount: possession });
  return rows;
}
