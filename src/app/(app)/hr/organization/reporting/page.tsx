import type { Prisma } from "@prisma/client";
import { Crown } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ManagerSelect } from "./manager-select";
import { HeadSelect, ToHeadButtons } from "./dept-controls";
import { managerEmployees } from "@/lib/managers";

export const metadata = { title: "Reporting lines" };

/**
 * People → Reporting lines, by department: each department's head on top (who the head reports to), one click to
 * make everyone in it report to the head, and the members below with their own line manager for exceptions.
 */
export default async function ReportingLinesPage({ searchParams }: { searchParams: Promise<{ dept?: string; missing?: string }> }) {
  const user = await requirePermission("hr.employees");
  const sp = await searchParams;
  const scope = (await employeeWhere(user)) as Prisma.EmployeeWhereInput;
  const [people, managers, depts] = await Promise.all([
    db.employee.findMany({
      where: { ...scope, status: { not: "left" }, ...(sp.dept ? { departmentId: sp.dept } : {}) },
      select: { id: true, fullName: true, photo: true, code: true, managerId: true, departmentId: true, designation: { select: { name: true } }, branch: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    managerEmployees(),
    db.department.findMany({ where: { active: true }, select: { id: true, name: true, headId: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const canEdit = can(user, "hr.employees", "edit");
  const label = (p: { fullName: string; designation?: { name: string } | null }) => (p.designation ? `${p.fullName} · ${p.designation.name}` : p.fullName);
  // Line-manager choices: people with manager access, every department head, and anyone already a manager.
  const pool = new Map(managers.map((m) => [m.id, label(m)]));
  const allEmps = await db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, departmentId: true, managerId: true, designation: { select: { name: true } } }, orderBy: { fullName: "asc" } });
  const byId = new Map(allEmps.map((e) => [e.id, e]));
  for (const id of [...depts.map((d) => d.headId), ...people.map((p) => p.managerId)]) if (id && !pool.has(id) && byId.get(id)) pool.set(id, label(byId.get(id)!));
  const options = [...pool].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const missing = people.filter((p) => !p.managerId).length;

  const groups = [...depts.map((d) => ({ id: d.id, name: d.name, headId: d.headId })), { id: "", name: "No department", headId: null as string | null }]
    .map((g) => ({ ...g, members: people.filter((p) => (p.departmentId ?? "") === g.id) }))
    .filter((g) => g.members.length || (g.id && !sp.dept))
    .filter((g) => !sp.missing || g.members.some((m) => !m.managerId));

  return (
    <>
      <PageHeader title="Reporting lines" description="Each department reports to its head. Set the head once and send everyone to them in one click; change a person below only when they report to someone else. Changes save at once." />
      <AutoFilterForm className="mb-4 flex flex-wrap items-center gap-2">
        <select name="dept" defaultValue={sp.dept ?? ""} className="input w-56" aria-label="Department"><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm"><input type="checkbox" name="missing" value="1" defaultChecked={!!sp.missing} /> Only departments with people missing a line manager</label>
        <span className={cn("ml-auto rounded-full px-3 py-1 text-xs", missing ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>{missing ? `${missing} without a line manager` : "Everyone has a line manager"}</span>
      </AutoFilterForm>

      {groups.length === 0 ? <Card><EmptyState title="No one to show" /></Card> : (
        <div className="space-y-4">
          {groups.map((g) => {
            const head = g.headId ? byId.get(g.headId) : null;
            const others = g.members.filter((m) => m.id !== g.headId);
            const off = others.filter((m) => m.managerId !== g.headId);
            const unassigned = others.filter((m) => !m.managerId).length;
            const headOptions = allEmps.map((e) => ({ id: e.id, name: label(e), inDept: e.departmentId === g.id }));
            return (
              <Card key={g.id || "none"} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line bg-canvas/50 px-4 py-3">
                  <div className="min-w-40">
                    <p className="font-semibold">{g.name}</p>
                    <p className="text-xs text-muted">{g.members.length} {g.members.length === 1 ? "person" : "people"}{off.length && head ? ` · ${off.length} not reporting to the head` : ""}</p>
                  </div>
                  {g.id ? (
                    <>
                      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted sm:max-w-sm">
                        <span className="flex items-center gap-1"><Crown className="size-3.5 text-gold-600" /> Head of department</span>
                        <HeadSelect departmentId={g.id} value={g.headId ?? ""} options={headOptions} disabled={!canEdit} />
                      </label>
                      {head && (
                        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted sm:max-w-xs">
                          Head reports to
                          <ManagerSelect employeeId={head.id} value={head.managerId ?? ""} options={options} disabled={!canEdit} />
                        </label>
                      )}
                      {canEdit && <div className="ml-auto self-end"><ToHeadButtons departmentId={g.id} hasHead={!!head} offCount={off.length} unassigned={unassigned} /></div>}
                    </>
                  ) : <p className="text-xs text-muted">Give these people a department (Employee → Job & Pay) to group them under a head.</p>}
                </div>
                {others.length === 0 ? <p className="px-4 py-4 text-sm text-muted">{g.members.length ? "Only the head is in this department." : "Nobody in this department yet."}</p> : (
                  <ul className="divide-y divide-line">
                    {others.map((p) => {
                      const toHead = !!head && p.managerId === head.id;
                      return (
                        <li key={p.id} className="grid grid-cols-1 items-center gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
                          <span className="flex min-w-0 items-center gap-3">
                            <PersonAvatar name={p.fullName} photo={p.photo} className="size-8" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{p.fullName}</span>
                              <span className="block truncate text-xs text-muted">{[p.code, p.designation?.name, p.branch?.name].filter(Boolean).join(" · ")}</span>
                            </span>
                            {head && !toHead && <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", p.managerId ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800")}>{p.managerId ? "Exception" : "No manager"}</span>}
                          </span>
                          <ManagerSelect employeeId={p.id} value={p.managerId ?? ""} options={options} disabled={!canEdit} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
