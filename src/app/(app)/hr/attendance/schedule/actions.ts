"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { logAttendance } from "@/lib/attendance";
import { str, type FormState } from "@/lib/utils";

/** Saves the roster grid: each cell is "" (usual shift), "off" or a shift id. */
export async function saveRoster(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(user.isSuperAdmin || ["all", "branch"].includes(scopeFor(user, "hr.attendance", "edit")))) return { error: "You can't change the schedule." };
  const shifts = new Set((await db.shift.findMany({ select: { id: true } })).map((s) => s.id));
  let changed = 0;
  for (const [k, raw] of fd.entries()) {
    if (!k.startsWith("c:")) continue;
    const [, employeeId, ymd] = k.split(":");
    const value = String(raw);
    const date = new Date(`${ymd}T00:00:00`);
    if (!employeeId || Number.isNaN(date.getTime())) continue;
    const before = str(fd, `was:${employeeId}:${ymd}`);
    if (value === before) continue;
    if (!value) await db.rosterDay.deleteMany({ where: { employeeId, date } });
    else if (value === "off" || shifts.has(value)) {
      const data = { off: value === "off", shiftId: value === "off" ? null : value, start: null, end: null, note: "Scheduled by HR", createdById: user.id };
      await db.rosterDay.upsert({ where: { employeeId_date: { employeeId, date } }, update: data, create: { employeeId, date, ...data } });
    } else continue;
    await logAttendance({ employeeId, date, kind: "hr_edit", source: "manual", byId: user.id, summary: `Schedule changed: ${before || "usual shift"} → ${value || "usual shift"}` });
    changed++;
  }
  if (changed) await audit(user.id, "update", "roster", null, `Changed ${changed} schedule cell(s)`);
  revalidatePath("/hr/attendance/schedule");
  return { ok: true, message: changed ? `Saved ${changed} change${changed === 1 ? "" : "s"}.` : "Nothing changed." };
}
