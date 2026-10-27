"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str } from "@/lib/utils";

/** Approve, block or rename a machine (HR with company-wide attendance edit rights). */
export async function updateMachine(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin && scopeFor(user, "hr.attendance", "edit") !== "all") return;
  const m = await db.attendanceMachine.findUnique({ where: { id: str(fd, "id") } });
  if (!m) return;
  const status = ["approved", "blocked", "pending"].includes(str(fd, "status")) ? str(fd, "status") : m.status;
  const name = fd.has("name") ? str(fd, "name").slice(0, 80) || null : m.name;
  await db.attendanceMachine.update({ where: { id: m.id }, data: { status, name } });
  if (status !== m.status) await audit(user.id, "update", "attendanceMachine", m.id, `Machine ${m.serial} ${status}`);
  revalidatePath("/hr/attendance/machines");
}

/** Super Admin: forget a machine (it reappears as pending if it calls in again). */
export async function deleteMachine(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const m = await db.attendanceMachine.findUnique({ where: { id: str(fd, "id") } });
  if (!m) return;
  await db.attendanceMachine.delete({ where: { id: m.id } });
  await audit(user.id, "delete", "attendanceMachine", m.id, `Machine ${m.serial} removed`);
  revalidatePath("/hr/attendance/machines");
}
