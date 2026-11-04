import Link from "next/link";
import { addMonths, eachDayOfInterval, endOfMonth, format, parse, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { CLASH_MIN, CLASH_SHARE } from "@/lib/leave-planner";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Leave planner" };

/** Leave → Planner: a month grid of who is off (approved and pending), with days where a department is short flagged. */
export default async function LeavePlannerPage({ searchParams }: { searchParams: Promise<{ m?: string; dept?: string }> }) {
  const user = await requirePermission("hr.leaveplanner");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? parse(sp.m!, "yyyy-MM", new Date()) : startOfMonth(new Date());
  const from = startOfMonth(month), to = endOfMonth(month);
  const days = eachDayOfInterval({ start: from, end: to });
  const scope = (await scopeWhere(user, "hr.leaveplanner", "view", { owner: "userId", branch: "branchId" })) as Prisma.EmployeeWhereInput;
  const where: Prisma.EmployeeWhereInput = { ...scope, status: { not: "left" }, ...(sp.dept ? { departmentId: sp.dept } : {}) };
  const [people, depts, leaves] = await Promise.all([
    db.employee.findMany({ where, select: { id: true, fullName: true, departmentId: true, department: { select: { name: true } } }, orderBy: [{ department: { name: "asc" } }, { fullName: "asc" }], take: 300 }),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.leaveRequest.findMany({ where: { status: { in: ["approved", "pending"] }, from: { lte: to }, to: { gte: from }, employee: where }, select: { employeeId: true, from: true, to: true, status: true, type: { select: { name: true } } } }),
  ]);
  const key = (d: Date) => format(d, "yyyy-MM-dd");
  const off = new Map<string, { status: string; type: string }>(); // employeeId|day
  for (const l of leaves) for (const d of eachDayOfInterval({ start: l.from > from ? l.from : from, end: l.to < to ? l.to : to })) off.set(`${l.employeeId}|${key(d)}`, { status: l.status, type: l.type.name });
  // Clash: per department per day.
  const deptSize = new Map<string, number>();
  for (const p of people) if (p.departmentId) deptSize.set(p.departmentId, (deptSize.get(p.departmentId) ?? 0) + 1);
  const clash = new Set<string>(); // day
  const clashDept = new Map<string, string[]>();
  for (const d of days) {
    const count = new Map<string, number>();
    for (const p of people) if (p.departmentId && off.has(`${p.id}|${key(d)}`)) count.set(p.departmentId, (count.get(p.departmentId) ?? 0) + 1);
    for (const [dep, n] of count) if (n >= CLASH_MIN && n / (deptSize.get(dep) ?? 1) >= CLASH_SHARE) {
      clash.add(key(d));
      clashDept.set(key(d), [...(clashDept.get(key(d)) ?? []), `${people.find((p) => p.departmentId === dep)?.department?.name}: ${n} off`]);
    }
  }
  const nav = (m: Date) => `/hr/leave/planner?m=${format(m, "yyyy-MM")}${sp.dept ? `&dept=${sp.dept}` : ""}`;

  return (
    <>
      <PageHeader title="Leave planner" description={`Who is off in ${format(month, "MMMM yyyy")}. Solid = approved, striped = waiting for approval. Red days: ${CLASH_MIN}+ people and ${Math.round(CLASH_SHARE * 100)}%+ of a department off.`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={nav(addMonths(month, -1))} className="rounded-lg border border-line p-2 hover:bg-canvas" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
        <span className="min-w-32 text-center font-medium">{format(month, "MMMM yyyy")}</span>
        <Link href={nav(addMonths(month, 1))} className="rounded-lg border border-line p-2 hover:bg-canvas" aria-label="Next month"><ChevronRight className="size-4" /></Link>
        <AutoFilterForm className="ml-auto">
          <input type="hidden" name="m" value={format(month, "yyyy-MM")} />
          <select name="dept" defaultValue={sp.dept ?? ""} className="input w-52"><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </AutoFilterForm>
      </div>
      {clash.size > 0 && (
        <Card className="mb-4 border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Short-staffed days</p>
          <ul className="mt-1 space-y-0.5">{[...clashDept].map(([d, list]) => <li key={d}>{format(new Date(`${d}T00:00:00`), "EEE d MMM")}: {list.join(", ")}</li>)}</ul>
        </Card>
      )}
      <Card className="overflow-hidden">
        {people.length === 0 ? <EmptyState title="No one to show" /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-canvas/60">
                  <th className="sticky left-0 z-10 min-w-44 bg-surface px-3 py-2 text-left font-medium">Employee</th>
                  {days.map((d) => (
                    <th key={key(d)} className={cn("w-7 min-w-7 px-0 py-2 text-center font-medium", d.getDay() === 0 && "text-muted", clash.has(key(d)) && "bg-red-100 text-red-700")}>
                      <span className="block text-[10px] uppercase">{format(d, "EEEEE")}</span>{format(d, "d")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="sticky left-0 z-10 bg-surface px-3 py-1.5"><span className="block truncate font-medium">{p.fullName}</span><span className="block truncate text-[10px] text-muted">{p.department?.name ?? "—"}</span></td>
                    {days.map((d) => {
                      const o = off.get(`${p.id}|${key(d)}`);
                      return (
                        <td key={key(d)} className={cn("p-0.5", d.getDay() === 0 && "bg-canvas/50")}>
                          {o && <span title={`${o.type} · ${o.status}`} className={cn("block h-5 rounded", o.status === "approved" ? "bg-violet-500" : "bg-[repeating-linear-gradient(45deg,#c4b5fd_0_4px,#ede9fe_4px_8px)]")} />}
                        </td>
                      );
                    })}
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
