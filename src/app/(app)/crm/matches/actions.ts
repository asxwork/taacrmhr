"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, scopeMatcher } from "@/lib/permissions";
import { str } from "@/lib/utils";

/** Hides a match from the list (the agent has offered it, or it isn't right). */
export async function dismissMatch(fd: FormData) {
  const user = await requirePermission("crm.matches");
  const m = await db.propertyMatch.findUnique({ where: { id: str(fd, "id") }, include: { lead: { select: { ownerId: true, branchId: true } } } });
  if (!m || !(await scopeMatcher(user, "crm.matches", "view"))(m.lead)) return;
  await db.propertyMatch.update({ where: { id: m.id }, data: { dismissedAt: new Date() } });
  revalidatePath("/crm/matches");
}
