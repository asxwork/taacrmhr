import type { Prisma } from "@prisma/client";
import { endOfDay, subDays } from "date-fns";
import { db } from "./db";

// How agents work their leads, measured from what they log (there is no phone system).
//   contact      = a logged call, meeting, site visit or email (done, not just planned)
//   follow-up    = any planned activity (has a due date) on a lead
//   on time      = done by the end of its due day; late = done after; overdue = still open past its due time
//   no next step = open lead with nothing planned
//   stale        = open lead with no activity for STALE_DAYS
export const CONTACT_TYPES = ["call", "meeting", "visit", "email"];
export const STALE_DAYS = 7;
const NOTE_MIN = 10;

export type AgentRow = {
  id: string; name: string; branch: string | null;
  open: number; newLeads: number; contactedNew: number; avgFirstResponseH: number | null; neverContacted: number;
  calls: number; callsWithNotes: number; callDays: number;
  followUpsDue: number; onTime: number; late: number; overdueNow: number;
  noNextStep: number; stale: number; closedNoContact: number; converted: number;
};

/** One row per agent who owns leads (optionally one branch), for the period. */
export async function agentPerformance(from: Date, to: Date, branchId?: string) {
  const now = new Date();
  const leadWhere: Prisma.LeadWhereInput = { ownerId: { not: null }, ...(branchId && { branchId }) };
  const [leads, firstContacts, planned, followUps, calls, users, overdue] = await Promise.all([
    db.lead.findMany({ where: leadWhere, select: { id: true, ownerId: true, createdAt: true, lastActivityAt: true, convertedAt: true, updatedAt: true, status: { select: { kind: true } } } }),
    db.activity.groupBy({ by: ["leadId"], where: { leadId: { not: null }, type: { in: CONTACT_TYPES }, doneAt: { not: null } }, _min: { doneAt: true } }),
    db.activity.groupBy({ by: ["leadId"], where: { leadId: { not: null }, doneAt: null, dueAt: { not: null } }, _count: true }),
    db.activity.findMany({ where: { leadId: { not: null }, dueAt: { gte: from, lte: to }, ownerId: { not: null } }, select: { ownerId: true, dueAt: true, doneAt: true } }),
    db.activity.findMany({ where: { type: "call", doneAt: { gte: from, lte: to }, ownerId: { not: null } }, select: { ownerId: true, doneAt: true, body: true } }),
    db.user.findMany({ where: { OR: [{ ownedLeads: { some: leadWhere } }, { activities: { some: { type: "call", doneAt: { gte: from, lte: to } } } }], ...(branchId && { branchId }) }, select: { id: true, name: true, branch: { select: { name: true } } }, orderBy: { name: "asc" } }),
    // Overdue right now (any due date), only on leads still being worked.
    db.activity.groupBy({ by: ["ownerId"], where: { doneAt: null, dueAt: { lt: now }, ownerId: { not: null }, lead: { status: { kind: "open" }, ...(branchId && { branchId }) } }, _count: true }),
  ]);
  const overdueBy = new Map(overdue.map((o) => [o.ownerId!, o._count]));
  const first = new Map(firstContacts.map((f) => [f.leadId!, f._min.doneAt!]));
  const hasPlan = new Set(planned.map((p) => p.leadId!));
  const staleCut = subDays(now, STALE_DAYS);

  const rows: AgentRow[] = users.map((u) => {
    const mine = leads.filter((l) => l.ownerId === u.id);
    const open = mine.filter((l) => l.status.kind === "open");
    const fresh = mine.filter((l) => l.createdAt >= from && l.createdAt <= to);
    const responses = fresh.map((l) => first.get(l.id)).map((t, i) => (t ? (+t - +fresh[i]!.createdAt) / 36e5 : null)).filter((h): h is number => h !== null && h >= 0);
    const myFollowUps = followUps.filter((f) => f.ownerId === u.id);
    const myCalls = calls.filter((c) => c.ownerId === u.id);
    return {
      id: u.id, name: u.name, branch: u.branch?.name ?? null,
      open: open.length,
      newLeads: fresh.length,
      contactedNew: fresh.filter((l) => first.has(l.id)).length,
      avgFirstResponseH: responses.length ? responses.reduce((a, b) => a + b, 0) / responses.length : null,
      neverContacted: open.filter((l) => !first.has(l.id)).length,
      calls: myCalls.length,
      callsWithNotes: myCalls.filter((c) => (c.body ?? "").trim().length >= NOTE_MIN).length,
      callDays: new Set(myCalls.map((c) => c.doneAt!.toDateString())).size,
      followUpsDue: myFollowUps.length,
      onTime: myFollowUps.filter((f) => f.doneAt && f.doneAt <= endOfDay(f.dueAt!)).length,
      late: myFollowUps.filter((f) => f.doneAt && f.doneAt > endOfDay(f.dueAt!)).length,
      overdueNow: overdueBy.get(u.id) ?? 0,
      noNextStep: open.filter((l) => !hasPlan.has(l.id)).length,
      stale: open.filter((l) => (l.lastActivityAt ?? l.createdAt) < staleCut).length,
      closedNoContact: mine.filter((l) => l.status.kind === "junk" && l.updatedAt >= from && l.updatedAt <= to && !first.has(l.id)).length,
      converted: mine.filter((l) => l.convertedAt && l.convertedAt >= from && l.convertedAt <= to).length,
    };
  });
  return rows;
}

/**
 * The lead lists behind the numbers, for one agent or for a scope (an agent's own "My follow-ups").
 * `where` limits the leads (owner or user scope).
 */
export async function followUpLists(where: Prisma.LeadWhereInput, closedSince?: Date) {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const include = { status: true, source: { select: { name: true } }, owner: { select: { name: true } } } as const;
  const openLead: Prisma.LeadWhereInput = { AND: [where, { status: { kind: "open" } }] };
  const contacted: Prisma.ActivityListRelationFilter = { some: { type: { in: CONTACT_TYPES }, doneAt: { not: null } } };
  const staleCut = subDays(now, STALE_DAYS);

  const [neverContacted, noNextStep, stale, overdue, dueToday, closedNoContact] = await Promise.all([
    db.lead.findMany({ where: { AND: [openLead, { activities: { none: { type: { in: CONTACT_TYPES }, doneAt: { not: null } } } }] }, include, orderBy: { createdAt: "asc" }, take: 200 }),
    db.lead.findMany({ where: { AND: [openLead, { activities: { none: { doneAt: null, dueAt: { not: null } } } }] }, include, orderBy: { createdAt: "asc" }, take: 200 }),
    db.lead.findMany({ where: { AND: [openLead, { OR: [{ lastActivityAt: { lt: staleCut } }, { lastActivityAt: null, createdAt: { lt: staleCut } }] }] }, include, orderBy: { lastActivityAt: "asc" }, take: 200 }),
    db.activity.findMany({ where: { doneAt: null, dueAt: { lt: now }, lead: openLead }, include: { lead: { include }, owner: { select: { name: true } } }, orderBy: { dueAt: "asc" }, take: 200 }),
    db.activity.findMany({ where: { doneAt: null, dueAt: { gte: now, lt: tomorrow }, lead: openLead }, include: { lead: { include }, owner: { select: { name: true } } }, orderBy: { dueAt: "asc" }, take: 200 }),
    closedSince
      ? db.lead.findMany({ where: { AND: [where, { status: { kind: "junk" } }, { updatedAt: { gte: closedSince } }, { activities: { none: contacted.some } }] }, include, orderBy: { updatedAt: "desc" }, take: 200 })
      : Promise.resolve([]),
  ]);
  return { neverContacted, noNextStep, stale, overdue, dueToday, closedNoContact };
}
