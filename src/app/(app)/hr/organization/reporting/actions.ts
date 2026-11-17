"use server";

import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { employeeAllows } from "@/lib/hr";
import { applyAssignment } from "@/lib/hr-assign";
import { forget } from "@/lib/memo";

/** Sets one employee's line manager from the Reporting lines page; refuses loops (A → B → A). */
export async function setLineManager(employeeId: string, managerId: string | null): Promise<{ error?: string }> {
  const user = await requirePermission("hr.employees", "edit");
  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { designation: true, department: true, branch: true, manager: true } });
  if (!emp || !(await employeeAllows(user, emp, "edit"))) return { error: "You can't edit this employee." };
  if (managerId) {
    // Walk up from the new manager: if we reach this employee, it would be a loop.
    let cur: string | null = managerId;
    for (let i = 0; cur && i < 50; i++) {
      if (cur === employeeId) return { error: `${emp.fullName} can't report to someone who reports to them.` };
      cur = (await db.employee.findUnique({ where: { id: cur }, select: { managerId: true } }))?.managerId ?? null;
    }
  }
  try {
    await applyAssignment(emp, { designationId: emp.designationId, departmentId: emp.departmentId, branchId: emp.branchId, managerId }, { byId: user.id });
  } catch (e) {
    return { error: (e as Error).message };
  }
  forget("session:"); // team access follows the new reporting line straight away
  return {};
}

/** Head of a department (the same field as HR Settings → Departments). */
export async function setDepartmentHead(departmentId: string, employeeId: string | null): Promise<{ error?: string }> {
  await requirePermission("hr.employees", "edit");
  const d = await db.department.findUnique({ where: { id: departmentId } });
  if (!d) return { error: "Department not found." };
  await db.department.update({ where: { id: d.id }, data: { headId: employeeId } });
  return {};
}

/**
 * Everyone in a department reports to its head (or only those with no line manager yet). The head is skipped, and
 * anyone it would put in a loop is left as they are.
 */
export async function membersToHead(departmentId: string, onlyUnassigned: boolean): Promise<{ error?: string; message?: string }> {
  await requirePermission("hr.employees", "edit");
  const d = await db.department.findUnique({ where: { id: departmentId } });
  if (!d?.headId) return { error: "Choose the head of this department first." };
  const members = await db.employee.findMany({ where: { departmentId, status: { not: "left" }, id: { not: d.headId }, ...(onlyUnassigned ? { managerId: null } : { NOT: { managerId: d.headId } }) }, select: { id: true } });
  let done = 0; const skipped: string[] = [];
  for (const m of members) {
    const r = await setLineManager(m.id, d.headId);
    if (r.error) skipped.push(r.error); else done++;
  }
  return { message: `${done} ${done === 1 ? "person now reports" : "people now report"} to the head.${skipped.length ? ` ${skipped.length} skipped (${skipped[0]})` : ""}` };
}
