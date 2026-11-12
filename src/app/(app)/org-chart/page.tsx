import Link from "@/components/link";
import { Building2, ChevronDown, Layers, MapPin, Phone, Users } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Hierarchy" };

const TABS = [["org", "Organization", Building2], ["people", "Employee", Users], ["dept", "Department", Layers]] as const;
type Emp = { id: string; fullName: string; photo: string | null; code: string; phone: string | null; managerId: string | null; departmentId: string | null; branchId: string | null; designation: { name: string } | null; department: { name: string } | null; branch: { name: string; address: string | null } | null };

/**
 * Hierarchy: the company as three trees — branches (Organization), who reports to whom (Employee) and departments
 * with their heads (Department). Nodes with children fold open/closed; the chart scrolls sideways when it's wide.
 */
export default async function HierarchyPage({ searchParams }: { searchParams: Promise<{ tab?: string; dept?: string; branch?: string }> }) {
  const user = await requirePermission("hr.orgchart");
  const sp = await searchParams;
  const tab = TABS.find(([t]) => t === sp.tab)?.[0] ?? "org";
  const [all, depts, branches, companyName] = await Promise.all([
    db.employee.findMany({
      where: { status: { not: "left" } },
      select: { id: true, fullName: true, photo: true, code: true, phone: true, managerId: true, departmentId: true, branchId: true, designation: { select: { name: true } }, department: { select: { name: true } }, branch: { select: { name: true, address: true } } },
      orderBy: { fullName: "asc" },
    }),
    db.department.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.setting.findUnique({ where: { key: "company.name" } }).then((s) => s?.value ?? "The Advisor Associates"),
  ]);
  const linkable = can(user, "hr.employees");
  const byId = new Map(all.map((e) => [e.id, e]));

  // ── Node building blocks
  const Dot = ({ kids }: { kids: boolean }) => <span className={cn("absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full ring-2 ring-surface", kids ? "bg-gold-400" : "bg-slate-300")} />;
  const Fold = ({ kids, count, card, children }: { kids: boolean; count: number; card: React.ReactNode; children?: React.ReactNode }) =>
    kids ? (
      <details open>
        <summary className="group relative flex flex-col items-center">
          {card}
          <span className="relative z-10 -mt-2.5 flex items-center gap-0.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-muted shadow-sm group-hover:text-ink">
            {count} <ChevronDown className="size-3 transition group-open:rotate-180" />
          </span>
        </summary>
        <ul>{children}</ul>
      </details>
    ) : <>{card}</>;

  const company = (sub: string) => (
    <div className="relative w-64 rounded-2xl bg-navy-950 px-5 py-4 text-center text-white shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/icon.svg" alt="" className="mx-auto size-10 rounded-lg" />
      <p className="mt-2 font-semibold">{companyName}</p>
      <p className="text-xs text-white/60">{sub}</p>
    </div>
  );

  const PersonCard = ({ e, kids }: { e: Emp; kids: boolean }) => {
    const body = (
      <div className="relative w-56 rounded-xl border border-line bg-surface p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <Dot kids={kids} />
        <div className="flex items-center gap-2.5">
          <PersonAvatar name={e.fullName} photo={e.photo} className="size-11 text-sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{e.fullName}</p>
            <p className="truncate text-xs text-muted">{e.designation?.name ?? "—"}</p>
            <span className="mt-0.5 inline-block rounded bg-navy-900/5 px-1.5 text-[10px] font-medium text-navy-900">{e.code}</span>
          </div>
        </div>
        <div className="mt-2 space-y-0.5 border-t border-line pt-2 text-[11px] text-muted">
          {e.phone && <p className="flex items-center gap-1 truncate"><Phone className="size-3 shrink-0" />{e.phone}</p>}
          {e.branch && <p className="flex items-center gap-1 truncate" title={e.branch.address ?? undefined}><MapPin className="size-3 shrink-0" />{e.branch.name}</p>}
          {e.department && <p className="flex items-center gap-1 truncate"><Layers className="size-3 shrink-0" />{e.department.name}</p>}
        </div>
      </div>
    );
    return linkable ? <Link href={`/hr/employees/${e.id}`} onClick={undefined}>{body}</Link> : body;
  };

  const UnitCard = ({ icon, title, code, lines, kids, href }: { icon: React.ReactNode; title: string; code: string; lines: React.ReactNode[]; kids: boolean; href: string }) => (
    <Link href={href} className="relative block w-56 rounded-xl border border-line bg-surface p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Dot kids={kids} />
      <div className="flex items-start gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-canvas text-navy-900">{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <span className="inline-block rounded bg-navy-900/5 px-1.5 text-[10px] font-medium text-navy-900">{code}</span>
        </div>
      </div>
      <div className="mt-2 space-y-0.5 border-t border-line pt-2 text-[11px] text-muted">{lines}</div>
    </Link>
  );

  // ── Trees
  let tree: React.ReactNode;
  let count = 0;
  if (tab === "org") {
    count = branches.length;
    tree = (
      <li>
        <Fold kids={branches.length > 0} count={branches.length} card={company(`${branches.length} branch(es) · ${all.length} people`)}>
          {branches.map((b) => {
            const n = all.filter((e) => e.branchId === b.id).length;
            const ds = new Set(all.filter((e) => e.branchId === b.id && e.departmentId).map((e) => e.departmentId)).size;
            return (
              <li key={b.id}>
                <UnitCard icon={<Building2 className="size-5" />} title={b.name} code={b.code} kids={false} href={`/hr/employees?branch=${b.id}`}
                  lines={[
                    b.address ? <p key="a" className="line-clamp-2"><MapPin className="mr-1 inline size-3" />{b.address}</p> : null,
                    <p key="n"><Users className="mr-1 inline size-3" />{n} people · {ds} department{ds === 1 ? "" : "s"}</p>,
                  ]} />
              </li>
            );
          })}
        </Fold>
      </li>
    );
  } else if (tab === "dept") {
    count = depts.length;
    tree = (
      <li>
        <Fold kids={depts.length > 0} count={depts.length} card={company(`${depts.length} departments`)}>
          {depts.map((d, i) => {
            const n = all.filter((e) => e.departmentId === d.id).length;
            const head = d.headId ? byId.get(d.headId) : null;
            return (
              <li key={d.id}>
                <UnitCard icon={<Layers className="size-5" />} title={d.name} code={d.code || `DEP-${String(i + 1).padStart(3, "0")}`} kids={false} href={`/hr/employees?dept=${d.id}`}
                  lines={[
                    <p key="n"><Users className="mr-1 inline size-3" />{n} {n === 1 ? "person" : "people"}</p>,
                    <p key="h" className="flex items-center gap-1 truncate">{head ? <><PersonAvatar name={head.fullName} photo={head.photo} className="size-4 text-[7px]" />HOD: {head.fullName}</> : <span className="text-amber-700">No head set</span>}</p>,
                  ]} />
              </li>
            );
          })}
        </Fold>
      </li>
    );
  } else {
    const people = all.filter((e) => (!sp.dept || e.departmentId === sp.dept) && (!sp.branch || e.branchId === sp.branch));
    const ids = new Set(people.map((e) => e.id));
    const kidsOf = (id: string) => people.filter((x) => x.managerId === id);
    const roots = people.filter((e) => !e.managerId || !ids.has(e.managerId));
    count = people.length;
    const Node = ({ e, depth }: { e: Emp; depth: number }): React.ReactNode => {
      const k = depth < 12 ? kidsOf(e.id) : [];
      return (
        <li>
          <Fold kids={k.length > 0} count={k.length} card={<PersonCard e={e} kids={k.length > 0} />}>
            {k.map((c) => <Node key={c.id} e={c} depth={depth + 1} />)}
          </Fold>
        </li>
      );
    };
    tree = (
      <li>
        <Fold kids={roots.length > 0} count={roots.length} card={company(`${people.length} people`)}>
          {roots.map((r) => <Node key={r.id} e={r} depth={0} />)}
        </Fold>
      </li>
    );
  }

  return (
    <>
      <PageHeader title="Hierarchy" description="Your company as a tree: branches, who reports to whom, and departments. Click a box to open it; click the number under it to fold." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-black/5 p-1">
          {TABS.map(([t, label, Icon]) => (
            <Link key={t} href={t === "org" ? "/org-chart" : `/org-chart?tab=${t}`} className={cn("flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </div>
        {tab === "people" && (
          <AutoFilterForm className="flex gap-2">
            <input type="hidden" name="tab" value="people" />
            <select name="dept" defaultValue={sp.dept ?? ""} aria-label="Department" className="input w-48"><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            {branches.length > 1 && <select name="branch" defaultValue={sp.branch ?? ""} aria-label="Branch" className="input w-40"><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
          </AutoFilterForm>
        )}
        <div className="ml-auto flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-gold-400" /> Has children</span>
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-slate-300" /> No children</span>
        </div>
      </div>
      {count === 0 && tab === "people" ? <Card><EmptyState title="No one to show" /></Card> : (
        <Card className="overflow-x-auto bg-[radial-gradient(circle,rgba(15,26,42,0.06)_1px,transparent_1px)] [background-size:18px_18px] p-8">
          <div className="org-tree w-max min-w-full"><ul>{tree}</ul></div>
        </Card>
      )}
    </>
  );
}
