// Free bill reading (OCR) in the browser: the photo is read with Tesseract (no key, no cost), then the text is searched
// for the total, date, shop, bill number, NTN, phone and tax. Client-safe; the reading itself runs on the device.

export type BillRead = { amount: number | null; date: string | null; payee: string | null; billNo: string | null; vendorNtn: string | null; vendorPhone: string | null; taxAmount: number | null; billDetails: string | null };

const num = (s: string | undefined) => { if (!s) return null; const n = Number(s.replace(/[,\s]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
const AMOUNT = "(?:rs\\.?|pkr|aed|\\$)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)";

/** Finds the bill's details in the text read from it. */
export function parseBillText(text: string): BillRead {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const all = lines.join("\n");
  const find = (re: RegExp) => { for (const l of lines) { const m = l.match(re); if (m) return m; } return null; };

  // Total: grand / net total first, then the last plain "total" line, else the biggest amount on the bill.
  let amount: number | null = null;
  for (const re of [new RegExp(`(?:grand\\s*total|net\\s*(?:total|payable|amount)|amount\\s*(?:payable|due)|total\\s*(?:amount|payable|due)|balance\\s*due)\\W*${AMOUNT}`, "i")]) {
    const m = find(re); if (m) amount = num(m[1]);
  }
  if (!amount) {
    const totals = lines.map((l) => l.match(new RegExp(`\\btotal\\b(?!\\s*(?:items?|qty|quantity))\\W*${AMOUNT}`, "i"))).filter(Boolean) as RegExpMatchArray[];
    if (totals.length) amount = num(totals[totals.length - 1]![1]);
  }
  if (!amount) {
    const nums = [...all.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+\.[0-9]{2})/g)].map((m) => num(m[1])).filter((n): n is number => !!n && n < 1e8);
    if (nums.length) amount = Math.max(...nums);
  }

  // Date: 12/11/2026 (day first, as in Pakistan), 2026-11-12, 12 Nov 2026, Nov 12, 2026.
  let date: string | null = null;
  const d1 = all.match(/\b([0-3]?\d)[/.-]([01]?\d)[/.-](\d{2,4})\b/);
  const d2 = all.match(/\b(20\d{2})[/.-]([01]?\d)[/.-]([0-3]?\d)\b/);
  const d3 = all.match(/\b([0-3]?\d)[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]*(\d{2,4})\b/i);
  const d4 = all.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+([0-3]?\d),?\s+(\d{4})\b/i);
  const yr = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  if (d2) date = iso(Number(d2[1]), Number(d2[2]), Number(d2[3]));
  if (!date && d1) date = iso(yr(d1[3]!), Number(d1[2]), Number(d1[1]));
  if (!date && d3) date = iso(yr(d3[3]!), MONTHS.indexOf(d3[2]!.toLowerCase().slice(0, 3)) + 1, Number(d3[1]));
  if (!date && d4) date = iso(Number(d4[3]), MONTHS.indexOf(d4[1]!.toLowerCase().slice(0, 3)) + 1, Number(d4[2]));

  // "Invoice No: INV-0871", "Reference No 0400…", "Receipt # 552" (needs No / # / Number, and a digit in it).
  const billNo = lines.map((l) => l.match(/\b(?:invoice|inv|bill|receipt|rcpt|order|ref(?:erence)?|voucher|txn|transaction)\b\.?\s*(?:no\.?|number|num|#|id)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/-]{2,})/i)?.[1]).find((x) => x && /\d/.test(x)) ?? null;
  const vendorNtn = find(/\b(?:NTN|N\.T\.N|STRN|GST\s*No)\W*([0-9][0-9-]{5,})/i)?.[1] ?? null;
  const vendorPhone = find(/(?<![\d])((?:\+92|0092|0)\s?3\d{2}[\s-]?\d{7}|(?:\+92|0)\s?(?:21|42|51|22|41|61|91)[\s-]\d{7,8}|\+971\s?(?:4|5\d)[\s-]?\d{7})(?![\d])/)?.[1]?.replace(/\s+/g, " ") ?? null;
  // "GST 18% 486.00": skip the rate, take the amount.
  const tax = find(new RegExp(`\\b(?:gst|sales\\s*tax|s\\.?\\s*tax|vat|tax|fbr\\s*fee)\\b(?![^0-9]*no)[^0-9]{0,15}(?:[0-9]+(?:\\.[0-9]+)?\\s*%[^0-9]{0,10})?${AMOUNT}(?!\\s*%)`, "i"));
  const taxAmount = tax ? num(tax[1]) : null;
  // Shop: the first line near the top that's mostly letters (not a date, number, address or "tax invoice").
  const payee = lines.slice(0, 6).find((l) => /[A-Za-z]{3,}/.test(l) && (l.match(/\d/g)?.length ?? 0) < 4 && !/invoice|receipt|bill|tax|ntn|date|tel|phone|address|cash memo|customer/i.test(l))?.slice(0, 80) ?? null;
  return { amount, date, payee, billNo, vendorNtn, vendorPhone, taxAmount: taxAmount && amount && taxAmount < amount ? taxAmount : null, billDetails: lines.join("\n").slice(0, 1500) || null };
}

/** Reads a bill photo on this device. Images only (a PDF can't be read this way). */
export async function readBillOnDevice(file: File, onProgress?: (p: number) => void): Promise<BillRead | null> {
  if (!/^image\//.test(file.type)) return null;
  const { createWorker } = await import("tesseract.js");
  // Everything is served by AMS itself (public/ocr, copied at build), so it works without outside websites.
  const worker = await createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr", logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") onProgress?.(m.progress); } });
  try {
    const { data } = await worker.recognize(file);
    return parseBillText(data.text ?? "");
  } finally {
    await worker.terminate();
  }
}
