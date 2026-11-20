// Merging duplicate leads: history, deals and matches move to the lead kept, its empty fields are filled from the
// others, and the duplicates are deleted. Used by Leads → Duplicates (one group, or "Merge all").
import { db } from "./db";
import type { SessionUser } from "./auth";
import { scopeMatcher } from "./permissions";
import { audit } from "./audit";

const FILL = ["email", "phone2", "sourceId", "campaign", "sourceInfo", "projectId", "projectName", "unitId", "interest", "propertyType", "location", "budgetMin", "budgetMax", "contactId", "ownerId", "branchId", "bitrixId"] as const;

type LeadRow = Awaited<ReturnType<typeof db.lead.findMany>>[number];
/** The lead to keep in a group: the one with deals, then the most activities, then the oldest. */
export function bestOf<T extends { createdAt: Date; _count: { activities: number; deals: number } }>(rows: T[]) {
  return [...rows].sort((a, b) => b._count.deals - a._count.deals || b._count.activities - a._count.activities || +a.createdAt - +b.createdAt)[0]!;
}

/** Fields you can pick per lead on the merge screen, and the columns each one carries over. */
export const MERGE_FIELDS = {
  name: ["name"], phone: ["phone", "phoneKey", "phones"], phone2: ["phone2"], email: ["email", "emails"],
  project: ["projectId", "projectName"], source: ["sourceId"], stage: ["statusId", "convertedAt"], owner: ["ownerId", "branchId"],
  campaign: ["campaign"], sourceInfo: ["sourceInfo"], interest: ["interest"], location: ["location"], budget: ["budgetMin", "budgetMax"],
} as const;
export type MergeField = keyof typeof MERGE_FIELDS;

export async function mergeLeadGroup(user: SessionUser, keepId: string, ids: string[], pick: Partial<Record<MergeField, string>> = {}): Promise<{ error?: string; keep?: LeadRow; merged?: number }> {
  if (!keepId || ids.length < 2 || !ids.includes(keepId)) return { error: "Pick the lead to keep." };
  const leads = await db.lead.findMany({ where: { id: { in: ids } }, include: { owner: { select: { active: true } } } });
  if (leads.length !== ids.length) return { error: "Some of these leads no longer exist — refresh the page." };
  const allowed = await scopeMatcher(user, "crm.merge", "edit");
  if (!leads.every(allowed)) return { error: "You can only merge leads you're allowed to edit." };
  // Old employees' leads (inactive owner) are the Super Admin's to change.
  if (!user.isSuperAdmin && leads.some((l) => l.owner && !l.owner.active)) return { error: "One of these belongs to an old employee: only a Super Admin can merge it." };
  const keep = leads.find((l) => l.id === keepId)!;
  const others = leads.filter((l) => l.id !== keepId).sort((a, b) => +a.createdAt - +b.createdAt);
  const otherIds = others.map((o) => o.id);

  const fill: Record<string, unknown> = {};
  // Empty fields of the lead kept are filled from the others, a whole field at a time: a typed project ("Emaar")
  // isn't overridden by another lead's Inventory project, nor a phone split from its search key.
  const groupOf = (k: string) => Object.values(MERGE_FIELDS).find((cols) => (cols as readonly string[]).includes(k)) as readonly string[] | undefined;
  for (const k of FILL) {
    const cols = groupOf(k) ?? [k];
    if (cols.some((c) => (keep as Record<string, unknown>)[c] != null)) continue;
    const from = others.find((o) => (o as Record<string, unknown>)[k] != null);
    if (from) for (const c of cols) if (fill[c] === undefined) fill[c] = (from as Record<string, unknown>)[c] ?? null;
  }
  // Values picked on the merge screen from another lead win (all the columns of that field together).
  for (const [field, fromId] of Object.entries(pick)) {
    const from = others.find((o) => o.id === fromId);
    if (!from || !(field in MERGE_FIELDS)) continue;
    for (const col of MERGE_FIELDS[field as MergeField]) fill[col] = (from as Record<string, unknown>)[col] ?? null;
  }
  const notes = [keep.notes, ...others.map((o) => o.notes && `From lead #${o.number ?? o.id.slice(-5)}: ${o.notes}`)].filter(Boolean).join("\n\n") || null;
  const lastActivityAt = [keep, ...others].map((l) => l.lastActivityAt).filter(Boolean).sort((a, b) => +b! - +a!)[0] ?? null;
  const taken = new Set((await db.propertyMatch.findMany({ where: { leadId: keepId }, select: { unitId: true } })).map((m) => m.unitId));
  // A Bitrix ID is unique per lead: free it on the duplicates before giving it to the lead kept.
  const freeBitrix = fill.bitrixId != null ? [db.lead.updateMany({ where: { id: { in: otherIds } }, data: { bitrixId: null } })] : [];
  await db.$transaction([
    db.activity.updateMany({ where: { leadId: { in: otherIds } }, data: { leadId: keepId } }),
    db.deal.updateMany({ where: { leadId: { in: otherIds } }, data: { leadId: keepId } }),
    db.propertyMatch.deleteMany({ where: { leadId: { in: otherIds }, unitId: { in: [...taken] } } }),
    db.propertyMatch.updateMany({ where: { leadId: { in: otherIds } }, data: { leadId: keepId } }),
    ...freeBitrix,
    db.lead.update({ where: { id: keepId }, data: { ...fill, notes, lastActivityAt, ...(others.some((o) => o.convertedAt) && !keep.convertedAt ? { convertedAt: others.find((o) => o.convertedAt)!.convertedAt } : {}) } }),
    db.activity.create({ data: { type: "note", subject: `Merged ${others.length} duplicate lead(s) into this one`, body: others.map((o) => `#${o.number ?? "—"} ${o.name} (created ${o.createdAt.toISOString().slice(0, 10)})`).join("\n"), leadId: keepId, ownerId: user.id, createdById: user.id, doneAt: new Date(), branchId: keep.branchId } }),
    db.lead.deleteMany({ where: { id: { in: otherIds } } }),
  ]);
  await audit(user.id, "update", "lead", keepId, `Merged ${others.map((o) => `#${o.number ?? o.id}`).join(", ")} into #${keep.number ?? keepId}`);
  return { keep, merged: others.length };
}

/** Duplicate groups by phone (or email): lead ids per shared value, within the user's scope. */
export async function duplicateGroups(scope: object, by: "phone" | "email") {
  const field = by === "phone" ? "phoneKey" : "email";
  const groups = await db.lead.groupBy({ by: [field], where: { ...scope, [field]: { not: null } }, _count: { _all: true }, having: { [field]: { _count: { gt: 1 } } }, orderBy: { _count: { [field]: "desc" } } } as never) as unknown as { phoneKey?: string; email?: string; _count: { _all: number } }[];
  return groups.map((g) => ({ key: (by === "phone" ? g.phoneKey : g.email)!, count: g._count._all })).filter((g) => g.key && (by === "phone" || g.key.includes("@")));
}

/**
 * How duplicates are grouped:
 *   phone  — same phone number (everything into one lead)
 *   email  — same email
 *   exact  — same name, phone and source information, assigned to the same person (safe to merge blindly)
 *   owner  — same phone and same responsible person: each person keeps one lead of their own
 */
export const DUPLICATE_MODES = [
  { value: "exact", label: "Exact copies", hint: "Same name, phone and source information, and the same responsible person" },
  { value: "owner", label: "Same phone, per person", hint: "Same phone and same responsible: each person keeps one lead" },
  { value: "phone", label: "Same phone", hint: "Everyone with this phone becomes one lead" },
  { value: "email", label: "Same email", hint: "Everyone with this email becomes one lead" },
] as const;
export type DuplicateMode = (typeof DUPLICATE_MODES)[number]["value"];
export const duplicateMode = (v?: string): DuplicateMode => (DUPLICATE_MODES.some((m) => m.value === v) ? (v as DuplicateMode) : "phone");

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Duplicate groups for a mode: a stable key and the lead ids, biggest groups first. */
export async function duplicateSets(scope: object, mode: DuplicateMode): Promise<{ key: string; ids: string[] }[]> {
  if (mode === "email") {
    const groups = await duplicateGroups(scope, "email");
    const rows = groups.length ? await db.lead.findMany({ where: { ...scope, email: { in: groups.map((g) => g.key) } }, select: { id: true, email: true } }) : [];
    return groups.map((g) => ({ key: g.key, ids: rows.filter((r) => r.email === g.key).map((r) => r.id) })).filter((g) => g.ids.length > 1);
  }
  // Every mode except email starts from leads sharing a phone, then splits those groups further.
  const groups = await duplicateGroups(scope, "phone");
  if (!groups.length) return [];
  const rows = await db.lead.findMany({ where: { ...scope, phoneKey: { in: groups.map((g) => g.key) } }, select: { id: true, phoneKey: true, name: true, sourceInfo: true, ownerId: true } });
  const by = new Map<string, string[]>();
  for (const r of rows) {
    const k = mode === "phone" ? r.phoneKey! : mode === "owner" ? `${r.phoneKey}|${r.ownerId ?? "-"}` : `${r.phoneKey}|${r.ownerId ?? "-"}|${norm(r.name)}|${norm(r.sourceInfo)}`;
    by.set(k, [...(by.get(k) ?? []), r.id]);
  }
  return [...by.entries()].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({ key, ids })).sort((a, b) => b.ids.length - a.ids.length);
}
