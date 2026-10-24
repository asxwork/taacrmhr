import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { addDays, differenceInCalendarDays } from "date-fns";
import { Download, Plus, Search, Upload } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { importEmployees } from "./import-action";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { EMP_STATUSES, empStatus, employeeWhere } from "@/lib/hr";
import { cn, fmtDate } from "@/lib/utils";
import { Badge, Card, Drawer, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { StatusPill, hrefWith } from "@/components/crm/bits";
import { EmployeeForm } from "./forms";
import { orgOptions } from "./org-data";

export const metadata = { title: "Employees" };

type SP = { tab?: string; q?: string; dept?: string; branch?: string; status?: string; new?: string; import?: string };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.employees");
  const sp = await searchParams;
  const tab = sp.tab === "org" ? "org" : sp.tab === "documents" ? "documents" : "directory";
  const keep = { tab: sp.tab, q: sp.q, dept: sp.dept, branch: sp.branch, status: sp.status };
  const scope = (await employeeWhere(user))!;
  const canCreate = can(user, "hr.employees", "create");
  const closeHref = hrefWith("/hr/employees", keep, {});
  const q = sp.q?.trim();

  const where: Prisma.EmployeeWhereInput = {
    ...scope,
    ...(q && { OR: [{ fullName: { contains: q } }, { code: { contains: q } }, { phone: { contains: q } }, { cnic: { contains: q } }] }),
    ...(sp.dept && { departmentId: sp.dept }),
    ...(sp.branch && { branchId: sp.branch }),
    ...(sp.status ? { status: sp.status } : { status: { not: "left" } }),
  };

  const [org, employees] = await Promise.all([
    orgOptions(),
    db.employee.findMany({ where, include: { department: true, designation: true, branch: true }, orderBy: { fullName: "asc" }, take: 500 }),
  ]);

  const tabs = (
    <div className="mb-4 flex rounded-lg bg-black/5 p-0.5 sm:w-fit">
      {([["directory", "Directory"], ["org", "Org chart"], ["documents", "Expiring documents"]] as const).map(([t, label]) => (
        <Link key={t} href={t === "directory" ? "/hr/employees" : `/hr/employees?tab=${t}`} className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
          {label}
        </Link>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (tab === "org") {
    const all = await db.employee.findMany({ where: { ...scope, status: { not: "left" } }, include: { designation: true }, orderBy: { fullName: "asc" } });
    const ids = new Set(all.map((e) => e.id));
    const roots = all.filter((e) => !e.managerId || !ids.has(e.managerId));
    const Node = ({ id, depth }: { id: string; depth: number }): React.ReactNode => {
      const e = all.find((x) => x.id === id)!;
      const kids = all.filter((x) => x.managerId === id);
      return (
        <li>
          <Link href={`/hr/employees/${e.id}`} className="inline-flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 hover:border-navy-900/20">
            <PersonAvatar name={e.fullName} photo={e.photo} className="size-7 text-[10px]" />
            <span>
              <span className="block text-sm font-medium">{e.fullName}</span>
              <span className="block text-xs text-muted">{e.designation?.name ?? "—"}</span>
            </span>
          </Link>
          {kids.length > 0 && depth < 8 && (
            <ul className="ml-5 mt-2 space-y-2 border-l border-line pl-5">{kids.map((k) => <Node key={k.id} id={k.id} depth={depth + 1} />)}</ul>
          )}
        </li>
      );
    };
    body = all.length ? <Card className="overflow-x-auto p-5"><ul className="space-y-2">{roots.map((r) => <Node key={r.id} id={r.id} depth={0} />)}</ul></Card> : <Card><EmptyState title="No employees yet" /></Card>;
  } else if (tab === "documents") {
    const soon = addDays(new Date(), 60);
    const [docs, cnics] = await Promise.all([
      db.employeeDocument.findMany({ where: { expiresAt: { lte: soon }, employee: { ...scope, status: { not: "left" } } }, include: { employee: true }, orderBy: { expiresAt: "asc" } }),
      db.employee.findMany({ where: { ...scope, status: { not: "left" }, cnicExpiry: { lte: soon } }, orderBy: { cnicExpiry: "asc" } }),
    ]);
    const rows = [
      ...docs.map((d) => ({ id: d.id, empId: d.employeeId, name: d.employee.fullName, what: d.title, at: d.expiresAt! })),
      ...cnics.map((e) => ({ id: `cnic-${e.id}`, empId: e.id, name: e.fullName, what: "CNIC", at: e.cnicExpiry! })),
    ].sort((a, b) => +a.at - +b.at);
    body = (
      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState title="Nothing expiring in the next 60 days" /> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const days = differenceInCalendarDays(r.at, new Date());
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Link href={`/hr/employees/${r.empId}?tab=documents`} className="font-medium hover:underline">{r.name}</Link>
                  <span className="flex-1 text-muted">{r.what}</span>
                  <span className="text-muted">{fmtDate(r.at)}</span>
                  <Badge tone={days < 0 ? "red" : days <= 30 ? "amber" : "neutral"}>{days < 0 ? `Expired ${-days}d ago` : `${days} days`}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    );
  } else {
    body = (
      <>
        <form className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted" />
            <input name="q" defaultValue={q} aria-label="Search" placeholder="Name, code, phone or CNIC" className="input pl-9" />
          </div>
          <select name="dept" defaultValue={sp.dept ?? ""} className="input w-48">
            <option value="">All departments</option>
            {org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {scopeFor(user, "hr.employees") === "all" && (
            <select name="branch" defaultValue={sp.branch ?? ""} className="input w-36">
              <option value="">All branches</option>
              {org.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <select name="status" defaultValue={sp.status ?? ""} className="input w-36">
            <option value="">Current staff</option>
            {EMP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="h-9 rounded-md border border-line bg-surface px-3 text-sm hover:bg-canvas">Apply</button>
        </form>
        <Card className="overflow-hidden">
          {employees.length === 0 ? <EmptyState title="No employees found" /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line bg-canvas/60">
                  <tr>
                    <th className="th">Employee</th>
                    <th className="th">Designation</th>
                    <th className="th">Department</th>
                    <th className="th">Branch</th>
                    <th className="th">Joined</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {employees.map((e) => {
                    const st = empStatus(e.status);
                    return (
                      <tr key={e.id} className="hover:bg-canvas/60">
                        <td className="td">
                          <Link href={`/hr/employees/${e.id}`} className="flex items-center gap-3">
                            <PersonAvatar name={e.fullName} photo={e.photo} />
                            <span>
                              <span className="block whitespace-nowrap font-medium hover:underline">{e.fullName}</span>
                              <span className="block whitespace-nowrap text-xs text-muted">{e.code}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="td text-muted">{e.designation?.name ?? "—"}</td>
                        <td className="td text-muted">{e.department?.name ?? "—"}</td>
                        <td className="td text-muted">{e.branch?.name ?? "—"}</td>
                        <td className="td whitespace-nowrap text-muted">{fmtDate(e.joiningDate)}</td>
                        <td className="td"><StatusPill name={st.label} colorName={st.color} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    );
  }

  const canImport = user.isSuperAdmin || scopeFor(user, "hr.employees", "create") === "all";
  const freeUsers = sp.new && canCreate ? await db.user.findMany({ where: { employee: null, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }) : [];

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${employees.length} ${sp.status ? "" : "current "}staff`}
        actions={canCreate && (
          <>
            {canImport && <LinkButton href={hrefWith("/hr/employees", keep, { import: "1" })} variant="secondary" scroll={false}><Upload className="size-4" /> Import</LinkButton>}
            <LinkButton href={hrefWith("/hr/employees", keep, { new: "1" })} scroll={false}><Plus className="size-4" /> Add employee</LinkButton>
          </>
        )}
      />
      {tabs}
      {body}
      {sp.import && canImport && (
        <Drawer title="Import employees" closeHref={closeHref}>
          <div className="space-y-5">
            <p className="text-sm text-muted">Upload a CSV — save your Excel or ResourceInn export as <b className="text-ink">CSV</b>. One row per employee. Columns are matched by name (Full Name, CNIC, Phone, Branch, Department, Designation, Reports To, Joining Date, Gross Salary, Bank, Account Number, Device ID…). Missing departments and designations are created; people already in the system (same code or CNIC) are skipped.</p>
            <a href="/templates/employees-sample.csv" download className="inline-flex items-center gap-2 text-sm font-medium text-navy-900 underline"><Download className="size-4" /> Download template with 15 sample employees</a>
            <ActionForm action={importEmployees} className="space-y-3">
              <input name="file" type="file" required accept=".csv,text/csv" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
              <SubmitButton pendingText="Importing…">Import employees</SubmitButton>
            </ActionForm>
            <p className="text-xs text-muted">Logins aren’t created by the import — add them later in Settings → Users and link them to the employee.</p>
          </div>
        </Drawer>
      )}
      {sp.new && canCreate && (
        <Drawer title="Add employee" closeHref={closeHref} width="max-w-2xl">
          <EmployeeForm org={org} freeUsers={freeUsers} canCreateLogin={can(user, "settings.users", "create") || scopeFor(user, "hr.employees", "create") === "all"} cancelHref={closeHref} />
        </Drawer>
      )}
    </>
  );
}
