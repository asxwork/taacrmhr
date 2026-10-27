"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, scopeFor } from "@/lib/permissions";
import { employeeAllows } from "@/lib/hr";
import { REVISION_KINDS, proposeRevisions, requestEncashment } from "@/lib/compensation";
import { str, type FormState } from "@/lib/utils";

const payrollAdmin = (user: SessionUser) => user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";
const day = (v: string) => {
  const d = v ? new Date(`${v}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Single revision (new amount or %) or bulk % increment for a department / branch / everyone; one approval each time. */
export async function proposeRevision(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!payrollAdmin(user)) return { error: "Only payroll admins can propose salary revisions." };
  const kind = REVISION_KINDS.some((k) => k.value === str(fd, "kind")) ? str(fd, "kind") : "increment";
  const effectiveFrom = day(str(fd, "effectiveFrom"));
  if (!effectiveFrom) return { error: "Choose the effective date." };
  const reason = str(fd, "reason").slice(0, 1000) || null;
  const pct = parseFloat(str(fd, "pct"));
  const amount = parseFloat(str(fd, "newGross").replace(/,/g, ""));

  let rows: { employeeId: string; newGross: number }[];
  if (str(fd, "mode") === "bulk") {
    if (!Number.isFinite(pct) || pct === 0 || Math.abs(pct) > 100) return { error: "Enter the increment % (for example 10)." };
    const where = {
      status: { not: "left" }, salary: { isNot: null },
      ...(str(fd, "departmentId") && { departmentId: str(fd, "departmentId") }),
      ...(str(fd, "branchId") && { branchId: str(fd, "branchId") }),
    };
    const emps = await db.employee.findMany({ where, include: { salary: true } });
    rows = emps.map((e) => ({ employeeId: e.id, newGross: Math.round((e.salary!.gross * (100 + pct)) / 100) }));
  } else {
    const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") }, include: { salary: true } });
    if (!emp) return { error: "Choose the employee." };
    if (!emp.salary) return { error: `${emp.fullName} has no salary yet; set it on their profile first.` };
    const newGross = Number.isFinite(amount) && amount > 0 ? amount : Number.isFinite(pct) ? (emp.salary.gross * (100 + pct)) / 100 : NaN;
    if (!(newGross > 0)) return { error: "Enter the new gross salary or an increment %." };
    rows = [{ employeeId: emp.id, newGross }];
  }
  if (!rows.length) return { error: "Nobody with a salary matches." };
  const res = await proposeRevisions(rows, { kind, effectiveFrom, reason, requesterId: user.id });
  if ("error" in res) return { error: res.error };
  revalidatePath("/hr/salary-revisions");
  return { ok: true, message: `Sent ${res.count} revision${res.count === 1 ? "" : "s"} for approval.` };
}

/** Encash unused paid leave: employees for themselves, HR for anyone they manage. */
export async function sendEncashment(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const self = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  const employeeId = str(fd, "employeeId") || self?.id;
  if (!employeeId) return { error: "Your login isn't linked to an employee record yet." };
  if (employeeId !== self?.id) {
    const emp = await db.employee.findUnique({ where: { id: employeeId } });
    if (!emp || !can(user, "hr.leave", "edit") || !(await employeeAllows(user, emp, "edit"))) return { error: "You can't request this for that employee." };
  }
  const res = await requestEncashment({ employeeId, typeId: str(fd, "typeId"), days: parseFloat(str(fd, "days")), reason: str(fd, "reason").slice(0, 500) || null, requesterId: user.id });
  if ("error" in res) return { error: res.error };
  revalidatePath("/hr/leave-encashment");
  revalidatePath("/me/leave");
  return { ok: true, message: "Sent for approval. Once approved it is paid with the next payroll." };
}
