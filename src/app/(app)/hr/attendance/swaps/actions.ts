"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission, scopeMatcher } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { applySwap } from "@/lib/shift-swap";
import { str } from "@/lib/utils";

export async function decideSwap(fd: FormData) {
  const user = await requirePermission("hr.shiftswap", "approve");
  const s = await db.shiftSwap.findFirst({ where: { id: str(fd, "id"), status: "manager" }, include: { requester: { select: { userId: true, branchId: true, fullName: true } }, partner: { select: { userId: true, fullName: true } } } });
  if (!s || !(await scopeMatcher(user, "hr.shiftswap", "approve"))({ ownerId: s.requester.userId, branchId: s.requester.branchId })) return;
  const ok = str(fd, "decision") === "approve";
  await db.shiftSwap.update({ where: { id: s.id }, data: { status: ok ? "approved" : "rejected", decidedById: user.id, decidedAt: new Date() } });
  if (ok) await applySwap(s.id, user.id);
  const title = `Shift swap on ${format(s.date, "EEE d MMM")} ${ok ? "approved" : "not approved"}`;
  await notify(s.requester.userId, title, { link: "/me/swaps" });
  await notify(s.partner.userId, title, { link: "/me/swaps" });
  await audit(user.id, "update", "shiftswap", s.id, `${title}: ${s.requester.fullName} ↔ ${s.partner.fullName}`);
  revalidatePath("/hr/attendance/swaps");
}
