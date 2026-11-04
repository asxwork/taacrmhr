"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, scopeMatcher } from "@/lib/permissions";
import type { FormState } from "@/lib/utils";

/** Agent at the site: saves the phone's location on the visit and marks it done. */
export async function checkInVisit(activityId: string, lat: number, lng: number, acc: number | null): Promise<FormState> {
  const user = await requirePermission("crm.visits", "create");
  if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: "Couldn't read your location." };
  const a = await db.activity.findUnique({ where: { id: activityId }, select: { id: true, type: true, ownerId: true, branchId: true, leadId: true, checkInAt: true } });
  if (!a || a.type !== "visit" || !(await scopeMatcher(user, "crm.visits", "create"))(a)) return { error: "You can't check in to this visit." };
  if (a.checkInAt) return { error: "Already checked in." };
  const now = new Date();
  await db.activity.update({ where: { id: a.id }, data: { checkInAt: now, checkInLat: lat, checkInLng: lng, checkInAcc: acc, doneAt: now } });
  if (a.leadId) await db.lead.update({ where: { id: a.leadId }, data: { lastActivityAt: now } });
  revalidatePath("/crm/visits");
  return { ok: true, message: "Checked in." };
}
