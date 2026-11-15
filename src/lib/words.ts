// Amounts in words for vouchers and invoices, the way they're written in Pakistan (lakh, crore).
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function upTo999(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r]! : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} Hundred` : "", rest].filter(Boolean).join(" ");
}

/** 1250000 → "Twelve Lakh Fifty Thousand Rupees Only". */
export function rupeesInWords(amount: number) {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  for (const [size, name] of [[10_000_000, "Crore"], [100_000, "Lakh"], [1000, "Thousand"]] as const) {
    const q = Math.floor(n / size);
    if (q) { parts.push(`${q >= 1000 ? rupeesInWords(q).replace(" Rupees Only", "") : upTo999(q)} ${name}`); n %= size; }
  }
  if (n) parts.push(upTo999(n));
  return `${parts.join(" ")} Rupees Only`;
}
