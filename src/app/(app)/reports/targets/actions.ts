"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, scopeMatcher } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

/** Saves one person's monthly targets (Targets & leaderboard → Edit, within the editor's scope). */
export async function saveTarget(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.targets", "edit");
  const userId = str(fd, "userId");
  const month = str(fd, "month");
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Pick a month." };
  const person = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, branchId: true } });
  if (!person || !(await scopeMatcher(user, "crm.targets", "edit"))({ ownerId: person.id, branchId: person.branchId })) return { error: "You can't set targets for this person." };
  const n = (k: string) => Math.max(0, Math.round(Number(str(fd, k).replace(/,/g, "")) || 0));
  const data = { calls: n("calls"), visits: n("visits"), deals: n("deals"), wonValue: n("wonValue") };
  await db.salesTarget.upsert({ where: { userId_month: { userId, month } }, update: data, create: { userId, month, ...data } });
  await audit(user.id, "update", "salesTarget", userId, `Targets ${month} for ${person.name}: ${data.calls} calls, ${data.visits} visits, ${data.deals} deals, PKR ${data.wonValue}`);
  revalidatePath("/reports/targets");
  revalidatePath("/dashboard");
  return { ok: true, message: `Saved for ${person.name}.` };
}
