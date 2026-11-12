"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { forget } from "@/lib/memo";
import { POLICY_KEYS } from "@/lib/attendance-policy";
import { str, type FormState } from "@/lib/utils";

/** Saves one attendance rule (one tab of Compliance → Attendance Policy). */
export async function saveAttendanceRule(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all")) return { error: "Only HR admins can change attendance policies." };
  const num = (k: string, max: number) => { const v = Number(str(fd, k)); return Number.isFinite(v) && v >= 0 && v <= max ? v : null; };
  const set = (key: string, value: string) => db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  const topic = str(fd, "topic");
  if (topic === "absent") {
    const h = num("absentUnderHours", 12); if (h == null) return { error: "Hours must be 0–12." };
    await set(POLICY_KEYS.absentUnderMin, String(Math.round(h * 60)));
  } else if (topic === "missing") {
    const v = str(fd, "missingAs"); if (!["present", "half", "absent"].includes(v)) return { error: "Choose an option." };
    await set(POLICY_KEYS.missingAs, v);
  } else if (topic === "late") {
    const n = num("latesPerDay", 31); if (n == null) return { error: "Enter 0–31." };
    await set("payroll.latesPerDay", String(n));
  } else if (topic === "overtime") {
    const after = num("overtimeAfterMin", 600), rate = num("overtimeRate", 5);
    if (after == null || rate == null) return { error: "Check the numbers." };
    await Promise.all([set(POLICY_KEYS.overtimeAfterMin, String(after)), set("payroll.overtimeRate", String(rate))]);
  } else return { error: "Unknown rule." };
  forget("setting:");
  await audit(user.id, "update", "setting", `attendance.${topic}`, `Attendance policy (${topic}) updated`);
  revalidatePath("/hr/attendance/policy");
  return { ok: true, message: "Saved. Attendance, reports and the next payroll use this rule." };
}
