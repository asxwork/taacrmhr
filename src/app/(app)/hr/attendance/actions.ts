"use server";

import { revalidatePath } from "next/cache";
import { startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, scopeFor, scopeMatcher } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { importDevicePunches, parseDeviceLog } from "@/lib/attendance";
import { str, type FormState } from "@/lib/utils";

/** Device imports touch everyone, so they need company-wide attendance edit rights. */
async function requireAttendanceAdmin() {
  const user = await requireUser();
  if (!user.isSuperAdmin && scopeFor(user, "hr.attendance", "edit") !== "all") return null;
  return user;
}

export async function importDeviceFile(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAttendanceAdmin();
  if (!user) return { error: "Only HR with company-wide attendance access can import device logs." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the export file from the device." };
  if (file.size > 10_000_000) return { error: "File is larger than 10 MB." };

  const { rows, skipped } = parseDeviceLog(await file.text());
  if (!rows.length) return { error: "No punches found. Use the device's attlog (.dat) or a CSV with ID and date/time columns." };
  const res = await importDevicePunches(rows, user.id);
  await audit(user.id, "create", "attendancePunch", null, `Imported ${res.added} punch(es) from ${file.name}`);
  revalidatePath("/hr/attendance");
  const parts = [`Added ${res.added} punch(es)`, res.duplicates && `${res.duplicates} already imported`, res.future && `${res.future} with a future time skipped (check the device clock)`, skipped && `${skipped} unreadable line(s)`].filter(Boolean);
  const unknown = res.unknown.length ? ` Unknown device IDs: ${res.unknown.slice(0, 10).join(", ")}${res.unknown.length > 10 ? "…" : ""} — set them below.` : "";
  return { ok: true, message: `${parts.join(", ")}.${unknown}` };
}

export async function saveDeviceIds(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAttendanceAdmin();
  if (!user) return { error: "Not allowed." };
  const entries = [...fd.entries()].filter(([k]) => k.startsWith("dev:")).map(([k, v]) => [k.slice(4), String(v).trim()] as const);
  const ids = entries.map(([, v]) => v).filter(Boolean);
  if (new Set(ids).size !== ids.length) return { error: "Two employees can't share the same device ID." };
  for (const [, v] of entries) {
    if (v && !/^\d{1,9}$/.test(v)) return { error: `Device IDs are numbers (got “${v}”).` };
  }
  // Clear first so swapping two IDs doesn't hit the unique constraint.
  await db.$transaction([
    db.employee.updateMany({ where: { id: { in: entries.map(([id]) => id) } }, data: { deviceUserId: null } }),
    ...entries.filter(([, v]) => v).map(([id, v]) => db.employee.update({ where: { id }, data: { deviceUserId: v } })),
  ]);
  await audit(user.id, "update", "employee", null, "Updated ZKTeco device IDs");
  revalidatePath("/hr/attendance");
  return { ok: true, message: "Device IDs saved." };
}

/** HR edit of one day: add punches and/or force a status (with a note). */
export async function saveDayOverride(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user, "hr.attendance", "edit")) return { error: "Not allowed." };
  const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") } });
  if (!emp || !(await scopeMatcher(user, "hr.attendance", "edit"))({ ownerId: emp.userId, branchId: emp.branchId })) return { error: "You can't edit this employee's attendance." };
  const day = startOfDay(new Date(str(fd, "date")));
  if (Number.isNaN(day.getTime())) return { error: "Invalid date." };

  for (const key of ["addIn", "addOut"]) {
    const t = str(fd, key);
    if (!/^\d{2}:\d{2}$/.test(t)) continue;
    const [h, m] = t.split(":").map(Number);
    const when = new Date(day.getTime() + (h! * 60 + m!) * 60_000);
    await db.attendancePunch.upsert({ where: { employeeId_at: { employeeId: emp.id, at: when } }, update: {}, create: { employeeId: emp.id, at: when, source: "manual", createdById: user.id } });
  }
  const status = str(fd, "status") || "auto";
  const note = str(fd, "note") || null;
  if (status === "auto" && !note) await db.attendanceDay.deleteMany({ where: { employeeId: emp.id, date: day } });
  else await db.attendanceDay.upsert({ where: { employeeId_date: { employeeId: emp.id, date: day } }, update: { status, note, corrected: true }, create: { employeeId: emp.id, date: day, status, note, corrected: true } });

  await audit(user.id, "update", "attendance", emp.id, `Edited attendance for ${emp.fullName} on ${day.toDateString()}`);
  revalidatePath("/hr/attendance");
  return { ok: true, message: "Saved." };
}
