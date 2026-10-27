"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { POLICY_KEYS } from "@/lib/attendance-policy";
import { str, type FormState } from "@/lib/utils";

/** Saves the attendance rules (and the two payroll numbers that belong with them). */
export async function savePolicyPlanner(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all")) return { error: "Only HR admins can change attendance policies." };
  const n = (k: string, max: number) => { const v = Number(str(fd, k)); return Number.isFinite(v) && v >= 0 && v <= max ? v : null; };
  const lates = n("latesPerDay", 31), overtimeAfter = n("overtimeAfterMin", 600), rate = n("overtimeRate", 5), absentUnderH = n("absentUnderHours", 12);
  if ([lates, overtimeAfter, rate, absentUnderH].some((v) => v == null)) return { error: "Check the numbers: they must be zero or more." };
  const missing = ["present", "half", "absent"].includes(str(fd, "missingAs")) ? str(fd, "missingAs") : "present";
  const set = (key: string, value: string) => db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  await Promise.all([
    set("payroll.latesPerDay", String(lates)), set("payroll.overtimeRate", String(rate)),
    set(POLICY_KEYS.missingAs, missing), set(POLICY_KEYS.overtimeAfterMin, String(overtimeAfter)), set(POLICY_KEYS.absentUnderMin, String(Math.round(absentUnderH! * 60))),
  ]);
  await audit(user.id, "update", "setting", "attendance.policy", "Attendance policy updated");
  revalidatePath("/hr/policies/planner");
  return { ok: true, message: "Saved. Attendance, reports and the next payroll use these rules." };
}
