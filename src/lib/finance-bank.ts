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

// ── Matching ──────────────────────────────────────────────────────────────────────────────────────────────
// Each bank line is scored against entries of the same holder: amount (exact, or within bank charges), date
// (same day … a week apart) and the words in the description vs the entry's payee / description. A sure match is
// linked on its own; a likely one is suggested with a Match button.

const STOP = new Set(["the", "and", "for", "from", "to", "payment", "paid", "transfer", "trf", "ibft", "ift", "funds", "fund", "online", "pos", "purchase", "ref", "txn", "debit", "credit", "card", "account", "acc", "bank", "pk", "pkr", "rs", "via", "mobile", "app", "raast", "charges"]);
export const words = (s: string | null | undefined) => [...new Set((s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)))];

type LineLike = { amount: number; date: Date; description: string };
type EntryLike = { id: string; amount: number; date: Date; description: string; party: string | null };

/** 0–100: how likely this entry is the bank line, with the reasons. */
export function scoreMatch(l: LineLike, e: EntryLike) {
  const why: string[] = [];
  let s = 0;
  const diff = Math.abs(l.amount - e.amount);
  if (diff <= 0.5) { s += 50; why.push("same amount"); }
  else if (diff <= Math.max(100, l.amount * 0.01)) { s += 30; why.push(`amount ${Math.round(diff)} apart (bank charges?)`); }
  else return { score: 0, why };
  const days = Math.round(Math.abs(+l.date - +e.date) / 86_400_000);
  if (days === 0) { s += 25; why.push("same day"); } else if (days <= 3) { s += 15; why.push(`${days} day${days === 1 ? "" : "s"} apart`); } else if (days <= 7) { s += 5; why.push(`${days} days apart`); } else return { score: 0, why };
  const lw = words(l.description), ew = new Set(words(`${e.party ?? ""} ${e.description}`));
  const common = lw.filter((w) => ew.has(w) || [...ew].some((x) => x.length >= 4 && (x.startsWith(w) || w.startsWith(x))));
  if (common.length) { s += Math.min(25, 12 * common.length); why.push(`“${common.slice(0, 2).join(", ")}” in both`); }
  return { score: Math.min(100, s), why };
}

const candidateWhere = (accountId: string, l: { amount: number; date: Date; direction: string }) => ({
  amount: { gte: l.amount - Math.max(100, l.amount * 0.01), lte: l.amount + Math.max(100, l.amount * 0.01) },
  date: { gte: new Date(+l.date - 7 * 86_400_000), lte: new Date(+l.date + 7 * 86_400_000) }, status: { not: "rejected" },
  ...(l.direction === "out" ? { accountId, kind: { in: ["expense", "transfer"] } } : { OR: [{ accountId, kind: "in" }, { toAccountId: accountId, kind: "transfer" }] }),
});

/** Links every sure match: same amount within 3 days, or a score of 75+ (amount, date and payee all agree). */
export async function matchLines(accountId: string) {
  const open = await db.finBankLine.findMany({ where: { accountId, entryId: null, ignored: false }, orderBy: { date: "asc" } });
  const used = new Set((await db.finBankLine.findMany({ where: { accountId, entryId: { not: null } }, select: { entryId: true } })).map((l) => l.entryId!));
  let matched = 0;
  for (const l of open) {
    const cands = (await db.finEntry.findMany({ where: candidateWhere(accountId, l), select: { id: true, amount: true, date: true, description: true, party: true } })).filter((c) => !used.has(c.id));
    const best = cands.map((c) => ({ c, ...scoreMatch(l, c) })).sort((a, b) => b.score - a.score)[0];
    const sure = best && (best.score >= 75 || (Math.abs(best.c.amount - l.amount) <= 0.5 && Math.abs(+best.c.date - +l.date) <= 3 * 86_400_000));
    if (best && sure) { await db.finBankLine.update({ where: { id: l.id }, data: { entryId: best.c.id } }); used.add(best.c.id); matched++; }
  }
  return matched;
}

/** For lines still open: the most likely entry (score 45+) to confirm with one click. */
export async function suggestMatches(accountId: string, lines: { id: string; amount: number; date: Date; description: string; direction: string }[]) {
  const used = new Set((await db.finBankLine.findMany({ where: { accountId, entryId: { not: null } }, select: { entryId: true } })).map((l) => l.entryId!));
  const out = new Map<string, { id: string; description: string; amount: number; date: Date; score: number; why: string[] }>();
  for (const l of lines.slice(0, 150)) {
    const cands = (await db.finEntry.findMany({ where: candidateWhere(accountId, l), select: { id: true, amount: true, date: true, description: true, party: true } })).filter((c) => !used.has(c.id));
    const best = cands.map((c) => ({ ...c, ...scoreMatch(l, c) })).sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= 45) out.set(l.id, best);
  }
  return out;
}

/** The keyword a rule is learned under: the first two meaningful words of the description. */
export const ruleKey = (description: string) => words(description).slice(0, 2).join(" ");

/** Remembers the category / payee picked for a bank line, for lines like it next time. */
export async function learnRule(description: string, categoryId: string | null, party: string | null) {
  const keyword = ruleKey(description);
  if (!keyword || (!categoryId && !party)) return;
  const have = await db.finBankRule.findFirst({ where: { keyword } });
  if (have) await db.finBankRule.update({ where: { id: have.id }, data: { categoryId: categoryId ?? have.categoryId, party: party ?? have.party, uses: { increment: 1 } } });
  else await db.finBankRule.create({ data: { keyword, categoryId, party } });
}

/** Learned category / payee for each line, from the rules. */
export async function ruleSuggestions(lines: { id: string; description: string }[]) {
  const keys = [...new Set(lines.map((l) => ruleKey(l.description)).filter(Boolean))];
  const rules = new Map((await db.finBankRule.findMany({ where: { keyword: { in: keys } } })).map((r) => [r.keyword, r]));
  return new Map(lines.flatMap((l) => { const r = rules.get(ruleKey(l.description)); return r ? [[l.id, r] as const] : []; }));
}
