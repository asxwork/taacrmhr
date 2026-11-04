"use server";

import { revalidatePath } from "next/cache";
import { format, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { disabledFeatures } from "@/lib/features";
import { swapApproverIds } from "@/lib/shift-swap";
import { str, type FormState } from "@/lib/utils";

const me = async (userId: string) => db.employee.findUnique({ where: { userId }, select: { id: true, fullName: true } });

export async function requestSwap(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if ((await disabledFeatures()).has("shiftswap")) return { error: "Shift swaps are switched off." };
  const emp = await me(user.id);
  if (!emp) return { error: "Your login isn't linked to an employee record." };
  const partner = await db.employee.findFirst({ where: { id: str(fd, "partnerId"), status: { not: "left" }, NOT: { id: emp.id } }, select: { id: true, userId: true, fullName: true } });
  const d = str(fd, "date");
  const date = d ? startOfDay(new Date(`${d}T00:00:00`)) : null;
  if (!partner) return { error: "Choose a colleague." };
  if (!date || date < startOfDay(new Date())) return { error: "Choose today or a future date." };
  if (await db.shiftSwap.findFirst({ where: { date, status: { in: ["partner", "manager"] }, OR: [{ requesterId: emp.id }, { partnerId: emp.id }] } })) return { error: "You already have a swap waiting for that day." };
  await db.shiftSwap.create({ data: { requesterId: emp.id, partnerId: partner.id, date, reason: str(fd, "reason").slice(0, 300) || null } });
  await notify(partner.userId, `${emp.fullName} asked to swap shifts on ${format(date, "EEE d MMM")}`, { body: "Accept or decline in My Space → Requests → Shift swaps.", link: "/me/swaps" });
  revalidatePath("/me/swaps");
  return { ok: true, message: "Sent to your colleague." };
}

export async function answerSwap(fd: FormData) {
  const user = await requireUser();
  const emp = await me(user.id);
  const s = emp ? await db.shiftSwap.findFirst({ where: { id: str(fd, "id"), partnerId: emp.id, status: "partner" }, include: { requester: { select: { id: true, userId: true, fullName: true } } } }) : null;
  if (!s || !emp) return;
  const yes = str(fd, "answer") === "yes";
  await db.shiftSwap.update({ where: { id: s.id }, data: yes ? { status: "manager", partnerAt: new Date() } : { status: "rejected", partnerAt: new Date() } });
  await notify(s.requester.userId, `${emp.fullName} ${yes ? "accepted" : "declined"} your shift swap for ${format(s.date, "EEE d MMM")}`, { body: yes ? "It now goes to your manager for approval." : undefined, link: "/me/swaps" });
  if (yes) for (const id of await swapApproverIds(s.requester.id)) await notify(id, `Shift swap to approve: ${s.requester.fullName} ↔ ${emp.fullName}`, { body: format(s.date, "EEEE d MMM yyyy"), link: "/hr/attendance/swaps" });
  revalidatePath("/me/swaps");
}

export async function cancelSwap(fd: FormData) {
  const user = await requireUser();
  const emp = await me(user.id);
  if (!emp) return;
  await db.shiftSwap.updateMany({ where: { id: str(fd, "id"), requesterId: emp.id, status: { in: ["partner", "manager"] } }, data: { status: "cancelled" } });
  revalidatePath("/me/swaps");
}
