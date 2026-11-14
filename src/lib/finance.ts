// Finance app: money holders (FinAccount), categories (FinCategory) and entries (FinEntry).
// Company spending = expense entries that aren't personal. Transfers move money between holders and are never
// counted as spending, so "Bushra gave Samad 6k, Samad bought an app" shows as one 6k expense.
import type { Prisma } from "@prisma/client";
import { endOfMonth, parse, startOfMonth } from "date-fns";
import { db } from "./db";

export const ACCOUNT_KINDS = [
  ["petty", "Petty cash"],
  ["person", "Person paying for the company"],
  ["owner", "Owner"],
  ["bank", "Bank account"],
  ["card", "Card"],
] as const;
export const kindLabel = (k: string) => ACCOUNT_KINDS.find(([v]) => v === k)?.[1] ?? k;

export const ENTRY_KINDS = [["expense", "Expense"], ["in", "Money in"], ["transfer", "Transfer"]] as const;

/** The company's categories (from the expense sheet). Created once when the Finance app is first opened. */
export const DEFAULT_CATEGORIES: { name: string; subs: string[]; personal?: boolean }[] = [
  { name: "Entertainment", subs: ["Guest Lunches/Dinners", "Refreshments", "Chai/Coffee/Juices"] },
  { name: "Facilities & Office", subs: ["Maintenance", "Repair & Maintenance", "Rent", "Utilities", "Office Equipment", "Stationery"] },
  { name: "Groceries", subs: [] },
  { name: "Employee & HR", subs: ["Salaries", "Overtime", "Advance/Loan", "Commission", "Conveyance"] },
  { name: "Marketing", subs: ["Social Media Ads", "IT & Software", "Subscriptions", "Web Hosting/Domains"] },
  { name: "Miscellaneous", subs: [] },
  { name: "Owner personal", subs: [], personal: true },
];

export async function ensureFinanceDefaults() {
  if (await db.finCategory.count()) return;
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    const parent = await db.finCategory.create({ data: { name: c.name, sortOrder: i, personal: !!c.personal } });
    for (const [j, s] of c.subs.entries()) await db.finCategory.create({ data: { name: s, parentId: parent.id, sortOrder: j, personal: !!c.personal } });
  }
}

/** Balance of every holder (optionally up to a date). */
export async function balances(until?: Date) {
  const date = until ? { lte: until } : undefined;
  const [accounts, out, inn, tin] = await Promise.all([
    db.finAccount.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.finEntry.groupBy({ by: ["accountId"], where: { status: "approved", kind: { in: ["expense", "transfer"] }, ...(date && { date }) }, _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["accountId"], where: { status: "approved", kind: "in", ...(date && { date }) }, _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["toAccountId"], where: { status: "approved", kind: "transfer", ...(date && { date }) }, _sum: { amount: true } }),
  ]);
  const sum = (rows: { _sum: { amount: number | null } }[]) => rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  return accounts.map((a) => {
    const spent = sum(out.filter((r) => r.accountId === a.id));
    const received = sum(inn.filter((r) => r.accountId === a.id)) + sum(tin.filter((r) => r.toAccountId === a.id));
    return { ...a, received, spent, balance: a.opening + received - spent };
  });
}

/** Category tree: main categories with their subs, in order. */
export async function categoryTree() {
  const all = await db.finCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return all.filter((c) => !c.parentId).map((p) => ({ ...p, subs: all.filter((c) => c.parentId === p.id) }));
}

/** Company spending only (not personal, not transfers). */
export const companyExpense = (extra: Prisma.FinEntryWhereInput = {}): Prisma.FinEntryWhereInput => ({ kind: "expense", personal: false, status: "approved", ...extra });

/** Who approves big expenses and gets finance alerts: Super Admins and roles with Finance → Approve. */
export async function financeApproverIds() {
  const users = await db.user.findMany({
    where: { active: true, OR: [{ isSuperAdmin: true }, { roles: { some: { role: { permissions: { some: { module: "finance", action: "approve", scope: { not: "none" } } } } } } }] },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/** Filters shared by the entries list and its Excel export. */
export function entryWhere(sp: { month?: string; holder?: string; cat?: string; kind?: string; q?: string; proof?: string; status?: string; party?: string; tag?: string }, personal: boolean, tree: Awaited<ReturnType<typeof categoryTree>>): Prisma.FinEntryWhereInput {
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? parse(sp.month, "yyyy-MM", new Date()) : null;
  const q = sp.q?.trim();
  const catIds = sp.cat ? [sp.cat, ...(tree.find((c) => c.id === sp.cat)?.subs.map((s) => s.id) ?? [])] : null;
  return {
    personal,
    ...(month && { date: { gte: startOfMonth(month), lte: endOfMonth(month) } }),
    ...(sp.holder && { OR: [{ accountId: sp.holder }, { toAccountId: sp.holder }] }),
    ...(catIds && { categoryId: { in: catIds } }),
    ...(sp.kind && { kind: sp.kind }),
    ...(sp.proof && PROOF_WHERE[sp.proof]),
    ...(sp.status && { status: sp.status }),
    ...(sp.party && { party: sp.party }),
    ...(sp.tag && { tags: { contains: sp.tag } }),
    ...(q && { AND: [{ OR: [{ description: { contains: q } }, { party: { contains: q } }, { notes: { contains: q } }] }] }),
  };
}

/** Proof filters: no bill/receipt yet, proof added but not checked, checked by the boss / accounts. */
export const PROOF_WHERE: Record<string, Prisma.FinEntryWhereInput> = {
  missing: { receipt: null, proofs: { none: {} } },
  unverified: { verifiedAt: null, OR: [{ receipt: { not: null } }, { proofs: { some: {} } }] },
  verified: { verifiedAt: { not: null } },
};

export type FinConfig = {
  /** Entries of this amount or more can't be saved without a bill/receipt (0 = never blocked, only flagged). */
  proofAbove: number;
  /** Expenses of this amount or more wait for the boss's approval before they count (0 = no approval). */
  approvalAbove: number;
  /** Months up to and including this one ("yyyy-MM") are closed: entries can't be added, edited or deleted. */
  closedThrough: string;
  /** The owner gets an instant notification for any single expense of this amount or more (0 = off). */
  alertAbove: number;
};
const FIN_DEFAULTS: FinConfig = { proofAbove: 0, approvalAbove: 0, closedThrough: "", alertAbove: 0 };
export async function financeConfig(): Promise<FinConfig> {
  const row = await db.setting.findUnique({ where: { key: "finance.config" } });
  try { return { ...FIN_DEFAULTS, ...(row ? JSON.parse(row.value) : {}) }; } catch { return FIN_DEFAULTS; }
}
export async function saveFinanceConfig(patch: Partial<FinConfig>) {
  const value = JSON.stringify({ ...(await financeConfig()), ...patch });
  await db.setting.upsert({ where: { key: "finance.config" }, update: { value }, create: { key: "finance.config", value } });
}
/** True when the date falls in a closed month. */
export const isClosed = (date: Date, cfg: FinConfig) => !!cfg.closedThrough && date.toISOString().slice(0, 7) <= cfg.closedThrough;

/** Short Pakistani format for big numbers: Rs 15.3 lac, Rs 1.27 crore; smaller amounts in full. */
export const lakh = (n: number) => {
  const a = Math.abs(n), sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}Rs ${(a / 1e7).toFixed(2).replace(/\.?0+$/, "")} crore`;
  if (a >= 1e5) return `${sign}Rs ${(a / 1e5).toFixed(1).replace(/\.0$/, "")} lac`;
  return `${sign}Rs ${Math.round(a).toLocaleString("en-PK")}`;
};

/** Possible duplicates: same holder, same amount, same day and the same description. */
export function findDuplicates<T extends { id: string; accountId: string; amount: number; date: Date; description: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = `${r.accountId}|${r.amount}|${r.date.toISOString().slice(0, 10)}|${r.description.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** After an expense: warn the approvers once when its main category reaches 80% and 100% of the monthly budget. */
export async function checkBudget(categoryId: string | null, date: Date) {
  if (!categoryId) return;
  const cat = await db.finCategory.findUnique({ where: { id: categoryId }, include: { children: { select: { id: true } } } });
  const main = cat?.parentId ? await db.finCategory.findUnique({ where: { id: cat.parentId }, include: { children: { select: { id: true } } } }) : cat;
  if (!main) return;
  const budget = await db.finBudget.findUnique({ where: { categoryId: main.id } });
  if (!budget || budget.amount <= 0) return;
  const m = date.toISOString().slice(0, 7);
  const from = new Date(`${m}-01T00:00:00`), to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59);
  const spent = (await db.finEntry.aggregate({ where: { ...companyExpense(), categoryId: { in: [main.id, ...main.children.map((c) => c.id)] }, date: { gte: from, lte: to } }, _sum: { amount: true } }))._sum.amount ?? 0;
  const pct = (spent / budget.amount) * 100;
  const level = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
  if (!level) return;
  const done = budget.alerted?.startsWith(m) ? Number(budget.alerted.slice(8)) : 0;
  if (done >= level) return;
  await db.finBudget.update({ where: { id: budget.id }, data: { alerted: `${m}:${level}` } });
  const { notify } = await import("./notify");
  for (const uid of await financeApproverIds()) await notify(uid, level === 100 ? `${main.name} is over budget` : `${main.name} has used ${Math.round(pct)}% of its budget`, { body: `${pkr(spent)} of ${pkr(budget.amount)} in ${m}`, link: "/finance/budgets", email: level === 100 });
}

/** Monthly bills: due date and whether this month's payment is recorded. */
export async function billsForMonth(month: Date) {
  const m = month.toISOString().slice(0, 7);
  const bills = await db.finRecurring.findMany({ where: { active: true }, include: { category: { include: { parent: true } }, account: true }, orderBy: { dayOfMonth: "asc" } });
  const from = new Date(month.getFullYear(), month.getMonth(), 1), to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
  const paid = await db.finEntry.findMany({ where: { recurringId: { in: bills.map((b) => b.id) }, date: { gte: from, lte: to } }, select: { id: true, recurringId: true, amount: true, date: true } });
  return bills.map((b) => {
    const p = paid.find((x) => x.recurringId === b.id);
    const due = new Date(month.getFullYear(), month.getMonth(), Math.min(b.dayOfMonth, to.getDate()));
    return { ...b, due, paidEntry: p ?? null, paid: !!p || b.lastPaid === m };
  });
}

/** Daily: remind approvers about bills due within 3 days (or overdue) and not yet paid. Once per bill per month. */
export async function sendBillReminders(today = new Date()) {
  const m = today.toISOString().slice(0, 7);
  const soon = new Date(today.getTime() + 3 * 86400000);
  const due = (await billsForMonth(today)).filter((b) => !b.paid && b.due <= soon && b.reminded !== m);
  if (!due.length) return 0;
  const { notify } = await import("./notify");
  const body = due.map((b) => `${b.name}: ${pkr(b.amount)} due ${b.due.toDateString().slice(4, 10)}`).join("\n");
  for (const uid of await financeApproverIds()) await notify(uid, `${due.length} bill${due.length === 1 ? "" : "s"} due`, { body, link: "/finance/bills" });
  await db.finRecurring.updateMany({ where: { id: { in: due.map((b) => b.id) } }, data: { reminded: m } });
  return due.length;
}

/** Tidy tags: comma separated, trimmed, unique, max 6. */
export const cleanTags = (raw: string) => [...new Set(raw.split(",").map((t) => t.trim().replace(/\s+/g, " ")).filter(Boolean).map((t) => t.slice(0, 30)))].slice(0, 6).join(", ") || null;
export const tagList = (tags: string | null) => (tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : []);
/** Same payee written differently: "K-Electric", "k electric", "KElectric " all match. */
export const payeeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Finance category for an HR expense claim category. */
export async function categoryForClaim(claimCategory: string) {
  const map: Record<string, [string, string?]> = {
    Fuel: ["Employee & HR", "Conveyance"], Travel: ["Employee & HR", "Conveyance"], "Site visit": ["Employee & HR", "Conveyance"],
    "Client meeting": ["Entertainment", "Guest Lunches/Dinners"], "Mobile / internet": ["Facilities & Office", "Utilities"],
    "Office supplies": ["Facilities & Office", "Stationery"], Marketing: ["Marketing"], Other: ["Miscellaneous"],
  };
  const [main, sub] = map[claimCategory] ?? ["Miscellaneous"];
  const m = await db.finCategory.findFirst({ where: { parentId: null, name: main } });
  if (!m) return null;
  return (sub && (await db.finCategory.findFirst({ where: { parentId: m.id, name: sub } }))?.id) || m.id;
}

export type CheckRow = { id: string; date: Date; description: string; amount: number; account: string; why: string };
/** Warnings worth a look for a month (never blocking): unusual amounts, Sundays/holidays, round cash without a bill, the same payee paid twice in a week, late entries, possible double entries. */
export async function financeChecks(from: Date, to: Date) {
  const rows = await db.finEntry.findMany({ where: { status: "approved", kind: "expense", personal: false, date: { gte: from, lte: to } }, include: { account: true, _count: { select: { proofs: true } } }, orderBy: { date: "asc" } });
  const history = await db.finEntry.groupBy({ by: ["party"], where: { status: "approved", kind: "expense", party: { in: [...new Set(rows.map((r) => r.party).filter((p): p is string => !!p))] }, date: { gte: new Date(from.getTime() - 180 * 86400000), lt: from } }, _avg: { amount: true }, _count: true });
  const holidays = await db.holiday.findMany({ where: { date: { gte: from, lte: to } } });
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const holi = new Map(holidays.map((h) => [day(h.date), h.name]));
  const row = (r: (typeof rows)[number], why: string): CheckRow => ({ id: r.id, date: r.date, description: r.description, amount: r.amount, account: r.account.name, why });
  const hasProof = (r: (typeof rows)[number]) => !!r.receipt || r._count.proofs > 0;
  const unusual: CheckRow[] = [], offDay: CheckRow[] = [], roundCash: CheckRow[] = [], repeat: CheckRow[] = [], late: CheckRow[] = [];
  // Salaries, overtime and allowances change every month by design: not "unusual".
  const payLike = (r: (typeof rows)[number]) => /salar|overtime|allowance|commission|advance|loan/i.test(r.description);
  for (const r of rows) {
    const h = r.party && !payLike(r) ? history.find((x) => x.party === r.party) : null;
    if (h && h._count >= 3 && h._avg.amount && r.amount > h._avg.amount * 1.6 && r.amount - h._avg.amount > 2000) unusual.push(row(r, `${Math.round((r.amount / h._avg.amount - 1) * 100)}% more than usual for ${r.party} (avg ${pkr(h._avg.amount)})`));
    if (r.date.getDay() === 0 || holi.has(day(r.date))) offDay.push(row(r, r.date.getDay() === 0 ? "On a Sunday" : `On a holiday (${holi.get(day(r.date))})`));
    if (r.amount >= 5000 && r.amount % 1000 === 0 && !hasProof(r) && !payLike(r)) roundCash.push(row(r, "Round amount with no bill"));
    if (!r.importKey && r.createdAt.getTime() - r.date.getTime() > 7 * 86400000) late.push(row(r, `Entered ${Math.round((r.createdAt.getTime() - r.date.getTime()) / 86400000)} days after the date`));
  }
  const byParty = new Map<string, typeof rows>();
  for (const r of rows) if (r.party && r.amount >= 2000 && !payLike(r)) byParty.set(r.party.toLowerCase(), [...(byParty.get(r.party.toLowerCase()) ?? []), r]);
  for (const list of byParty.values()) for (let i = 1; i < list.length; i++) {
    const a = list[i - 1]!, b = list[i]!;
    if (b.date.getTime() - a.date.getTime() <= 7 * 86400000 && Math.abs(a.amount - b.amount) < 1) repeat.push(row(b, `${b.party} paid ${pkr(b.amount)} again within a week (also ${a.date.toDateString().slice(4, 10)})`));
  }
  const dups = findDuplicates(rows).map((g) => row(g[1]!, `${g.length} entries: same person, amount, day and description`));
  return { unusual, offDay, roundCash, repeat, late, dups, total: unusual.length + offDay.length + roundCash.length + repeat.length + late.length + dups.length };
}
