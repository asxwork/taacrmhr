import Link from "next/link";
import { Building2, Layers, Users } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { Card, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Organization" };

/** Branches, departments and designations with headcount (people in the user's HR scope, excluding leavers). */
export default async function OrganizationPage() {
  const user = await requirePermission("hr.employees");
  const scope = (await employeeWhere(user))!;
  const active = { ...scope, status: { not: "left" } };
  const [branches, departments, designations, byBranch, byDept, byDesig, total] = await Promise.all([
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.department.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.designation.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.employee.groupBy({ by: ["branchId"], where: active, _count: true }),
    db.employee.groupBy({ by: ["departmentId"], where: active, _count: true }),
    db.employee.groupBy({ by: ["designationId"], where: active, _count: true }),
    db.employee.count({ where: active }),
  ]);
  const heads = new Map((await db.employee.findMany({ where: { id: { in: departments.map((d) => d.headId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } })).map((e) => [e.id, e.fullName]));
  const count = (rows: { _count: number }[], match: (r: never) => boolean) => (rows as never[]).filter(match).reduce((s, r: { _count: number }) => s + r._count, 0);
  const canManage = can(user, "hr.employees", "edit");

  const section = (title: string, icon: React.ReactNode, manageHref: string, rows: { id: string | null; name: string; sub?: string | null; n: number; href: string }[]) => (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="flex-1 font-medium">{title}</h2>
        {canManage && <Link href={manageHref} className="text-xs text-muted hover:text-ink hover:underline">Manage</Link>}
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id ?? "none"}>
            <Link href={r.href} className="flex items-center gap-3 py-2.5 text-sm hover:bg-canvas/60">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.name}</span>
                {r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}
              </span>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs tabular-nums">{r.n}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );

  return (
    <>
      <PageHeader title="Organization" description={`${total} active people across ${branches.length} branch(es), ${departments.length} departments and ${designations.length} designations.`}
        actions={<LinkButton href="/hr/employees?tab=org" variant="secondary">Hierarchy chart</LinkButton>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {section("Branches", <Building2 className="size-4 text-muted" />, "/settings/company", [
          ...branches.map((b) => ({ id: b.id, name: b.name, n: count(byBranch, (r: { branchId: string | null }) => r.branchId === b.id), href: `/hr/employees?branch=${b.id}` })),
        ])}
        {section("Departments", <Layers className="size-4 text-muted" />, "/settings/hr#departments", [
          ...departments.map((d) => ({ id: d.id, name: d.name, sub: d.headId ? `Head: ${heads.get(d.headId) ?? "—"}` : null, n: count(byDept, (r: { departmentId: string | null }) => r.departmentId === d.id), href: `/hr/employees?dept=${d.id}` })),
          { id: null, name: "No department", n: count(byDept, (r: { departmentId: string | null }) => r.departmentId === null), href: "/hr/employees" },
        ].filter((r) => r.id || r.n))}
        {section("Designations", <Users className="size-4 text-muted" />, "/settings/hr#designations", designations.map((d) => ({
          id: d.id, name: d.name, sub: d.grade ? `Grade ${d.grade}` : null, n: count(byDesig, (r: { designationId: string | null }) => r.designationId === d.id), href: `/hr/employees?desig=${d.id}`,
        })))}
      </div>
    </>
  );
}
