import { db } from "@/lib/db";
import { managerEmployees } from "@/lib/managers";

/** Options for org pickers (active only). */
/** `keep`: manager ids already in use (e.g. the employee's current manager), always offered. */
export async function orgOptions(keep: (string | null | undefined)[] = []) {
  const [departments, designations, branches, employees, shifts] = await Promise.all([
    db.department.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.designation.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    managerEmployees(keep),
    db.shift.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { departments, designations, branches, shifts, managers: employees.map((e) => ({ id: e.id, name: e.fullName })) };
}
