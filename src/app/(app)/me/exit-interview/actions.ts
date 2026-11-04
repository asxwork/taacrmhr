"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, scopeMatcher } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { hrApproverIds } from "@/lib/approvals";
import { disabledFeatures } from "@/lib/features";
import { EXIT_RATINGS, EXIT_REASONS } from "@/lib/exit-interview";
import { str, type FormState } from "@/lib/utils";

/** Saves an exit interview — by the leaver themselves, or by HR on their behalf (Exit interviews → Edit). */
export async function saveExitInterview(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if ((await disabledFeatures()).has("exitinterviews")) return { error: "Exit interviews are switched off." };
  const forId = str(fd, "employeeId");
  const emp = forId
    ? await db.employee.findUnique({ where: { id: forId }, select: { id: true, userId: true, branchId: true, fullName: true, status: true } })
    : await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, userId: true, branchId: true, fullName: true, status: true } });
  if (!emp) return { error: "Employee not found." };
  const self = emp.userId === user.id;
  if (!self && !(can(user, "hr.exit", "edit") && (await scopeMatcher(user, "hr.exit", "edit"))({ ownerId: emp.userId, branchId: emp.branchId }))) return { error: "You can't fill this exit interview." };
  if (self && !["notice", "left"].includes(emp.status)) return { error: "The exit interview opens once your resignation is recorded." };
  const reasons = fd.getAll("reasons").map(String).filter((r) => EXIT_REASONS.includes(r));
  const ratings = Object.fromEntries(EXIT_RATINGS.map(([k]) => [k, Number(str(fd, `r_${k}`)) || null]));
  const rejoin = str(fd, "wouldRejoin");
  const data = { reasons: reasons.join(", ") || null, ratings: JSON.stringify(ratings), liked: str(fd, "liked").slice(0, 3000) || null, improve: str(fd, "improve").slice(0, 3000) || null, wouldRejoin: rejoin === "yes" ? true : rejoin === "no" ? false : null, submittedAt: new Date() };
  const before = await db.exitInterview.findUnique({ where: { employeeId: emp.id } });
  await db.exitInterview.upsert({ where: { employeeId: emp.id }, update: data, create: { employeeId: emp.id, ...data } });
  if (self && !before?.submittedAt) for (const id of await hrApproverIds()) await notify(id, `${emp.fullName} completed their exit interview`, { link: `/hr/exits/interviews?open=${emp.id}` });
  revalidatePath("/me/exit-interview");
  revalidatePath("/hr/exits/interviews");
  return { ok: true, message: self ? "Thank you — your answers have been sent to HR." : "Saved." };
}
