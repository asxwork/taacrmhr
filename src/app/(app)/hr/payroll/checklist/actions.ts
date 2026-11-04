"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str } from "@/lib/utils";

/** Ticks (or unticks) one checklist step for a payroll month. */
export async function toggleCheck(fd: FormData) {
  const user = await requirePermission("hr.payrollchecklist", "edit");
  const month = str(fd, "month"), key = str(fd, "key");
  if (!/^\d{4}-\d{2}$/.test(month) || !key) return;
  const existing = await db.payrollCheck.findUnique({ where: { month_key: { month, key } } });
  if (existing) await db.payrollCheck.delete({ where: { id: existing.id } });
  else await db.payrollCheck.create({ data: { month, key, doneById: user.id } });
  await audit(user.id, "update", "payroll", month, `Payroll checklist ${month}: ${key} ${existing ? "unticked" : "done"}`);
  revalidatePath("/hr/payroll/checklist");
}
