import Link from "@/components/link";
import { Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteOrgUnit } from "@/app/(app)/settings/hr/actions";
import { ArrowRight, Award, Building2, Briefcase, Layers, MapPin, Network, Search, Settings2, Users } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Organization" };

const TABS = [
  ["branches", "Branches", Building2],
  ["departments", "Departments", Layers],
  ["designations", "Designations", Briefcase],
  ["grades", "Grades", Award],
] as const;
type Tab = (typeof TABS)[number][0];

type Row = { key: string; code: string; name: string; sub?: string | null; extra?: React.ReactNode; people: { id: string; fullName: string; photo: string | null }[]; href: string; del?: { kind: "department" | "designation"; id: string } };

/** Branches, departments, designations and grades: each with code, headcount share and the people in it. */
export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requirePermission("hr.employees");
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([t]) => t === sp.tab)?.[0] ?? "branches") as Tab;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const scope = (await employeeWhere(user))!;
  const [branches, departments, designations, staff] = await Promise.all([
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.department.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.designation.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { ...scope, status: { not: "left" } }, select: { id: true, fullName: true, photo: true, branchId: true, departmentId: true, designationId: true }, orderBy: { fullName: "asc" } }),
  ]);
  const byId = new Map(staff.map((e) => [e.id, e]));
  const total = staff.length;
  const canManage = can(user, "hr.employees", "edit");
  const canDelete = user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all";
  const pad = (prefix: string, i: number) => `${prefix}-${String(i + 1).padStart(3, "0")}`;

  let rows: Row[] = [];
  let manageHref = "/settings/hr";
  if (tab === "branches") {
    manageHref = "/settings/company";
    rows = branches.map((b) => ({
      key: b.id, code: b.code, name: b.name, sub: b.address,
      extra: b.lat != null ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><MapPin className="size-3" /> Geofence on</span> : <span className="text-xs text-muted">No location</span>,
      people: staff.filter((e) => e.branchId === b.id), href: `/hr/employees?branch=${b.id}`,
    }));
  } else if (tab === "departments") {
    manageHref = "/settings/hr?tab=org";
    rows = departments.map((d, i) => {
      const head = d.headId ? byId.get(d.headId) : null;
      return {
        key: d.id, code: d.code || pad("DEP", i), name: d.name,
        extra: head ? <span className="inline-flex items-center gap-1.5 text-xs"><PersonAvatar name={head.fullName} photo={head.photo} className="size-5 text-[8px]" /> {head.fullName}</span> : <span className="text-xs text-amber-700">No head set</span>,
        people: staff.filter((e) => e.departmentId === d.id), href: `/hr/employees?dept=${d.id}`, del: { kind: "department" as const, id: d.id },
      };
    });
    const none = staff.filter((e) => !e.departmentId);
    if (none.length) rows.push({ key: "none", code: "—", name: "No department", sub: "Assign these people a department", people: none, href: "/hr/employees" });
  } else if (tab === "designations") {
    manageHref = "/settings/hr?tab=org";
    rows = designations.map((d, i) => ({
      key: d.id, code: pad("DSG", i), name: d.name, extra: d.grade ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800">Grade {d.grade}</span> : <span className="text-xs text-muted">No grade</span>,
      people: staff.filter((e) => e.designationId === d.id), href: `/hr/employees?desig=${d.id}`, del: { kind: "designation" as const, id: d.id },
    }));
  } else {
    manageHref = "/settings/hr?tab=org";
    const grades = [...new Set(designations.map((d) => d.grade).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    rows = grades.map((g) => {
      const ds = designations.filter((d) => d.grade === g);
      return { key: g, code: `G-${g}`, name: `Grade ${g}`, sub: ds.map((d) => d.name).join(", "), people: staff.filter((e) => ds.some((d) => d.id === e.designationId)), href: ds.length === 1 ? `/hr/employees?desig=${ds[0]!.id}` : "/hr/employees" };
    });
  }
  const shown = q ? rows.filter((r) => `${r.code} ${r.name} ${r.sub ?? ""}`.toLowerCase().includes(q)) : rows;
  const max = Math.max(1, ...rows.map((r) => r.people.length));
  const counts: Record<Tab, number> = { branches: branches.length, departments: departments.length, designations: designations.length, grades: new Set(designations.map((d) => d.grade).filter(Boolean)).size };

  return (
    <>
      <PageHeader title="Organization" description={`${total} active people across your company structure.`}
        actions={<>
          <LinkButton href="/org-chart" variant="secondary"><Network className="size-4" /> Hierarchy</LinkButton>
          {canManage && <LinkButton href={manageHref}><Settings2 className="size-4" /> Manage {TABS.find(([t]) => t === tab)![1].toLowerCase()}</LinkButton>}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TABS.map(([t, label, Icon]) => (
          <Link key={t} href={t === "branches" ? "/hr/organization" : `/hr/organization?tab=${t}`}
            className={cn("group flex items-center gap-3 rounded-xl border bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-md", tab === t ? "border-navy-900 ring-1 ring-navy-900" : "border-line")}>
            <span className={cn("flex size-10 items-center justify-center rounded-lg", tab === t ? "bg-navy-900 text-white" : "bg-canvas text-muted group-hover:text-ink")}><Icon className="size-5" /></span>
            <span><span className="block text-2xl font-semibold tabular-nums leading-none">{counts[t]}</span><span className="mt-1 block text-xs text-muted">{label}</span></span>
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="font-medium">{TABS.find(([t]) => t === tab)![1]}</h2>
          <span className="rounded-full bg-navy-900/5 px-2 py-0.5 text-xs font-semibold tabular-nums text-navy-900">{shown.length}</span>
          <AutoFilterForm className="ml-auto">
            {tab !== "branches" && <input type="hidden" name="tab" value={tab} />}
            <label className="relative block w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={sp.q} placeholder="Search code or name" aria-label="Search" className="input h-9 pl-9" />
            </label>
          </AutoFilterForm>
        </div>
        {shown.length === 0 ? <EmptyState title={q ? "Nothing matches" : `No ${tab} yet`} description={canManage && !q ? "Add them from Manage above." : undefined} /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-canvas/60">
                <tr>
                  <th className="th w-28">Code</th>
                  <th className="th">Name</th>
                  <th className="th">{tab === "departments" ? "Head" : tab === "branches" ? "Location" : tab === "designations" ? "Grade" : ""}</th>
                  <th className="th w-56">Headcount</th>
                  <th className="th">People</th>
                  <th className="th w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => {
                  const n = r.people.length;
                  return (
                    <tr key={r.key} className="group hover:bg-canvas/60">
                      <td className="td"><span className="rounded-md bg-canvas px-2 py-0.5 font-mono text-xs text-muted">{r.code}</span></td>
                      <td className="td">
                        <Link href={r.href} className="block font-medium hover:underline">{r.name}</Link>
                        {r.sub && <span className="block max-w-xs truncate text-xs text-muted" title={r.sub}>{r.sub}</span>}
                      </td>
                      <td className="td whitespace-nowrap">{r.extra}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-navy-900/70" style={{ width: `${(n / max) * 100}%` }} /></div>
                          <span className="w-16 text-right text-sm tabular-nums"><b>{n}</b> <span className="text-xs text-muted">{total ? Math.round((n / total) * 100) : 0}%</span></span>
                        </div>
                      </td>
                      <td className="td">
                        <div className="flex items-center -space-x-2">
                          {r.people.slice(0, 5).map((p) => (
                            <Link key={p.id} href={`/hr/employees/${p.id}`} title={p.fullName} className="rounded-full ring-2 ring-surface transition hover:z-10 hover:-translate-y-0.5">
                              <PersonAvatar name={p.fullName} photo={p.photo} className="size-7 text-[10px]" />
                            </Link>
                          ))}
                          {n > 5 && <span className="flex size-7 items-center justify-center rounded-full bg-canvas text-[10px] font-medium ring-2 ring-surface">+{n - 5}</span>}
                          {n === 0 && <span className="text-xs text-muted">Nobody yet</span>}
                        </div>
                      </td>
                      <td className="td">
                        <span className="flex items-center justify-end gap-1">
                          {canDelete && r.del && (
                            <ActionForm action={deleteOrgUnit} className="flex max-w-[14rem] flex-col items-end text-right text-xs">
                              <input type="hidden" name="kind" value={r.del.kind} /><input type="hidden" name="id" value={r.del.id} />
                              <ConfirmButton message={`Delete ${r.name}? This can't be undone.`} title={n ? "Move its people first" : "Delete"} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /> Delete</ConfirmButton>
                            </ActionForm>
                          )}
                          <Link href={r.href} aria-label={`People in ${r.name}`} className="p-1.5 text-muted group-hover:text-ink"><ArrowRight className="size-4" /></Link>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Users className="size-3.5" /> Headcount counts current staff in your HR scope (leavers excluded). Click a row to see its people.</p>
    </>
  );
}
