// On-hold rules for leads (Settings → CRM → On-hold rules):
// 1. Still in New Request N hours (default 24) after being assigned → On-hold. Only the system sets On-hold.
// 2. On-hold for M hours (default 12) → responsible becomes the holding user (Demo User), and every
//    Super Admin gets a notification recommending who to give it to next.
// Runs every few minutes while the app is in use (maybeRunHoldRules) and from /api/cron/leads.
import { db } from "./db";
import { logSystem } from "./crm";
import { notify } from "./notify";
import { holdConfig, systemStatuses } from "./lead-hold-core";

export { holdConfig, systemStatuses, HOLD_KEYS } from "./lead-hold-core";

const HOUR = 3_600_000;

/** Error to show when someone tries to move a lead to On-hold themselves; null when the stage is fine. */
export async function manualHoldError(statusId: string) {
  const { onHoldId } = await systemStatuses(db);
  return statusId && statusId === onHoldId ? "On-hold is set automatically when a new lead isn't worked in time. Choose another stage." : null;
}

const g = globalThis as unknown as { __holdRunning?: boolean; __holdLastRun?: number };

/** Fire-and-forget check, at most every 5 minutes per server process. */
export function maybeRunHoldRules() {
  const now = Date.now();
  if (g.__holdRunning || now - (g.__holdLastRun ?? 0) < 5 * 60_000) return;
  g.__holdLastRun = now;
  runHoldRules().catch((e) => console.error("On-hold rules failed:", e));
}

export async function runHoldRules(now = new Date()) {
  const result = { held: 0, reassigned: 0 };
  if (g.__holdRunning) return result;
  g.__holdRunning = true;
  try {
    const [cfg, { newId, onHoldId }] = await Promise.all([holdConfig(db), systemStatuses(db)]);
    if (!cfg.enabled || !newId || !onHoldId) return result;
    const notHolding = cfg.holdingUserId ? { not: null, notIn: [cfg.holdingUserId] } : { not: null };

    // 1. New Request too long after assignment → On-hold.
    const holdCut = new Date(now.getTime() - cfg.toHoldHours * HOUR);
    const stale = await db.lead.findMany({
      where: {
        statusId: newId,
        ownerId: notHolding,
        AND: [
          { OR: [{ assignedAt: { lt: holdCut } }, { assignedAt: null, createdAt: { lt: holdCut } }] },
          { OR: [{ statusChangedAt: { lt: holdCut } }, { statusChangedAt: null }] },
        ],
      },
      select: { id: true, name: true, ownerId: true },
      take: 200,
    });
    for (const l of stale) {
      await db.lead.update({ where: { id: l.id }, data: { statusId: onHoldId } });
      await logSystem({ leadId: l.id }, `Moved to On-hold: still New Request ${cfg.toHoldHours}h after assignment`, null);
      await notify(l.ownerId, `Lead on hold: ${l.name}`, { body: `Not worked within ${cfg.toHoldHours} hours. Move it to another stage now, or it goes back for reassignment in ${cfg.reassignHours} hours.`, link: `/crm/leads/${l.id}` });
      result.held++;
    }

    // 2. On-hold too long → holding user, and ask Super Admins who should take it.
    if (!cfg.holdingUserId) return result;
    const holding = await db.user.findUnique({ where: { id: cfg.holdingUserId }, select: { id: true, name: true } });
    if (!holding) return result;
    const reassignCut = new Date(now.getTime() - cfg.reassignHours * HOUR);
    const parked = await db.lead.findMany({
      where: { statusId: onHoldId, ownerId: notHolding, OR: [{ statusChangedAt: { lt: reassignCut } }, { statusChangedAt: null, updatedAt: { lt: reassignCut } }] },
      select: { id: true, name: true, ownerId: true, owner: { select: { name: true } }, branchId: true, location: true, projectId: true },
      take: 200,
    });
    if (!parked.length) return result;
    const admins = await db.user.findMany({ where: { isSuperAdmin: true, active: true }, select: { id: true } });
    for (const l of parked) {
      // Keeps the lead's branch so it stays in that branch's lists and recommendations.
      await db.lead.update({ where: { id: l.id }, data: { ownerId: holding.id } });
      await logSystem({ leadId: l.id }, `Taken from ${l.owner?.name ?? "—"} after ${cfg.reassignHours}h on hold; given to ${holding.name} until reassigned`, null);
      await notify(l.ownerId, `Lead taken back: ${l.name}`, { body: `It stayed on hold for ${cfg.reassignHours} hours.`, link: "/crm/leads" });
      const recs = await recommendAgents(l, [l.ownerId, holding.id]);
      const body = [
        `On hold ${cfg.reassignHours}h with ${l.owner?.name ?? "no one"}; now with ${holding.name}. Who should get it next?`,
        recs.length ? `Recommended:\n${recs.map((r, i) => `${i + 1}. ${r.name}: ${r.reasons.join(", ")}`).join("\n")}` : "No similar agents found.",
      ].join("\n\n");
      for (const a of admins) await notify(a.id, `Reassign lead: ${l.name}`, { body, link: `/crm/leads/${l.id}` });
      result.reassigned++;
    }
    return result;
  } finally {
    g.__holdRunning = false;
  }
}

type LeadForRecs = { branchId: string | null; location: string | null; projectId: string | null };
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const sameArea = (a: string, b: string) => !!a && !!b && (a === b || a.includes(b) || b.includes(a));

/**
 * Up to 3 agents for a lead, best first: people who work leads in the same area and project, in the
 * same branch, with a lighter open workload. `exclude` drops the previous owner and the holding user.
 */
export async function recommendAgents(lead: LeadForRecs, exclude: (string | null)[]) {
  const agents = await db.user.findMany({
    where: {
      active: true,
      id: { notIn: exclude.filter((x): x is string => !!x) },
      roles: { some: { role: { permissions: { some: { module: "crm.leads", action: "edit", scope: { not: "none" } } } } } },
    },
    select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
  });
  if (!agents.length) return [];
  const ids = agents.map((a) => a.id);
  const since = new Date(Date.now() - 180 * 24 * HOUR);
  const [recent, open] = await Promise.all([
    db.lead.findMany({ where: { ownerId: { in: ids }, createdAt: { gte: since } }, select: { ownerId: true, location: true, projectId: true } }),
    db.lead.groupBy({ by: ["ownerId"], where: { ownerId: { in: ids }, status: { kind: "open" } }, _count: true }),
  ]);
  const area = norm(lead.location);
  return agents
    .map((a) => {
      const mine = recent.filter((r) => r.ownerId === a.id);
      const areaHits = area ? mine.filter((r) => sameArea(norm(r.location), area)).length : 0;
      const projectHits = lead.projectId ? mine.filter((r) => r.projectId === lead.projectId).length : 0;
      const sameBranch = !!lead.branchId && a.branchId === lead.branchId;
      const openCount = open.find((o) => o.ownerId === a.id)?._count ?? 0;
      const reasons = [
        areaHits && `${areaHits} lead(s) in ${lead.location}`,
        projectHits && `${projectHits} in the same project`,
        sameBranch && `${a.branch?.name ?? "same"} branch`,
        `${openCount} open lead(s)`,
      ].filter(Boolean) as string[];
      return { id: a.id, name: a.name, reasons, score: areaHits * 3 + projectHits * 2 + (sameBranch ? 4 : 0) - openCount * 0.1 };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);
}
