// Client-safe CRM helpers and constants (no database access).

/** Pakistani numbers → 03xxxxxxxxx so +92 300 1234567, 0300-1234567 and 923001234567 all match. */
export function phoneKey(phone: string | null | undefined) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  if (d.startsWith("92") && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) d = "0" + d;
  return d || null;
}

/** Display form with country code: 0300-1234567 → +92 300 1234567, 021-1234567 → +92 21 1234567. Other numbers keep their own +code. */
export function fmtPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const key = phoneKey(phone);
  if (key && /^03\d{9}$/.test(key)) return `+92 ${key.slice(1, 4)} ${key.slice(4)}`;
  if (key && /^0[1-9]\d{8,9}$/.test(key)) return `+92 ${key.slice(1, 3)} ${key.slice(3)}`;
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  return raw.startsWith("+") || digits.length < 11 ? raw : `+${digits}`;
}

/** tel: link that dials the international form. */
export const telHref = (phone: string | null | undefined) => `tel:${fmtPhone(phone).replace(/\s/g, "")}`;
/** WhatsApp chat link (wa.me wants the full international number, digits only). */
export const waHref = (phone: string | null | undefined) => `https://wa.me/${fmtPhone(phone).replace(/\D/g, "")}`;

/** PKR in lakh/crore shorthand: 15000000 → "1.5 Cr", 450000 → "4.5 L". */
export function fmtPKR(n: number | null | undefined, opts: { prefix?: boolean } = {}) {
  if (n == null) return "—";
  const p = opts.prefix === false ? "" : "PKR ";
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, "");
  if (Math.abs(n) >= 1e7) return `${p}${trim(n / 1e7)} Cr`;
  if (Math.abs(n) >= 1e5) return `${p}${trim(n / 1e5)} L`;
  return `${p}${n.toLocaleString("en-PK")}`;
}

/** Accepts "1.5cr", "45 lac", "45L", "15,000,000" → number. */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, "");
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*(cr|crore|crores|l|lac|lacs|lakh|lakhs|k|m)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (Number.isNaN(n)) return null;
  const mult = { cr: 1e7, crore: 1e7, crores: 1e7, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, k: 1e3, m: 1e6 }[m[2] ?? ""] ?? 1;
  return Math.round(n * mult);
}

export const INTERESTS = [
  { value: "buy", label: "Buy" },
  { value: "rent", label: "Rent" },
  { value: "invest", label: "Invest" },
  { value: "sell", label: "Sell / List" },
] as const;

export const PROPERTY_TYPES = ["Apartment", "House", "Plot", "Shop", "Office", "Farmhouse", "Building"] as const;

export const ACTIVITY_TYPES = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "visit", label: "Site visit" },
  { value: "task", label: "Task" },
] as const;

/** Colour tokens for statuses/stages. Static strings so Tailwind keeps them. */
export const COLORS: Record<string, { dot: string; pill: string; bar: string }> = {
  slate: { dot: "bg-slate-400", pill: "bg-slate-100 text-slate-700", bar: "bg-slate-400" },
  blue: { dot: "bg-sky-500", pill: "bg-sky-50 text-sky-700", bar: "bg-sky-500" },
  violet: { dot: "bg-violet-500", pill: "bg-violet-50 text-violet-700", bar: "bg-violet-500" },
  amber: { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  teal: { dot: "bg-teal-500", pill: "bg-teal-50 text-teal-700", bar: "bg-teal-500" },
  gold: { dot: "bg-gold-600", pill: "bg-gold-100 text-gold-700", bar: "bg-gold-600" },
  green: { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  red: { dot: "bg-red-500", pill: "bg-red-50 text-red-700", bar: "bg-red-500" },
};
export const COLOR_NAMES = Object.keys(COLORS);
export const color = (c: string) => COLORS[c] ?? COLORS.slate!;
