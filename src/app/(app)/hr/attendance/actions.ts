"use server";

import { revalidatePath } from "next/cache";
import { addDays, format, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, scopeFor, scopeMatcher } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { importDevicePunches, logAttendance, parseDeviceLog, punchLines } from "@/lib/attendance";
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

  const dayPunches = () => db.attendancePunch.findMany({ where: { employeeId: emp.id, at: { gte: day, lt: addDays(day, 1) } }, orderBy: { at: "asc" }, select: { at: true, source: true } });
  const prior = await db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: day } } });
  const before = `Status: ${prior?.status ?? "auto"}${prior?.note ? ` (${prior.note})` : ""}\nPunches: ${punchLines(await dayPunches())}`;

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

  await logAttendance({
    employeeId: emp.id, date: day, kind: "hr_edit", source: "manual", byId: user.id, before,
    after: `Status: ${status}${note ? ` (${note})` : ""}\nPunches: ${punchLines(await dayPunches())}`,
    summary: `HR edit · status ${status}${str(fd, "addIn") ? ` · added in ${str(fd, "addIn")}` : ""}${str(fd, "addOut") ? ` · added out ${str(fd, "addOut")}` : ""}${note ? ` · "${note}"` : ""}`,
  });
  await audit(user.id, "update", "attendance", emp.id, `Edited attendance for ${emp.fullName} on ${day.toDateString()}`);
  revalidatePath("/hr/attendance");
  return { ok: true, message: "Saved." };
}

// ─── Deleting attendance records: Super Admin only, always logged ─────────────

/** Removes one punch (machine, web or manual). Kept in the attendance log with who deleted it. */
export async function deletePunch(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const punch = await db.attendancePunch.findUnique({ where: { id: str(fd, "id") }, include: { employee: { select: { fullName: true } } } });
  if (!punch) return;
  await db.attendancePunch.delete({ where: { id: punch.id } });
  await logAttendance({
    employeeId: punch.employeeId, date: startOfDay(punch.at), kind: "delete", source: punch.source, byId: user.id,
    summary: `Deleted ${punch.source} punch at ${format(punch.at, "h:mm a")}`,
    before: punchLines([punch]),
  });
  await audit(user.id, "delete", "attendancePunch", punch.id, `Deleted a ${punch.source} punch for ${punch.employee.fullName} (${punch.at.toISOString()})`);
  revalidatePath("/hr/attendance/logs");
  revalidatePath("/hr/attendance");
}

/** Removes an attendance log entry. Recorded in the audit log, so even this leaves a trace. */
export async function deleteAttendanceLog(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const entry = await db.attendanceLog.findUnique({ where: { id: str(fd, "id") } });
  if (!entry) return;
  await db.attendanceLog.delete({ where: { id: entry.id } });
  await audit(user.id, "delete", "attendanceLog", entry.id, `Deleted attendance log entry: ${entry.summary} (by ${entry.byName ?? "—"}, ${entry.createdAt.toISOString()})`);
  revalidatePath("/hr/attendance/logs");
}
