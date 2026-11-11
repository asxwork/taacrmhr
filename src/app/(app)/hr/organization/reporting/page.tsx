import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ManagerSelect } from "./manager-select";

export const metadata = { title: "Reporting lines" };

/** People → Reporting lines: everyone's line manager on one screen, changed in place. */
export default async function ReportingLinesPage({ searchParams }: { searchParams: Promise<{ dept?: string; missing?: string }> }) {
  const user = await requirePermission("hr.employees");
  const sp = await searchParams;
  const scope = (await employeeWhere(user)) as Prisma.EmployeeWhereInput;
  const [people, everyone, depts] = await Promise.all([
    db.employee.findMany({
      where: { ...scope, status: { not: "left" }, ...(sp.dept ? { departmentId: sp.dept } : {}), ...(sp.missing ? { managerId: null } : {}) },
      select: { id: true, fullName: true, photo: true, code: true, managerId: true, designation: { select: { name: true } }, department: { select: { name: true } }, branch: { select: { name: true } } },
      orderBy: [{ department: { name: "asc" } }, { fullName: "asc" }],
    }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, designation: { select: { name: true } } }, orderBy: { fullName: "asc" } }),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const canEdit = can(user, "hr.employees", "edit");
  const options = everyone.map((e) => ({ id: e.id, name: e.designation ? `${e.fullName} · ${e.designation.name}` : e.fullName }));
  const missing = await db.employee.count({ where: { ...scope, status: { not: "left" }, managerId: null } });

  return (
    <>
      <PageHeader title="Reporting lines" description="Who each person reports to. This drives Team access, leave and shift-swap approvals, monthly check-ins and the org chart. Changes save at once." />
      <AutoFilterForm className="mb-4 flex flex-wrap items-center gap-2">
        <select name="dept" defaultValue={sp.dept ?? ""} className="input w-56"><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm"><input type="checkbox" name="missing" value="1" defaultChecked={!!sp.missing} /> Only people without a line manager</label>
        <span className={`ml-auto rounded-full px-3 py-1 text-xs ${missing ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{missing ? `${missing} without a line manager` : "Everyone has a line manager"}</span>
      </AutoFilterForm>
      <Card className="overflow-hidden">
        {people.length === 0 ? <EmptyState title="No one to show" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas/60"><tr>{["Employee", "Department · Branch", "Reports to"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => (
                  <tr key={p.id} className="hover:bg-canvas/40">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-3">
                        <PersonAvatar name={p.fullName} photo={p.photo} className="size-8" />
                        <span className="min-w-0"><span className="block font-medium">{p.fullName}</span><span className="block text-xs text-muted">{[p.code, p.designation?.name].filter(Boolean).join(" · ")}</span></span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{[p.department?.name, p.branch?.name].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-4 py-2.5"><ManagerSelect employeeId={p.id} value={p.managerId ?? ""} options={options} disabled={!canEdit} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
