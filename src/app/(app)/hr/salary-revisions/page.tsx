import Link from "next/link";
import { addDays, format, startOfYear } from "date-fns";
import { Plus, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { REVISION_KINDS, revisionKind } from "@/lib/compensation";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { proposeRevision } from "../compensation-actions";

export const metadata = { title: "Salary Revisions" };

type SP = { tab?: string; status?: string; new?: string; bulk?: string; emp?: string };
const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;
const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red", cancelled: "neutral" } as const;

/** People → Salary Revisions: increments, promotions and adjustments with approval, and who is due an increment. */
export default async function SalaryRevisionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.payroll");
  const sp = await searchParams;
  const admin = user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";
  const scope = (await employeeWhere(user)) ?? { id: "none" };
  const now = new Date();
  const tab = sp.tab === "due" ? "due" : "revisions";

  const [revisions, due, staff, departments, branches] = await Promise.all([
    db.salaryRevision.findMany({
      where: { employee: scope, ...(sp.status && { status: sp.status }) },
      include: { employee: { select: { id: true, fullName: true, code: true, department: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" }, take: 300,
    }),
    db.employee.findMany({
      where: { ...scope, status: { not: "left" }, salary: { nextIncrementAt: { lte: addDays(now, 30) } } },
      include: { salary: true, designation: { select: { name: true } } }, orderBy: { fullName: "asc" },
    }),
    admin ? db.employee.findMany({ where: { status: { not: "left" }, salary: { isNot: null } }, include: { salary: { select: { gross: true } } }, orderBy: { fullName: "asc" } }) : [],
    admin ? db.department.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    admin ? db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const thisYear = revisions.filter((r) => r.status === "approved" && r.effectiveFrom >= startOfYear(now));
  const avgPct = thisYear.length ? thisYear.reduce((s, r) => s + (r.oldGross ? ((r.newGross - r.oldGross) / r.oldGross) * 100 : 0), 0) / thisYear.length : 0;
  const pct = (r: { oldGross: number; newGross: number }) => (r.oldGross ? ((r.newGross - r.oldGross) / r.oldGross) * 100 : 0);

  return (
    <>
      <PageHeader title="Salary Revisions" description="Increments, promotions and adjustments. Approved revisions update the salary from the effective date and set the next increment date."
        actions={admin && (
          <div className="flex gap-2">
            <LinkButton href="/hr/salary-revisions?bulk=1" variant="secondary" scroll={false}><TrendingUp className="size-4" /> Bulk increment</LinkButton>
            <LinkButton href="/hr/salary-revisions?new=1" scroll={false}><Plus className="size-4" /> New revision</LinkButton>
          </div>
        )} />

      <DrillTiles className="mb-6 lg:grid-cols-4 xl:grid-cols-4" tiles={[
        { key: "p", label: "Waiting for approval", tone: "amber", value: revisions.filter((r) => r.status === "pending").length, href: "/hr/salary-revisions?status=pending" },
        { key: "a", label: `Approved in ${now.getFullYear()}`, tone: "green", value: thisYear.length, href: "/hr/salary-revisions?status=approved" },
        { key: "d", label: "Due for increment (30 days)", tone: "violet", value: due.length, href: "/hr/salary-revisions?tab=due" },
        { key: "avg", label: "Average change this year", tone: "navy", value: `${avgPct.toFixed(1)}%` },
      ]} />

      <div className="mb-4 flex gap-1 border-b border-line">
        {([["revisions", "Revisions"], ["due", `Due for increment (${due.length})`]] as const).map(([t, label]) => (
          <Link key={t} href={t === "revisions" ? "/hr/salary-revisions" : "/hr/salary-revisions?tab=due"} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t ? "border-navy-900 font-medium" : "border-transparent text-muted hover:text-ink")}>{label}</Link>
        ))}
      </div>

      {tab === "revisions" ? (
        <Card className="overflow-x-auto">
          {revisions.length === 0 ? <EmptyState title="No salary revisions yet" description={admin ? "Use “New revision” or “Bulk increment”." : undefined} /> : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5 text-right">Old</th><th className="px-4 py-2.5 text-right">New</th><th className="px-4 py-2.5 text-right">Change</th><th className="px-4 py-2.5">Effective</th><th className="px-4 py-2.5">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {revisions.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5"><Link href={`/hr/employees/${r.employee.id}?tab=salary`} className="font-medium hover:underline">{r.employee.fullName}</Link><span className="block text-xs text-muted">{r.employee.code}{r.employee.department ? ` · ${r.employee.department.name}` : ""}</span></td>
                    <td className="px-4 py-2.5">{revisionKind(r.kind)}{r.reason && <span className="block max-w-56 truncate text-xs text-muted">{r.reason}</span>}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pkr(r.oldGross)}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{pkr(r.newGross)}</td>
                    <td className={cn("px-4 py-2.5 text-right tabular-nums", pct(r) >= 0 ? "text-emerald-600" : "text-red-600")}>{pct(r) >= 0 ? "+" : ""}{pct(r).toFixed(1)}%</td>
                    <td className="px-4 py-2.5">{format(r.effectiveFrom, "d MMM yyyy")}</td>
                    <td className="px-4 py-2.5">
                      {(() => {
                        const badge = <Badge tone={r.status === "approved" && !r.appliedAt ? "navy" : STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status === "approved" && !r.appliedAt ? `scheduled · ${format(r.effectiveFrom, "d MMM")}` : r.status}</Badge>;
                        return r.approvalId ? <Link href={`/approvals?open=${r.approvalId}`}>{badge}</Link> : badge;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          {due.length === 0 ? <EmptyState title="Nobody is due an increment in the next 30 days" description="The due date comes from each profile’s “Next Expected Increment Date”, set automatically when a revision is approved." /> : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5 text-right">Current gross</th><th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {due.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5"><Link href={`/hr/employees/${e.id}?tab=salary`} className="font-medium hover:underline">{e.fullName}</Link><span className="block text-xs text-muted">{e.designation?.name}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pkr(e.salary!.gross)}</td>
                    <td className={cn("px-4 py-2.5", e.salary!.nextIncrementAt! < now && "font-medium text-red-600")}>{format(e.salary!.nextIncrementAt!, "d MMM yyyy")}{e.salary!.nextIncrementAt! < now && " · overdue"}</td>
                    <td className="px-4 py-2.5 text-right">{admin && <Link href={`/hr/salary-revisions?tab=due&new=1&emp=${e.id}`} scroll={false} className="text-sm font-medium text-navy-700 hover:underline">Propose increment</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {admin && sp.new && (
        <Drawer title="New salary revision" closeHref={tab === "due" ? "/hr/salary-revisions?tab=due" : "/hr/salary-revisions"}>
          <ActionForm action={proposeRevision} className="space-y-4">
            <input type="hidden" name="mode" value="single" />
            <Field label="Employee">
              <select name="employeeId" required defaultValue={sp.emp ?? ""} className="input">
                <option value="">Choose…</option>
                {staff.map((e) => <option key={e.id} value={e.id}>{e.fullName} — {pkr(e.salary!.gross)}</option>)}
              </select>
            </Field>
            <Field label="Type"><select name="kind" className="input">{REVISION_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="New gross (PKR)"><input name="newGross" type="number" min={1} className="input" /></Field>
              <Field label="…or change %" hint="e.g. 10 or -5"><input name="pct" type="number" step="0.1" className="input" /></Field>
            </div>
            <Field label="Effective from"><input name="effectiveFrom" type="date" required defaultValue={format(now, "yyyy-MM-dd")} className="input" /></Field>
            <Field label="Reason"><textarea name="reason" rows={3} className="input" placeholder="e.g. Annual appraisal: exceeds expectations" /></Field>
            <SubmitButton>Send for approval</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
      {admin && sp.bulk && (
        <Drawer title="Bulk increment" closeHref="/hr/salary-revisions">
          <ActionForm action={proposeRevision} className="space-y-4">
            <input type="hidden" name="mode" value="bulk" />
            <p className="text-sm text-muted">Everyone with a salary in the chosen department and branch gets the same %; all of it goes as one approval.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department"><select name="departmentId" className="input"><option value="">All</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Branch"><select name="branchId" className="input"><option value="">All</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            </div>
            <Field label="Increment %"><input name="pct" type="number" step="0.1" required className="input" placeholder="10" /></Field>
            <Field label="Type"><select name="kind" className="input">{REVISION_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></Field>
            <Field label="Effective from"><input name="effectiveFrom" type="date" required defaultValue={format(now, "yyyy-MM-dd")} className="input" /></Field>
            <Field label="Reason"><textarea name="reason" rows={2} className="input" placeholder="e.g. Annual increment 2026" /></Field>
            <SubmitButton>Send for approval</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
