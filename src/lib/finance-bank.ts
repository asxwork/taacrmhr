// Bank / JazzCash / Easypaisa statement upload: reads the lines, then matches each to a Finance entry
// (same holder, same amount, date within 3 days). Unmatched lines = money moved with no entry; unmatched entries = entry with no bank line.
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "./db";

type Line = { date: Date; description: string; amount: number; direction: "in" | "out" };

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[,\s]|Rs\.?|PKR/gi, "").replace(/^\((.*)\)$/, "-$1")); return Number.isFinite(n) ? n : 0; };
function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[/\-. ](\d{1,2}|[A-Za-z]{3})[/\-. ](\d{2,4})/);
  if (m) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mo = /\d/.test(m[2]!) ? Number(m[2]) - 1 : months.indexOf(m[2]!.toLowerCase());
    const y = Number(m[3]!.length === 2 ? `20${m[3]}` : m[3]);
    const d = new Date(y, mo, Number(m[1]), 12);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Reads the statement's table: finds the header row (date + debit/credit or amount) and returns its lines. */
export async function readStatement(name: string, buf: ArrayBuffer): Promise<Line[]> {
  let rows: unknown[][];
  if (/\.csv$/i.test(name)) rows = csvRows(new TextDecoder().decode(buf));
  else {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const ws = wb.worksheets[0]!;
    rows = [];
    ws.eachRow({ includeEmpty: false }, (r) => rows.push((r.values as ExcelJS.CellValue[]).slice(1).map((v) => (v && typeof v === "object" && !(v instanceof Date) ? ("result" in v ? v.result : "text" in v ? v.text : "richText" in v ? v.richText.map((t) => t.text).join("") : "") : v))));
  }
  const low = (r: unknown[]) => r.map((c) => String(c ?? "").toLowerCase().trim());
  const hi = rows.findIndex((r) => { const l = low(r); return l.some((c) => c.includes("date")) && l.some((c) => /debit|withdraw|credit|deposit|amount|paid out|paid in/.test(c)); });
  if (hi < 0) throw new Error("Could not find the header row (needs a Date column and Debit/Credit or Amount).");
  const h = low(rows[hi]!);
  const find = (re: RegExp) => h.findIndex((c) => re.test(c));
  const findNot = (re: RegExp, not: number) => h.findIndex((c, i) => i !== not && re.test(c));
  const cDate = find(/date/), cDesc = [findNot(/desc|narration/, cDate), findNot(/details|particular|remarks/, cDate), findNot(/transaction/, cDate)].find((i) => i >= 0) ?? -1, cDebit = find(/debit|withdraw|paid out/), cCredit = find(/credit|deposit|paid in/), cAmt = find(/^amount|amount$/), cType = find(/^type$|dr\/cr|cr\/dr/);
  const out: Line[] = [];
  for (const r of rows.slice(hi + 1)) {
    const date = toDate(r[cDate]); if (!date) continue;
    const desc = String(cDesc >= 0 ? r[cDesc] ?? "" : "").replace(/\s+/g, " ").trim().slice(0, 300) || "Bank line";
    let amount = 0, direction: "in" | "out" = "out";
    if (cDebit >= 0 || cCredit >= 0) { const d = cDebit >= 0 ? Math.abs(num(r[cDebit])) : 0, c = cCredit >= 0 ? Math.abs(num(r[cCredit])) : 0; if (d) { amount = d; direction = "out"; } else if (c) { amount = c; direction = "in"; } }
    else if (cAmt >= 0) { const a = num(r[cAmt]); const t = cType >= 0 ? String(r[cType] ?? "").toLowerCase() : ""; amount = Math.abs(a); direction = t.startsWith("cr") ? "in" : t.startsWith("dr") ? "out" : a < 0 ? "out" : "in"; }
    if (amount > 0) out.push({ date, description: desc, amount, direction });
  }
  return out;
}

/** Saves new lines for a holder (re-uploading the same statement adds nothing) and matches every unmatched line. */
export async function importStatement(accountId: string, lines: Line[]) {
  const seen = new Map<string, number>();
  let added = 0;
  for (const l of lines) {
    const base = `${accountId}|${l.date.toISOString().slice(0, 10)}|${l.amount}|${l.direction}|${l.description}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    const importKey = createHash("sha1").update(`${base}|${n}`).digest("hex");
    if (await db.finBankLine.findUnique({ where: { importKey } })) continue;
    await db.finBankLine.create({ data: { accountId, ...l, importKey } });
    added++;
  }
  return { added, matched: await matchLines(accountId) };
}

export async function matchLines(accountId: string) {
  const open = await db.finBankLine.findMany({ where: { accountId, entryId: null, ignored: false }, orderBy: { date: "asc" } });
  const used = new Set((await db.finBankLine.findMany({ where: { accountId, entryId: { not: null } }, select: { entryId: true } })).map((l) => l.entryId!));
  let matched = 0;
  for (const l of open) {
    const from = new Date(l.date.getTime() - 3 * 86400000), to = new Date(l.date.getTime() + 3 * 86400000);
    const cands = await db.finEntry.findMany({ where: { amount: { gte: l.amount - 0.5, lte: l.amount + 0.5 }, date: { gte: from, lte: to }, status: { not: "rejected" },
      ...(l.direction === "out" ? { accountId, kind: { in: ["expense", "transfer"] } } : { OR: [{ accountId, kind: "in" }, { toAccountId: accountId, kind: "transfer" }] }) }, orderBy: { date: "asc" } });
    const e = cands.filter((c) => !used.has(c.id)).sort((a, b) => Math.abs(a.date.getTime() - l.date.getTime()) - Math.abs(b.date.getTime() - l.date.getTime()))[0];
    if (e) { await db.finBankLine.update({ where: { id: l.id }, data: { entryId: e.id } }); used.add(e.id); matched++; }
  }
  return matched;
}
