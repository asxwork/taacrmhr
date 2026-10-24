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
