import Link from "next/link";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Org chart" };

type P = { id: string; fullName: string; photo: string | null; managerId: string | null; designation: { name: string } | null; department: { name: string } | null };

/** Org chart: who reports to whom across the company, with photos. Everyone with the Org chart permission sees it. */
export default async function OrgChartPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const user = await requirePermission("hr.orgchart");
  const sp = await searchParams;
  const [all, depts] = await Promise.all([
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, photo: true, managerId: true, departmentId: true, designation: { select: { name: true } }, department: { select: { name: true } } }, orderBy: { fullName: "asc" } }),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const people = sp.dept ? all.filter((e) => e.departmentId === sp.dept) : all;
  const ids = new Set(people.map((e) => e.id));
  const roots = people.filter((e) => !e.managerId || !ids.has(e.managerId));
  const kids = (id: string) => people.filter((x) => x.managerId === id);
  const linkable = can(user, "hr.employees");

  const Box = ({ e }: { e: P }) => {
    const inner = (
      <>
        <PersonAvatar name={e.fullName} photo={e.photo} className="mx-auto size-14 text-base" />
        <span className="mt-2 block truncate text-sm font-semibold">{e.fullName}</span>
        <span className="block truncate text-xs text-muted">{e.designation?.name ?? "—"}</span>
        {e.department && <span className="mt-1 inline-block rounded-full bg-canvas px-2 py-0.5 text-[10px] text-muted">{e.department.name}</span>}
      </>
    );
    const cls = "block w-40 rounded-xl border border-line bg-surface px-3 py-3 text-center shadow-sm";
    return linkable ? <Link href={`/hr/employees/${e.id}`} className={`${cls} hover:border-navy-900/30`}>{inner}</Link> : <div className={cls}>{inner}</div>;
  };
  const Node = ({ e, depth }: { e: P; depth: number }): React.ReactNode => {
    const k = depth < 10 ? kids(e.id) : [];
    return (
      <li className="flex flex-col items-center">
        <Box e={e} />
        {k.length > 0 && (
          <>
            <span className="h-4 w-px bg-line" />
            <ul className="flex gap-4 border-t border-line pt-4">{k.map((c) => <Node key={c.id} e={c} depth={depth + 1} />)}</ul>
          </>
        )}
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Org chart" description="Who reports to whom. Managers come from each employee's Line manager field." />
      <AutoFilterForm className="mb-4">
        <select name="dept" defaultValue={sp.dept ?? ""} className="input w-56"><option value="">Whole company</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      </AutoFilterForm>
      {people.length === 0 ? <Card><EmptyState title="No one to show" /></Card> : (
        <Card className="overflow-x-auto p-6">
          <ul className="flex w-max min-w-full justify-center gap-8">{roots.map((r) => <Node key={r.id} e={r} depth={0} />)}</ul>
        </Card>
      )}
    </>
  );
}
