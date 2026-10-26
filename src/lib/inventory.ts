import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { can, scopeMatcher, scopeWhere } from "./permissions";
import type { SessionUser } from "./auth";
import type { Action } from "./rbac";
import { fmtPKR } from "./crm-shared";
import { logSystem } from "./crm";

export * from "./inventory-shared";

// Access model:
//  - Project stock (listingType "project") is company inventory, governed by `inventory.projects` (on/off).
//  - Resale/rental listings belong to an agent, governed by `inventory.units` with own/team/branch/all scope.

/** Prisma filter for units the user may act on. null = none. */
export async function unitWhere(user: SessionUser, action: Action = "view"): Promise<Prisma.UnitWhereInput | null> {
  const listingScope = await scopeWhere(user, "inventory.units", action);
  const parts: Prisma.UnitWhereInput[] = [];
  if (can(user, "inventory.projects", action)) parts.push({ listingType: "project" });
  if (listingScope) parts.push({ listingType: { not: "project" }, ...listingScope });
  return parts.length ? { OR: parts } : null;
}

/** In-memory check for a loaded unit. */
export async function unitAllows(user: SessionUser, unit: { listingType: string; ownerId: string | null; branchId: string | null }, action: Action) {
  if (unit.listingType === "project") return can(user, "inventory.projects", action);
  return can(user, "inventory.units", action) && (await scopeMatcher(user, "inventory.units", action))(unit);
}

/**
 * Apply a deal's stage to its linked units: stage.unitStatus books/sells/rents them;
 * a stage without one (or Lost) releases units this deal was holding.
 */
export async function syncDealUnits(dealId: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { stage: true, units: { include: { unit: true } } } });
  if (!deal) return;
  const target = deal.stage.kind === "lost" ? null : deal.stage.unitStatus;
  for (const { unit } of deal.units) {
    const heldByOther = unit.activeDealId && unit.activeDealId !== dealId;
    if (heldByOther) continue;
    if (target) {
      await db.unit.update({ where: { id: unit.id }, data: { status: target, activeDealId: dealId } });
    } else if (unit.activeDealId === dealId) {
      await db.unit.update({ where: { id: unit.id }, data: { status: "available", activeDealId: null } });
    }
  }
}

/**
 * Links a unit to a deal: the one path used by the deal page, lead conversion and "Create deal" on a unit.
 * Refuses a unit another deal holds or that is already booked/sold, fills an empty deal value from the
 * unit price, and applies the deal's stage to the unit (e.g. hold). Returns an error message, or null.
 */
export async function attachUnitToDeal(
  deal: { id: string; value: number | null },
  unit: { id: string; unitNo: string; status: string; activeDealId: string | null; price: number | null; project?: { name: string } | null; block?: { name: string } | null; address?: string | null },
  actorId: string | null,
) {
  if (unit.activeDealId && unit.activeDealId !== deal.id) return `${unit.unitNo} is already ${unit.status} through another deal.`;
  if (!["available", "hold"].includes(unit.status) && unit.activeDealId !== deal.id) return `${unit.unitNo} is ${unit.status} and can't be linked.`;
  await db.dealUnit.upsert({ where: { dealId_unitId: { dealId: deal.id, unitId: unit.id } }, update: {}, create: { dealId: deal.id, unitId: unit.id } });
  if (deal.value == null && unit.price) await db.deal.update({ where: { id: deal.id }, data: { value: unit.price } });
  await syncDealUnits(deal.id);
  await logSystem({ dealId: deal.id }, `Linked unit ${unitLabel(unit)}`, actorId);
  return null;
}

/** Release a unit if this deal holds it (on unlink / deal delete). */
export async function releaseUnit(unitId: string, dealId: string) {
  await db.unit.updateMany({ where: { id: unitId, activeDealId: dealId }, data: { status: "available", activeDealId: null } });
}

export function unitLabel(u: { unitNo: string; project?: { name: string } | null; block?: { name: string } | null; address?: string | null }) {
  return [u.project?.name, u.block?.name, u.unitNo].filter(Boolean).join(" · ") || u.address || u.unitNo;
}

/** Available units that fit a lead's requirement: type, purpose and budget (±10%), ranked by location match. */
export async function matchUnitsForLead(
  user: SessionUser,
  lead: { interest: string | null; propertyType: string | null; location: string | null; budgetMin: number | null; budgetMax: number | null },
  limit = 5,
) {
  const visible = await unitWhere(user, "view");
  if (!visible) return [];
  const lo = lead.budgetMin ?? lead.budgetMax;
  const hi = lead.budgetMax ?? lead.budgetMin;
  const candidates = await db.unit.findMany({
    where: {
      AND: [
        visible,
        { status: "available", purpose: lead.interest === "rent" ? "rent" : "sale" },
        ...(lead.propertyType ? [{ type: lead.propertyType }] : []),
        ...(lo != null && hi != null ? [{ price: { gte: lo * 0.9, lte: hi * 1.1 } }] : []),
      ],
    },
    include: { project: true, block: true, images: { orderBy: { sortOrder: "asc" }, take: 1 } },
    take: 60,
  });
  const words = (lead.location ?? "").toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2);
  const score = (u: (typeof candidates)[number]) => {
    const hay = [u.project?.name, u.project?.location, u.address].join(" ").toLowerCase();
    return words.filter((w) => hay.includes(w)).length;
  };
  return candidates.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

/** Units/listings the user may see, as picker options for "the property this lead is about". */
export async function unitOptions(user: SessionUser) {
  const where = await unitWhere(user);
  if (!where) return [];
  const units = await db.unit.findMany({
    where, include: { project: { select: { name: true } }, block: { select: { name: true } } },
    orderBy: [{ project: { name: "asc" } }, { unitNo: "asc" }], take: 2000,
  });
  return units.map((u) => ({
    id: u.id,
    label: unitLabel(u),
    sub: [u.type, u.status, u.price ? fmtPKR(u.price) : null, u.listingType !== "project" ? u.address : null].filter(Boolean).join(" · "),
  }));
}
