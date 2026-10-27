"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str } from "@/lib/utils";

const admin = async () => {
  const user = await requireUser();
  return user.isSuperAdmin || scopeFor(user, "hr.attendance", "edit") === "all" ? user : null;
};

export async function setDeviceLock(fd: FormData) {
  const user = await admin();
  if (!user) return;
  const value = fd.get("on") === "on" ? "on" : "off";
  await db.setting.upsert({ where: { key: "attendance.deviceLock" }, update: { value }, create: { key: "attendance.deviceLock", value } });
  await audit(user.id, "update", "setting", "attendance.deviceLock", `Check-in device lock ${value}`);
  revalidatePath("/hr/attendance/device-changes");
}

/** Forgets a registered device; the employee's next check-in registers a new one automatically if none is left. */
export async function removeDevice(fd: FormData) {
  const user = await admin();
  if (!user) return;
  const d = await db.checkinDevice.findUnique({ where: { id: str(fd, "id") }, include: { employee: { select: { fullName: true } } } });
  if (!d) return;
  await db.checkinDevice.delete({ where: { id: d.id } });
  await audit(user.id, "delete", "checkinDevice", d.id, `Removed ${d.label} for ${d.employee.fullName}`);
  revalidatePath("/hr/attendance/device-changes");
}
