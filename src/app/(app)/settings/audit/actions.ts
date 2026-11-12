"use server";

import { revalidatePath } from "next/cache";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ACTIVITY_CATEGORIES, entityFilter, type ActivityCategory } from "@/lib/activity-log";
import { str, type FormState } from "@/lib/utils";

/** Super Admin only: delete activity older than N days (one category or all). The clean-up itself is logged. */
export async function deleteOldActivity(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin) return { error: "Only a Super Admin can delete activity." };
  const days = Number(str(fd, "days"));
  if (![30, 90, 180, 365].includes(days)) return { error: "Choose how old." };
  const cat = str(fd, "cat") as ActivityCategory | "";
  if (cat && !ACTIVITY_CATEGORIES.some((c) => c.key === cat)) return { error: "Unknown category." };
  const before = subDays(new Date(), days);
  const a = await db.auditLog.deleteMany({ where: { createdAt: { lt: before }, ...(cat ? entityFilter(cat) : {}) } });
  const b = !cat || cat === "attendance" ? await db.attendanceLog.deleteMany({ where: { createdAt: { lt: before } } }) : { count: 0 };
  const label = cat ? ACTIVITY_CATEGORIES.find((c) => c.key === cat)!.label : "all categories";
  await audit(user.id, "delete", "setting", "activity-log", `Deleted ${a.count + b.count} activity entries older than ${days} days (${label})`);
  revalidatePath("/settings/audit");
  return { ok: true, message: `Deleted ${a.count + b.count} entries older than ${days} days.` };
}
