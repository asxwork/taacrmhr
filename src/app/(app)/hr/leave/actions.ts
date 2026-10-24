"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, scopeMatcher } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { cancelRequest } from "@/lib/approvals";
import { applyForLeave } from "@/lib/leave";
import { str, type FormState } from "@/lib/utils";

/** Self-service: apply for my own leave. */
export async function applyMyLeave(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id } });
  if (!emp) return { error: "Your login isn't linked to an employee record." };
  const from = new Date(str(fd, "from"));
  const to = new Date(str(fd, "to") || str(fd, "from"));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { error: "Choose the dates." };
  const res = await applyForLeave({ employeeId: emp.id, typeId: str(fd, "typeId"), from, to, halfDay: fd.get("halfDay") === "on", reason: str(fd, "reason") || null, requesterId: user.id });
  if ("error" in res) return { error: res.error };
  revalidatePath("/me/leave");
  return { ok: true, message: `Requested ${res.days} day(s) — waiting for approval.` };
}

/** Withdraw my pending request (goes through the approval engine so everyone is updated). */
export async function withdrawLeave(fd: FormData) {
  const user = await requireUser();
  const req = await db.leaveRequest.findUnique({ where: { id: str(fd, "id") }, include: { employee: true } });
  if (!req?.approvalId || req.employee.userId !== user.id || req.status !== "pending") return;
  await cancelRequest(user, req.approvalId);
  revalidatePath("/me/leave");
}

async function canManage(employee: { userId: string | null; branchId: string | null }) {
  const user = await requireUser();
  if (!can(user, "hr.leave", "edit")) return null;
  return (await scopeMatcher(user, "hr.leave", "edit"))({ ownerId: employee.userId, branchId: employee.branchId }) ? user : null;
}

/** HR cancels already-approved leave (e.g. employee came back early). */
export async function cancelApprovedLeave(fd: FormData) {
  const req = await db.leaveRequest.findUnique({ where: { id: str(fd, "id") }, include: { employee: true, type: true } });
  if (!req || req.status !== "approved") return;
  const user = await canManage(req.employee);
  if (!user) return;
  await db.leaveRequest.update({ where: { id: req.id }, data: { status: "cancelled", decidedAt: new Date() } });
  await audit(user.id, "update", "leaveRequest", req.id, `Cancelled approved ${req.type.name} for ${req.employee.fullName}`);
  await notify(req.employee.userId, `Your ${req.type.name} was cancelled by HR`, { link: "/me/leave", email: true });
  revalidatePath("/hr/leave");
}

/** Manual balance adjustment (+/- days) for a year, with a reason. */
export async function adjustBalance(_: FormState, fd: FormData): Promise<FormState> {
  const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") } });
  if (!emp) return { error: "Employee not found." };
  const user = await canManage(emp);
  if (!user) return { error: "You can't adjust this employee's leave." };
  const typeId = str(fd, "typeId");
  const year = Number(str(fd, "year")) || new Date().getFullYear();
  const delta = parseFloat(str(fd, "delta"));
  const note = str(fd, "note");
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 365 || (delta * 2) % 1 !== 0) return { error: "Enter days in steps of 0.5, e.g. 2 or -1.5." };
  if (!note) return { error: "Add a reason for the adjustment." };
  await db.leaveBalance.upsert({
    where: { employeeId_typeId_year: { employeeId: emp.id, typeId, year } },
    update: { adjusted: { increment: delta }, note },
    create: { employeeId: emp.id, typeId, year, adjusted: delta, note },
  });
  await audit(user.id, "update", "leaveBalance", emp.id, `${delta > 0 ? "+" : ""}${delta} day(s) for ${emp.fullName}: ${note}`);
  revalidatePath("/hr/leave");
  return { ok: true, message: "Balance adjusted." };
}
