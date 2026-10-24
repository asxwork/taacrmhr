"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, requirePermission, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { str, type FormState } from "@/lib/utils";

const FIELDS = { owner: "userId", branch: "branchId" };

/** The assigned reviewer, or HR with edit access to this employee. */
async function canReview(user: SessionUser, a: { reviewerId: string | null; employee: { userId: string | null; branchId: string | null } }) {
  if (a.reviewerId === user.id) return true;
  if (a.employee.userId === user.id) return false;
  return can(user, "hr.performance", "edit") && (await scopeMatcher(user, "hr.performance", "edit"))({ ownerId: a.employee.userId, branchId: a.employee.branchId });
}

const rating = (fd: FormData, key: string) => {
  const n = Number(str(fd, key));
  return n >= 1 && n <= 5 ? n : null;
};

const refresh = (cycleId: string) => {
  revalidatePath("/hr/performance");
  revalidatePath(`/hr/performance/${cycleId}`);
  revalidatePath("/me/performance");
};

/** Opens a review cycle with one appraisal per current employee in scope; each goes to their line manager. */
export async function createCycle(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.performance", "create");
  const name = str(fd, "name");
  const from = new Date(str(fd, "from"));
  const to = new Date(str(fd, "to"));
  if (name.length < 2) return { error: "Give the cycle a name, e.g. “2026 H2 review”." };
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return { error: "Choose the period being reviewed." };

  const scope = (await scopeWhere(user, "hr.performance", "create", FIELDS)) as Prisma.EmployeeWhereInput;
  const employees = await db.employee.findMany({
    where: { AND: [scope, { status: { in: ["active", "probation", "notice"] } }, str(fd, "departmentId") ? { departmentId: str(fd, "departmentId") } : {}] },
    include: { manager: { select: { userId: true } } },
  });
  if (!employees.length) return { error: "No current employees match." };

  const cycle = await db.appraisalCycle.create({ data: { name, from, to } });
  const goals = str(fd, "goals") || null;
  await db.appraisal.createMany({ data: employees.map((e) => ({ cycleId: cycle.id, employeeId: e.id, reviewerId: e.manager?.userId ?? null, goals })) });
  for (const e of employees) await notify(e.userId, `Self review open: ${name}`, { body: "Rate your performance for the period and add comments.", link: "/me/performance", email: true });
  await audit(user.id, "create", "appraisalCycle", cycle.id, `Opened review cycle ${name} for ${employees.length} employee(s)`);
  refresh(cycle.id);
  redirect(`/hr/performance/${cycle.id}`);
}

export async function setCycleStatus(fd: FormData) {
  const user = await requirePermission("hr.performance", "edit");
  const id = str(fd, "id");
  const status = str(fd, "status") === "closed" ? "closed" : "open";
  await db.appraisalCycle.update({ where: { id }, data: { status } });
  await audit(user.id, "update", "appraisalCycle", id, `${status === "closed" ? "Closed" : "Reopened"} review cycle`);
  refresh(id);
}

export async function deleteCycle(fd: FormData) {
  const user = await requirePermission("hr.performance", "delete");
  const cycle = await db.appraisalCycle.findUnique({ where: { id: str(fd, "id") } });
  if (!cycle) return;
  await db.appraisalCycle.delete({ where: { id: cycle.id } });
  await audit(user.id, "delete", "appraisalCycle", cycle.id, `Deleted review cycle ${cycle.name}`);
  revalidatePath("/hr/performance");
  redirect("/hr/performance");
}

export async function submitSelfReview(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const a = await db.appraisal.findUnique({ where: { id: str(fd, "id") }, include: { employee: true, cycle: true } });
  if (!a || a.employee.userId !== user.id) return { error: "Review not found." };
  if (a.status !== "self" || a.cycle.status !== "open") return { error: "This self review is already submitted or the cycle is closed." };
  const selfRating = rating(fd, "selfRating");
  if (!selfRating) return { error: "Pick a rating." };
  await db.appraisal.update({ where: { id: a.id }, data: { selfRating, selfComments: str(fd, "selfComments") || null, status: "manager", submittedAt: new Date() } });
  await notify(a.reviewerId, `Review ${a.employee.fullName}: ${a.cycle.name}`, { body: "Self review submitted — your rating is next.", link: `/me/performance?r=${a.id}`, email: true });
  refresh(a.cycleId);
  return { ok: true, message: "Submitted. Your manager will review it next." };
}

export async function submitManagerReview(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const a = await db.appraisal.findUnique({ where: { id: str(fd, "id") }, include: { employee: true, cycle: true } });
  if (!a || !(await canReview(user, a))) return { error: "Review not found." };
  if (a.status === "done" || a.cycle.status !== "open") return { error: "This review is already completed or the cycle is closed." };
  if (fd.get("intent") === "goals") {
    await db.appraisal.update({ where: { id: a.id }, data: { goals: str(fd, "goals") || null } });
    refresh(a.cycleId);
    return { ok: true, message: "Goals saved." };
  }
  const managerRating = rating(fd, "managerRating");
  if (!managerRating) return { error: "Pick a rating." };
  await db.appraisal.update({
    where: { id: a.id },
    data: { managerRating, managerComments: str(fd, "managerComments") || null, recommendation: str(fd, "recommendation") || null, status: "done", completedAt: new Date(), reviewerId: a.reviewerId ?? user.id },
  });
  await audit(user.id, "update", "appraisal", a.id, `Completed review of ${a.employee.fullName} (${a.cycle.name}): ${managerRating}/5`);
  await notify(a.employee.userId, `Your review is complete: ${a.cycle.name}`, { link: "/me/performance" });
  refresh(a.cycleId);
  return { ok: true, message: "Review completed." };
}

/** HR can send a completed or stuck review back a step. */
export async function reopenAppraisal(fd: FormData) {
  const user = await requirePermission("hr.performance", "edit");
  const a = await db.appraisal.findUnique({ where: { id: str(fd, "id") }, include: { employee: true } });
  if (!a || !(await canReview(user, a))) return;
  const status = str(fd, "to") === "self" ? "self" : "manager";
  await db.appraisal.update({ where: { id: a.id }, data: { status, completedAt: null, ...(status === "self" && { submittedAt: null }) } });
  await audit(user.id, "update", "appraisal", a.id, `Sent ${a.employee.fullName}'s review back to ${status} stage`);
  refresh(a.cycleId);
}
