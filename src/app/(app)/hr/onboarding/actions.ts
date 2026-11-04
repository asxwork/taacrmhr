"use server";

import { randomBytes } from "node:crypto";
import { addDays } from "date-fns";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

export async function createInvite(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.onboarding", "create");
  const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") }, select: { id: true, fullName: true } });
  if (!emp) return { error: "Choose an employee." };
  await db.onboardingInvite.updateMany({ where: { employeeId: emp.id, submittedAt: null }, data: { expiresAt: new Date() } });
  await db.onboardingInvite.create({ data: { employeeId: emp.id, token: randomBytes(24).toString("base64url"), expiresAt: addDays(new Date(), 14), createdById: user.id } });
  await audit(user.id, "create", "onboarding", emp.id, `Onboarding link for ${emp.fullName}`);
  revalidatePath("/hr/onboarding");
  return { ok: true, message: "Link created — copy it or send it on WhatsApp." };
}
