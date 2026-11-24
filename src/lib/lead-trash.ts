// Deleted leads go to the Trash (CRM → Leads → Trash) for 30 days: the lead with its activities and property matches
// is saved as JSON, then removed. Restoring puts everything back with the same ids and lead number; deals that pointed
// at the lead are linked again. After 30 days the daily job clears it for good.
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { scopeFor } from "./permissions";

export const TRASH_DAYS = 30;
const DAY = 86_400_000;

type Snapshot = { lead: Record<string, unknown>; activities: Record<string, unknown>[]; matches: Record<string, unknown>[]; dealIds: string[] };

/** Saves each lead (with its activities, matches and linked deal ids) to the Trash, then deletes it. Returns how many. */
export async function trashLeads(ids: string[], user: Pick<SessionUser, "id" | "name"> | null) {
  let moved = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    const leads = await db.lead.findMany({
      where: { id: { in: part } },
      include: { activities: true, matches: true, deals: { select: { id: true } }, owner: { select: { name: true } } },
    });
    if (!leads.length) continue;
    const rows: Prisma.LeadTrashCreateManyInput[] = leads.map(({ activities, matches, deals, owner, ...lead }) => ({
      leadId: lead.id, number: lead.number, name: lead.name.slice(0, 190), phone: lead.phone, ownerId: lead.ownerId, ownerName: owner?.name ?? null,
      bitrixId: lead.bitrixId, activities: activities.length, deletedById: user?.id ?? null, deletedByName: user?.name ?? null,
      data: JSON.stringify({ lead, activities, matches, dealIds: deals.map((d) => d.id) } satisfies Snapshot),
    }));
    await db.$transaction([db.leadTrash.createMany({ data: rows }), db.lead.deleteMany({ where: { id: { in: leads.map((l) => l.id) } } })]);
    moved += leads.length;
  }
  return moved;
}

/** JSON dates come back as strings: turn every "…At" field into a Date again. */
function dates<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(out)) if (k.endsWith("At") && typeof v === "string") out[k] = new Date(v);
  return out as T;
}
async function existing(model: "user" | "leadSource" | "project" | "unit" | "branch" | "contact" | "deal" | "company", ids: unknown[]) {
  const list = [...new Set(ids.filter((x): x is string => typeof x === "string" && !!x))];
  if (!list.length) return new Set<string>();
  // Each of these models has a string id; the delegate call is the same shape for all.
  const found = await (db[model] as unknown as { findMany: (a: object) => Promise<{ id: string }[]> }).findMany({ where: { id: { in: list } }, select: { id: true } });
  return new Set(found.map((r) => r.id));
}

/** Puts a lead back from the Trash. Links to people, projects, units… that no longer exist are left empty. */
export async function restoreLead(trashId: string) {
  const t = await db.leadTrash.findUnique({ where: { id: trashId } });
  if (!t) return { error: "Not in the Trash any more." };
  if (await db.lead.findUnique({ where: { id: t.leadId }, select: { id: true } })) { await db.leadTrash.delete({ where: { id: t.id } }); return { error: "This lead is already back in the CRM." }; }
  const snap = JSON.parse(t.data) as Snapshot;
  const lead = dates(snap.lead);
  const acts = snap.activities.map(dates), matches = snap.matches.map(dates);
  const [users, sources, projects, units, branches, contacts, deals, companies, status] = await Promise.all([
    existing("user", [lead.ownerId, lead.createdById, ...acts.flatMap((a) => [a.ownerId, a.createdById])]),
    existing("leadSource", [lead.sourceId]), existing("project", [lead.projectId]),
    existing("unit", [lead.unitId, ...matches.map((m) => m.unitId)]), existing("branch", [lead.branchId, ...acts.map((a) => a.branchId)]),
    existing("contact", [lead.contactId, ...acts.map((a) => a.contactId)]), existing("deal", [...acts.map((a) => a.dealId), ...snap.dealIds]),
    existing("company", acts.map((a) => a.companyId)),
    db.leadStatus.findUnique({ where: { id: String(lead.statusId) }, select: { id: true } }),
  ]);
  const keep = (set: Set<string>, v: unknown) => (typeof v === "string" && set.has(v) ? v : null);
  const statusId = status?.id ?? (await db.leadStatus.findFirst({ where: { active: true, kind: "open" }, orderBy: { sortOrder: "asc" }, select: { id: true } }))?.id;
  if (!statusId) return { error: "No open lead stage to put it in." };
  const data = {
    ...lead, statusId, ownerId: keep(users, lead.ownerId), createdById: keep(users, lead.createdById), sourceId: keep(sources, lead.sourceId),
    projectId: keep(projects, lead.projectId), unitId: keep(units, lead.unitId), branchId: keep(branches, lead.branchId), contactId: keep(contacts, lead.contactId),
  } as Prisma.LeadUncheckedCreateInput;
  const activityRows = acts.map((a) => ({
    ...a, ownerId: keep(users, a.ownerId), createdById: keep(users, a.createdById), dealId: keep(deals, a.dealId), contactId: keep(contacts, a.contactId), companyId: keep(companies, a.companyId),
  })) as Prisma.ActivityCreateManyInput[];
  const matchRows = matches.filter((m) => units.has(String(m.unitId))) as unknown as Prisma.PropertyMatchCreateManyInput[];
  await db.lead.create({ data });
  await db.$transaction([
    db.activity.createMany({ data: activityRows }),
    db.propertyMatch.createMany({ data: matchRows }),
    db.deal.updateMany({ where: { id: { in: [...deals].filter((d) => snap.dealIds.includes(d)) }, leadId: null }, data: { leadId: t.leadId } }),
    db.leadTrash.delete({ where: { id: t.id } }),
  ]);
  return { ok: true as const, leadId: t.leadId, name: t.name };
}

/** Clears what has been in the Trash longer than 30 days (run by the daily job). */
export async function purgeTrash() {
  return (await db.leadTrash.deleteMany({ where: { deletedAt: { lt: new Date(Date.now() - TRASH_DAYS * DAY) } } })).count;
}

export const daysLeft = (deletedAt: Date) => Math.max(0, Math.ceil((+deletedAt + TRASH_DAYS * DAY - Date.now()) / DAY));

/** Super Admins and people who may delete any lead see the whole Trash; others see what they deleted. */
export const trashWhere = (user: SessionUser): Prisma.LeadTrashWhereInput => (scopeFor(user, "crm.leads", "delete") === "all" ? {} : { deletedById: user.id });
