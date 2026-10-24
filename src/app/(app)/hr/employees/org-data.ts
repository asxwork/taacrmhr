import { db } from "@/lib/db";

/** Options for org pickers (active only). */
export async function orgOptions() {
  const [departments, designations, branches, employees, shifts] = await Promise.all([
    db.department.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.designation.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.shift.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { departments, designations, branches, shifts, managers: employees.map((e) => ({ id: e.id, name: e.fullName })) };
}
