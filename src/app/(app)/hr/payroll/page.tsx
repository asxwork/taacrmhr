import Link from "next/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { fiscalYearOf, monthDate, payrollEmployeeWhere, payrollSettings } from "@/lib/payroll";
import { fmtPKR } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { createRun, savePayrollSettings, saveSalary, saveTaxSlabs } from "./actions";

export const metadata = { title: "Payroll" };

const TONE = { draft: "amber", approved: "navy", paid: "green" } as const;
type SP = { tab?: string; salary?: string; fy?: string };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.payroll");
  const sp = await searchParams;
  const isAdmin = user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";
  const tab = sp.tab === "salaries" ? "salaries" : sp.tab === "settings" && isAdmin ? "settings" : "runs";
  const thisMonth = format(new Date(), "yyyy-MM");

  const tabs = (
    <div className="mb-4 flex rounded-lg bg-black/5 p-0.5 sm:w-fit">
      {([["runs", "Payroll runs"], ["salaries", "Salaries"], ...(isAdmin ? [["settings", "Settings & tax"]] : [])] as [string, string][]).map(([t, label]) => (
        <Link key={t} href={t === "runs" ? "/hr/payroll" : `/hr/payroll?tab=${t}`} className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{label}</Link>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (tab === "runs") {
    const runs = await db.payrollRun.findMany({ include: { payslips: { select: { net: true, gross: true, tax: true } } }, orderBy: { month: "desc" } });
    body = (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          {runs.length === 0 ? <EmptyState title="No payroll runs yet" description="Create this month’s payroll to calculate everyone’s salary." /> : (
            <ul className="divide-y divide-line">
              {runs.map((r) => (
                <li key={r.id}>
                  <Link href={`/hr/payroll/${r.month}`} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-canvas/60">
                    <span className="min-w-36 font-medium">{format(monthDate(r.month), "MMMM yyyy")}</span>
                    <Badge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>{r.status}</Badge>
                    <span className="flex-1 text-sm text-muted">{r.payslips.length} employees</span>
                    <span className="text-sm tabular-nums"><span className="text-muted">Net </span><b className="font-semibold">{fmtPKR(r.payslips.reduce((s, p) => s + p.net, 0))}</b></span>
                    <span className="text-sm tabular-nums text-muted">Tax {fmtPKR(r.payslips.reduce((s, p) => s + p.tax, 0), { prefix: false })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {isAdmin && (
          <Card className="h-fit p-5">
            <h2 className="mb-3 font-medium">New payroll</h2>
            <ActionForm action={createRun} className="space-y-3">
              <Field label="Month"><input name="month" type="month" defaultValue={thisMonth} required className="input" /></Field>
              <SubmitButton pendingText="Calculating…">Create &amp; calculate</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-xs text-muted">Uses salaries, attendance, unpaid leave, loans, approved expenses and the tax slabs for {fiscalYearOf(thisMonth)}. You can review and adjust before approving.</p>
          </Card>
        )}
      </div>
    );
  } else if (tab === "salaries") {
    const scope = (await payrollEmployeeWhere(user))!;
    const employees = await db.employee.findMany({ where: { ...scope, status: { not: "left" } }, include: { salary: true, designation: true }, orderBy: { fullName: "asc" } });
    const editing = sp.salary && isAdmin ? employees.find((e) => e.id === sp.salary) : null;
    body = (
      <>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line"><tr>{["Employee", "Gross / month", "PF", "EOBI", "Tax", "Effective"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-canvas/60">
                    <td className="td">
                      <Link href={isAdmin ? `/hr/payroll?tab=salaries&salary=${e.id}` : `/hr/employees/${e.id}`} scroll={false} className="flex items-center gap-3">
                        <PersonAvatar name={e.fullName} photo={e.photo} />
                        <span><span className="block whitespace-nowrap font-medium">{e.fullName}</span><span className="block text-xs text-muted">{e.designation?.name ?? e.code}</span></span>
                      </Link>
                    </td>
                    <td className="td tabular-nums">{e.salary ? fmtPKR(e.salary.gross) : <Badge tone="amber">Not set</Badge>}</td>
                    <td className="td text-muted">{e.salary?.pfPct ? `${e.salary.pfPct}%` : "—"}</td>
                    <td className="td text-muted">{e.salary ? (e.salary.eobi ? "Yes" : "No") : "—"}</td>
                    <td className="td text-muted">{e.salary?.taxExempt ? "Exempt" : e.salary ? "Slabs" : "—"}</td>
                    <td className="td whitespace-nowrap text-muted">{e.salary ? format(e.salary.effectiveFrom, "d MMM yyyy") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {editing && (
          <Drawer title={`Salary · ${editing.fullName}`} closeHref="/hr/payroll?tab=salaries" width="max-w-md">
            <ActionForm action={saveSalary} className="space-y-4">
              <input type="hidden" name="employeeId" value={editing.id} />
              <Field label="Monthly gross (PKR)"><input name="gross" inputMode="numeric" defaultValue={editing.salary?.gross ?? ""} required className="input" /></Field>
              <Field label="Effective from"><input name="effectiveFrom" type="date" defaultValue={format(editing.salary?.effectiveFrom ?? new Date(), "yyyy-MM-dd")} className="input" /></Field>
              <Field label="Provident fund (% of basic)"><input name="pfPct" type="number" step="0.5" min={0} max={20} defaultValue={editing.salary?.pfPct ?? 0} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="eobi" defaultChecked={editing.salary?.eobi ?? true} className="accent-navy-900" /> Deduct EOBI</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="taxExempt" defaultChecked={editing.salary?.taxExempt} className="accent-navy-900" /> Exempt from income tax</label>
              <SubmitButton>Save salary</SubmitButton>
              <p className="text-xs text-muted">Changes are recorded on the employee’s history and apply to payrolls calculated from now on.</p>
            </ActionForm>
          </Drawer>
        )}
      </>
    );
  } else {
    const [settings, comps, fys] = await Promise.all([payrollSettings(), db.payComponent.findMany({ orderBy: { sortOrder: "asc" } }), db.taxSlab.findMany({ distinct: ["fiscalYear"], select: { fiscalYear: true }, orderBy: { fiscalYear: "desc" } })]);
    const fy = sp.fy ?? fiscalYearOf(thisMonth);
    const slabs = await db.taxSlab.findMany({ where: { fiscalYear: fy }, orderBy: { from: "asc" } });
    body = (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-medium">Salary structure & statutory</h2>
          <ActionForm action={savePayrollSettings} className="space-y-4" successMessage="Saved.">
            <div className="space-y-2">
              {comps.map((c) => (
                <div key={c.id} className="grid grid-cols-[1fr_100px] gap-2">
                  <input name={`name:${c.id}`} defaultValue={c.name} className="input" aria-label="Component name" />
                  <input name={`pct:${c.id}`} type="number" step="0.01" defaultValue={c.pctOfGross} className="input" aria-label={`${c.name} % of gross`} />
                </div>
              ))}
              <p className="text-xs text-muted">% of gross — must total 100. Medical is tax-free up to 10% of basic.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="EOBI employee (PKR/month)"><input name="eobiEmployee" type="number" defaultValue={settings.eobiEmployee} className="input" /></Field>
              <Field label="EOBI employer (PKR/month)"><input name="eobiEmployer" type="number" defaultValue={settings.eobiEmployer} className="input" /></Field>
              <Field label="Lates per day deducted" hint="0 = don't deduct"><input name="latesPerDay" type="number" min={0} defaultValue={settings.latesPerDay} className="input" /></Field>
              <Field label="Overtime rate (× hourly)" hint="0 = don't pay overtime"><input name="overtimeRate" type="number" step="0.25" min={0} defaultValue={settings.overtimeRate} className="input" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="commission" defaultChecked={settings.commission} className="accent-navy-900" /> Pay deal commissions through payroll (won deals × commission %)</label>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="h-fit p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Income tax slabs (annual)</h2>
            <div className="flex gap-1 text-sm">
              {[...new Set([fiscalYearOf(thisMonth), ...fys.map((f) => f.fiscalYear)])].map((f) => (
                <Link key={f} href={`/hr/payroll?tab=settings&fy=${f}`} className={cn("rounded-md px-2 py-1", f === fy ? "bg-navy-900 text-white" : "text-muted hover:bg-canvas")}>{f}</Link>
              ))}
            </div>
          </div>
          <ActionForm action={saveTaxSlabs} className="space-y-2">
            <input type="hidden" name="fiscalYear" value={fy} />
            <div className="grid grid-cols-4 gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted"><span>From</span><span>To</span><span>Fixed</span><span>Rate %</span></div>
            {Array.from({ length: Math.max(slabs.length + 1, 6) }, (_, i) => slabs[i]).map((s, i) => (
              <div key={i} className="grid grid-cols-4 gap-2">
                <input name={`from${i}`} type="number" defaultValue={s?.from ?? ""} className="input" aria-label={`Slab ${i + 1} from`} />
                <input name={`to${i}`} type="number" defaultValue={s?.to ?? ""} placeholder={s ? "no limit" : ""} className="input" aria-label={`Slab ${i + 1} to`} />
                <input name={`fixed${i}`} type="number" defaultValue={s?.fixed ?? ""} className="input" aria-label={`Slab ${i + 1} fixed tax`} />
                <input name={`rate${i}`} type="number" step="0.5" defaultValue={s?.rate ?? ""} className="input" aria-label={`Slab ${i + 1} rate`} />
              </div>
            ))}
            <p className="text-xs text-muted">Tax = fixed + rate% of income above “From”. Confirm each year’s slabs against the Finance Act before running July payroll.</p>
            <SubmitButton>Save slabs for {fy}</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Payroll" description="Monthly salaries with attendance, leave, loans, expenses and tax." />
      {tabs}
      {body}
    </>
  );
}
