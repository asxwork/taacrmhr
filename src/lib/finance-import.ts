// Import the company's expense workbook (TAA expense sheet): BUSHRA / SAMAD / OTHER ENTRIES and Sir Personal Expense.
// Columns are found by their header names, spelling of categories is tidied, and re-importing the same rows is
// skipped (each row gets a fingerprint), so the sheet can be imported again after more rows are added.
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "./db";
import { ensureFinanceDefaults, payeeKey } from "./finance";

const MAIN: Record<string, string> = {
  entertainment: "Entertainment", "facilities & office": "Facilities & Office", groceries: "Groceries", "employee & hr": "Employee & HR",
  "marketing expense": "Marketing", marketing: "Marketing", miscellenious: "Miscellaneous", miscellaneous: "Miscellaneous", "personal expense": "Owner personal",
};
const SUB: Record<string, string> = {
  conveyence: "Conveyance", conveyance: "Conveyance", salaries: "Salaries", overtime: "Overtime", "advance/loan": "Advance/Loan", commission: "Commission",
  "office equipemnt": "Office Equipment", "office equipment": "Office Equipment", "repair & main": "Repair & Maintenance", "repair & main.": "Repair & Maintenance",
  statinoery: "Stationery", stationery: "Stationery", utilities: "Utilities", maintenance: "Maintenance", rent: "Rent", "chai/coffee/juices": "Chai/Coffee/Juices",
  "guest lunches/dinners": "Guest Lunches/Dinners", refreshments: "Refreshments", "it & software": "IT & Software", "social media ads": "Social Media Ads",
  subscriptions: "Subscriptions", "web hosting/domains": "Web Hosting/Domains", "petty cash to staff": "Petty cash to staff", miscellenious: "Miscellaneous", miscellaneous: "Miscellaneous",
};
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
  }
  return String(v);
};
const cellNum = (v: ExcelJS.CellValue) => { const n = typeof v === "number" ? v : typeof v === "object" && v && "result" in v ? Number(v.result) : Number(cellText(v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
const cellDate = (v: ExcelJS.CellValue) => (v instanceof Date ? v : typeof v === "object" && v && "result" in v && v.result instanceof Date ? v.result : null);

export type ImportResult = { added: number; skipped: number; perSheet: Record<string, number>; holders: string[] };

/** People who handle the Bahadurabad branch's cash (petty cash Bushra sends them is a transfer to the branch). */
const BRANCH_PEOPLE: [RegExp, string][] = [[/affan/i, "Affan"], [/riaz|riyaz/i, "Riaz"], [/faizan/i, "Faizan"]];
export const BRANCH_NAME = "Bahadurabad";

export async function importExpenseWorkbook(buffer: ArrayBuffer, userId: string, opts: { replace?: boolean } = {}): Promise<ImportResult & { removed: number }> {
  await ensureFinanceDefaults();
  // Replace: remove what earlier imports added (entries typed in by hand stay).
  const removed = opts.replace ? (await db.finEntry.deleteMany({ where: { importKey: { not: null } } })).count : 0;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // Caches for holders and categories (created on first use).
  const holders = new Map((await db.finAccount.findMany()).map((a) => [a.name.toLowerCase(), a.id]));
  const created: string[] = [];
  const holder = async (name: string, kind: string, branch?: string) => {
    const key = name.toLowerCase();
    if (!holders.has(key)) { holders.set(key, (await db.finAccount.create({ data: { name, kind, branch } })).id); created.push(name); }
    return holders.get(key)!;
  };
  const cats = await db.finCategory.findMany();
  const catId = async (rawMain: string, rawSub: string) => {
    const mainKey = clean(rawMain).replace(/\(.*?\)/g, "").trim().toLowerCase();
    const mainName = MAIN[mainKey] ?? title(mainKey || "Miscellaneous");
    let main = cats.find((c) => !c.parentId && c.name.toLowerCase() === mainName.toLowerCase());
    if (!main) { main = await db.finCategory.create({ data: { name: mainName, sortOrder: 50 } }); cats.push(main); }
    const subKey = clean(rawSub).toLowerCase();
    if (!subKey || subKey === "none" || subKey === mainKey) return { id: main.id, personal: main.personal };
    const subName = SUB[subKey] ?? title(clean(rawSub));
    let sub = cats.find((c) => c.parentId === main!.id && c.name.toLowerCase() === subName.toLowerCase());
    if (!sub) { sub = await db.finCategory.create({ data: { name: subName, parentId: main.id, personal: main.personal, sortOrder: 50 } }); cats.push(sub); }
    return { id: sub.id, personal: main.personal };
  };
  const ownerName = (s: string) => { const t = clean(s); if (/mubeen/i.test(t)) return { name: "Mubeen sir", kind: "owner" }; return { name: title(t.toLowerCase()) || "Unknown", kind: "person" }; };

  const seen = new Map<string, number>();
  const fingerprint = (sheet: string, parts: unknown[]) => {
    const base = `${sheet}|${parts.map((p) => (p instanceof Date ? p.toISOString().slice(0, 10) : String(p))).join("|")}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash("sha1").update(`${base}|${n}`).digest("hex");
  };
  const res = { added: 0, skipped: 0, perSheet: {} as Record<string, number>, holders: created, removed };
  // One spelling per payee: "qasim", "Qasim " and "QASIM" all become the first one seen.
  const payees = new Map<string, string>();
  const add = async (sheet: string, data: Parameters<typeof db.finEntry.create>[0]["data"], key: string) => {
    if (await db.finEntry.findUnique({ where: { importKey: key } })) { res.skipped++; return; }
    if (typeof data.party === "string" && data.party) {
      const k = payeeKey(data.party);
      if (!payees.has(k)) payees.set(k, data.party.length > 2 && data.party === data.party.toLowerCase() ? title(data.party) : data.party);
      data = { ...data, party: payees.get(k) };
    }
    await db.finEntry.create({ data: { ...data, importKey: key, createdById: userId } });
    res.added++; res.perSheet[sheet] = (res.perSheet[sheet] ?? 0) + 1;
  };

  for (const ws of wb.worksheets) {
    const name = ws.name.toUpperCase();
    const type = name.includes("BUSHRA") ? "bushra" : name.includes("SAMAD") ? "samad" : name.includes("OTHER") ? "other" : name.includes("PERSONAL") ? "personal" : null;
    if (!type) continue;
    // Header row: the row whose cells include "date" and "amount…".
    let header = 0; const col: Record<string, number> = {};
    ws.eachRow((row, r) => {
      if (header) return;
      const cells = (row.values as ExcelJS.CellValue[]).map((v) => cellText(v).toLowerCase().trim());
      if (cells.includes("date") && cells.some((c) => c.startsWith("amount")) && cells.some((c) => c.startsWith("description"))) {
        header = r;
        cells.forEach((c, i) => {
          if (c === "date") col.date = i; else if (c.startsWith("categ") || c.startsWith("caterg")) col.cat = i; else if (c.startsWith("sub")) col.sub = i;
          else if (c.startsWith("description")) col.desc = i; else if (c.startsWith("amount")) col.amount = i; else if (c.startsWith("received")) col.received = i;
          else if (c.startsWith("paid to")) col.paidTo = i; else if (c.startsWith("paid by")) col.paidBy = i; else if (c.startsWith("notes")) col.notes = i;
        });
      }
    });
    if (!header || !col.date || !col.amount) continue;
    const sheetHolder = type === "bushra" ? await holder("Bushra (petty cash)", "petty") : type === "samad" ? await holder("Samad (marketing)", "person") : type === "personal" ? await holder("Sir personal cash", "petty") : null;

    for (let r = header + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const v = (k: string) => (col[k] ? row.getCell(col[k]).value : null);
      const date = cellDate(v("date"));
      if (!date) continue;
      const amount = cellNum(v("amount")), received = cellNum(v("received"));
      const cat = clean(cellText(v("cat"))), sub = clean(cellText(v("sub"))), desc = clean(cellText(v("desc"))) || cat || "Expense";
      const paidTo = clean(cellText(v("paidTo"))), notes = clean(cellText(v("notes"))) || null;
      const personal = type === "personal";
      if (received > 0 && sheetHolder) {
        await add(ws.name, { date, kind: "in", amount: received, accountId: sheetHolder, description: personal ? "Money received for Sir personal cash" : "Petty cash received", personal }, fingerprint(ws.name, ["in", date, received, r]));
      }
      if (!(amount > 0)) continue;
      const from = sheetHolder ?? (await holder(ownerName(cellText(v("paidBy"))).name, ownerName(cellText(v("paidBy"))).kind));
      // Internal transfer to someone who keeps their own sheet (Samad, Bushra): money moving between holders, counted
      // once when they spend it. Petty cash handed to staff who don't keep a sheet (Affan, Faizan, …) is spending.
      const isTransfer = /internal transfer/i.test(cat) || /petty ?cash/i.test(desc) || /^petty cash$/i.test(cat);
      if (isTransfer && paidTo && /samad|bushra/i.test(paidTo)) {
        const to = /samad/i.test(paidTo) ? await holder("Samad (marketing)", "person") : await holder("Bushra (petty cash)", "petty");
        if (to !== from) { await add(ws.name, { date, kind: "transfer", amount, accountId: from, toAccountId: to, description: desc, notes }, fingerprint(ws.name, ["r", date, amount, desc, paidTo])); continue; }
      }
      const branchPerson = isTransfer && !sub ? BRANCH_PEOPLE.find(([re]) => re.test(paidTo) || re.test(desc)) : undefined;
      if (branchPerson && !personal) {
        const to = await holder(`${branchPerson[1]} (${BRANCH_NAME})`, "petty", BRANCH_NAME);
        await add(ws.name, { date, kind: "transfer", amount, accountId: from, toAccountId: to, description: desc, notes }, fingerprint(ws.name, ["r", date, amount, desc, paidTo]));
        continue;
      }
      if (isTransfer && !personal) {
        const c = sub ? await catId("Marketing", sub) : /\bapp\b|software|cloud|meta|ad.?s\b/i.test(desc) ? await catId("Marketing", "IT & Software") : await catId("Miscellaneous", "Petty cash to staff");
        await add(ws.name, { date, kind: "expense", amount, accountId: from, categoryId: c.id, description: desc, party: paidTo || null, notes }, fingerprint(ws.name, ["r", date, amount, desc, paidTo]));
        continue;
      }
      const c = personal ? await catId("Personal Expense", "") : await catId(cat, sub);
      await add(ws.name, { date, kind: "expense", amount, accountId: from, categoryId: c.id, description: desc, party: paidTo || null, notes, personal: personal || c.personal }, fingerprint(ws.name, ["r", date, amount, desc, paidTo]));
    }
  }
  return res;
}
