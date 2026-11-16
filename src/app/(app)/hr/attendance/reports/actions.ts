"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { templateByKey, type AttFilters } from "@/lib/attendance-templates";
import { sendAttPreset } from "@/lib/attendance-schedule";

const SCHEDULES = ["daily", "weekly", "monthly"];

/** Save the current template + filters as a preset; optionally email it on a schedule. */
export async function saveAttPreset(input: { template: string; name: string; filters: AttFilters; shared: boolean; schedule: string; recipients: string[] }) {
  const user = await requirePermission("hr.attendance");
  if (!templateByKey(input.template)) return { error: "Unknown report." };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Give the preset a name." };
  const schedule = SCHEDULES.includes(input.schedule) ? input.schedule : null;
  const recipients = schedule ? [...new Set(input.recipients.length ? input.recipients : [user.id])].slice(0, 50) : [];
  const p = await db.attReportPreset.create({ data: { name, template: input.template, filters: JSON.stringify(input.filters), createdById: user.id, shared: input.shared, schedule, recipients: recipients.join(",") || null } });
  await audit(user.id, "create", "att-report", p.id, `Attendance report preset “${name}”${schedule ? ` (emailed ${schedule})` : ""}`);
  revalidatePath("/hr/attendance/reports");
  return { ok: true, id: p.id };
}

export async function deleteAttPreset(fd: FormData) {
  const user = await requirePermission("hr.attendance");
  const p = await db.attReportPreset.findUnique({ where: { id: String(fd.get("id")) } });
  if (!p || (p.createdById !== user.id && !user.isSuperAdmin)) return;
  await db.attReportPreset.delete({ where: { id: p.id } });
  revalidatePath("/hr/attendance/reports");
}

/** Email a scheduled preset right now (to check what recipients will get). */
export async function sendAttPresetNow(fd: FormData) {
  const user = await requirePermission("hr.attendance");
  const p = await db.attReportPreset.findUnique({ where: { id: String(fd.get("id")) } });
  if (!p || (p.createdById !== user.id && !user.isSuperAdmin)) return;
  await sendAttPreset(p, new Date());
  revalidatePath("/hr/attendance/reports");
}
