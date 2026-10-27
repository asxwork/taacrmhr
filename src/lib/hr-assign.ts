// Designation / department / branch / line-manager changes, wherever they are made (Role / transfer drawer, the
// Employment Info form, approved promotion and transfer requests): saves them and records one history event.
import { db } from "./db";
import { addEvent, syncUserFromEmployee } from "./hr";
import { audit } from "./audit";

export type Assignment = { designationId: string | null; departmentId: string | null; branchId: string | null; managerId: string | null };
type EmpWithOrg = Assignment & {
  id: string; fullName: string;
  designation?: { name: string } | null; department?: { name: string } | null; branch?: { name: string } | null; manager?: { fullName: string } | null;
};

/** Returns the changed keys (empty when nothing changed). Throws on a self-reporting manager. */
export async function applyAssignment(emp: EmpWithOrg, next: Assignment, opts: { byId: string; effective?: Date | null; notes?: string | null }) {
  if (next.managerId === emp.id) throw new Error("Someone can't report to themselves.");
  const changed = (Object.keys(next) as (keyof Assignment)[]).filter((k) => next[k] !== emp[k]);
  if (!changed.length) return changed;

  const [desig, dept, branch, manager] = await Promise.all([
    next.designationId ? db.designation.findUnique({ where: { id: next.designationId } }) : null,
    next.departmentId ? db.department.findUnique({ where: { id: next.departmentId } }) : null,
    next.branchId ? db.branch.findUnique({ where: { id: next.branchId } }) : null,
    next.managerId ? db.employee.findUnique({ where: { id: next.managerId } }) : null,
  ]);
  const lines = [
    changed.includes("designationId") && `Designation: ${emp.designation?.name ?? "—"} → ${desig?.name ?? "—"}`,
    changed.includes("departmentId") && `Department: ${emp.department?.name ?? "—"} → ${dept?.name ?? "—"}`,
    changed.includes("branchId") && `Branch: ${emp.branch?.name ?? "—"} → ${branch?.name ?? "—"}`,
    changed.includes("managerId") && `Reports to: ${emp.manager?.fullName ?? "—"} → ${manager?.fullName ?? "—"}`,
  ].filter(Boolean) as string[];
  const type = changed.includes("designationId") ? "promoted" : "transferred";
  const title = type === "promoted" ? `Now ${desig?.name ?? "—"}` : changed.includes("branchId") ? `Transferred to ${branch?.name ?? "—"}` : "Assignment changed";

  await db.employee.update({ where: { id: emp.id }, data: next });
  await addEvent(emp.id, type, title, { date: opts.effective ?? new Date(), details: [lines.join("\n"), opts.notes].filter(Boolean).join("\n\n"), byId: opts.byId });
  await syncUserFromEmployee(emp.id);
  await audit(opts.byId, "update", "employee", emp.id, `${emp.fullName}: ${lines.join("; ")}`);
  return changed;
}
