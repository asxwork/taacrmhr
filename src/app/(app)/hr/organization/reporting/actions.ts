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
