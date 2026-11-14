// Finance → Entries: sort options and each user's default view (holder, sort, filters).
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const SORTS: Record<string, [string, Prisma.FinEntryOrderByWithRelationInput[]]> = {
  "": ["Newest first", [{ date: "desc" }, { createdAt: "desc" }]],
  oldest: ["Oldest first", [{ date: "asc" }, { createdAt: "asc" }]],
  amount_desc: ["Amount: high to low", [{ amount: "desc" }]],
  amount_asc: ["Amount: low to high", [{ amount: "asc" }]],
  added: ["Recently added", [{ createdAt: "desc" }]],
  payee: ["Paid to (A–Z)", [{ party: "asc" }, { date: "desc" }]],
};

/** The parts of the URL that make a "view" (not month or search, which change all the time). */
const VIEW_KEYS = ["holder", "sort", "cat", "kind", "proof", "tag", "status"] as const;
export function viewQuery(sp: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const k of VIEW_KEYS) if (sp[k]) q.set(k, sp[k]!);
  return q.toString();
}

export async function defaultViewFor(userId: string) {
  const rows = await db.setting.findMany({ where: { key: { in: [`fin.defaultView.${userId}`, `fin.defaultHolder.${userId}`] } } });
  const view = rows.find((r) => r.key.startsWith("fin.defaultView"))?.value;
  const holder = rows.find((r) => r.key.startsWith("fin.defaultHolder"))?.value;
  return view ?? (holder ? `holder=${holder}` : null);
}
