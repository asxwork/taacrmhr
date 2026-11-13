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
    db.finEntry.groupBy({ by: ["accountId"], where: { kind: { in: ["expense", "transfer"] }, ...(date && { date }) }, _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["accountId"], where: { kind: "in", ...(date && { date }) }, _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["toAccountId"], where: { kind: "transfer", ...(date && { date }) }, _sum: { amount: true } }),
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
export const companyExpense = (extra: Prisma.FinEntryWhereInput = {}): Prisma.FinEntryWhereInput => ({ kind: "expense", personal: false, ...extra });

export const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/** Filters shared by the entries list and its Excel export. */
export function entryWhere(sp: { month?: string; holder?: string; cat?: string; kind?: string; q?: string; proof?: string; status?: string }, personal: boolean, tree: Awaited<ReturnType<typeof categoryTree>>): Prisma.FinEntryWhereInput {
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
};
const FIN_DEFAULTS: FinConfig = { proofAbove: 0, approvalAbove: 0, closedThrough: "" };
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
