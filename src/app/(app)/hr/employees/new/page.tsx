import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { FormPage } from "@/components/ui";
import { EmployeeForm } from "../forms";
import { orgOptions } from "../org-data";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const user = await requirePermission("hr.employees");
  if (!can(user, "hr.employees", "create")) redirect("/hr/employees");
  const [org, freeUsers] = await Promise.all([
    orgOptions(),
    db.user.findMany({ where: { employee: null, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <FormPage title="Add employee" backHref="/hr/employees" backLabel="Employees" wide>
      <EmployeeForm org={org} freeUsers={freeUsers} canCreateLogin={can(user, "settings.users", "create") || scopeFor(user, "hr.employees", "create") === "all"} cancelHref="/hr/employees" />
    </FormPage>
  );
}
