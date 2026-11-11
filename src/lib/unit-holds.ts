// Unit hold expiry: a unit put "On hold" by hand goes back to Available after N days, so stock isn't locked forever.
// Units held through a deal stage are left alone (the deal controls them).
import { addDays } from "date-fns";
import { db } from "./db";
import { notify } from "./notify";
import { audit } from "./audit";
import { disabledFeatures } from "./features";
import { findMatchesForUnit } from "./matches";

export const HOLD_DAYS_KEY = "inventory.holdDays";

/** Days a manual hold lasts (0 = never expires). */
export async function holdDays() {
  const v = Number((await db.setting.findUnique({ where: { key: HOLD_DAYS_KEY } }))?.value ?? 7);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, 365) : 7;
}

/** When a hold set now should end, or null when holds don't expire / the feature is off. */
export async function holdUntilFromNow() {
  if ((await disabledFeatures()).has("holdexpiry")) return null;
  const d = await holdDays();
  return d ? addDays(new Date(), d) : null;
}

/** Daily job: releases expired manual holds and tells each unit's agent. */
export async function releaseExpiredHolds() {
  if ((await disabledFeatures()).has("holdexpiry")) return 0;
  const units = await db.unit.findMany({
    where: { status: "hold", activeDealId: null, holdUntil: { lt: new Date() } },
    select: { id: true, unitNo: true, ownerId: true, project: { select: { name: true } } },
  });
  for (const u of units) {
    await db.unit.update({ where: { id: u.id }, data: { status: "available", holdUntil: null } });
    const name = `${u.project?.name ? `${u.project.name} · ` : ""}${u.unitNo}`;
    await notify(u.ownerId, `Hold expired: ${name} is available again`, { body: "Put it on hold again if the client is still deciding.", link: `/inventory/units/${u.id}` });
    await audit(null, "update", "unit", u.id, `Hold expired: ${name} set back to available`);
    findMatchesForUnit(u.id); // agents with matching leads hear about it
  }
  return units.length;
}
