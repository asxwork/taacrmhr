"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
async function hrAdmin() {
  const user = await requireUser();
  return user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all" ? user : null;
}
const refresh = () => { revalidatePath("/hr/attendance/shifts"); revalidatePath("/hr/attendance"); };

/** Put chosen people on a shift. */
export async function assignShift(_: FormState, fd: FormData): Promise<FormState> {
  const user = await hrAdmin();
  if (!user) return { error: "Only HR admins can change shifts." };
  const shift = await db.shift.findUnique({ where: { id: str(fd, "shiftId") } });
  const ids = fd.getAll("employeeIds").map(String).filter(Boolean);
  if (!shift || !ids.length) return { error: "Choose the shift and at least one person." };
  await db.employee.updateMany({ where: { id: { in: ids } }, data: { shiftId: shift.id } });
  await audit(user.id, "update", "shift", shift.id, `${ids.length} people moved to ${shift.name}`);
  refresh();
  return { ok: true, message: `${ids.length} ${ids.length === 1 ? "person" : "people"} now on ${shift.name}.` };
}

/** Custom attendance for one employee: their own times, working days, grace and half-day rule. */
export async function saveCustomSchedule(_: FormState, fd: FormData): Promise<FormState> {
  const user = await hrAdmin();
  if (!user) return { error: "Only HR admins can change shifts." };
  const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") }, include: { shift: true } });
  if (!emp) return { error: "Choose the employee." };
  const start = str(fd, "start"), end = str(fd, "end");
  if (!HHMM.test(start) || !HHMM.test(end) || end <= start) return { error: "Use 24-hour times with the end after the start." };
  const workDays = fd.getAll("workDays").map(String).filter((d) => /^[1-7]$/.test(d)).join(",");
  if (!workDays) return { error: "Pick at least one working day." };
  const graceMin = Math.max(0, Math.min(120, Math.round(Number(str(fd, "graceMin")) || 0)));
  const halfDayMin = Math.max(30, Math.min(720, Math.round((Number(str(fd, "halfDayHours")) || 4) * 60)));
  const name = `Custom · ${emp.fullName} (${emp.code})`;
  const data = { start, end, graceMin, halfDayMin, workDays };
  const shift = await db.shift.upsert({ where: { name }, update: data, create: { name, ...data } });
  await db.employee.update({ where: { id: emp.id }, data: { shiftId: shift.id } });
  await audit(user.id, "update", "employee", emp.id, `${emp.fullName}: custom attendance ${start}–${end}`);
  refresh();
  return { ok: true, message: `${emp.fullName} now follows their own schedule (${start}–${end}).` };
}

/** Remove a shift nobody is on (custom ones too). */
export async function deleteShift(fd: FormData) {
  const user = await hrAdmin();
  if (!user) return;
  const shift = await db.shift.findUnique({ where: { id: str(fd, "id") }, include: { _count: { select: { employees: true } } } });
  if (!shift || shift._count.employees > 0 || shift.isDefault) return;
  if (!(await db.shift.delete({ where: { id: shift.id } }).catch(() => null))) return; // still used in a roster
  await audit(user.id, "delete", "shift", shift.id, `Deleted shift ${shift.name}`);
  refresh();
}
