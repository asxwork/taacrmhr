import Link from "next/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { monthDate, payrollEmployeeWhere } from "@/lib/payroll";
import { fmtPKR } from "@/lib/crm-shared";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Payslips" };

type SP = { month?: string; dept?: string; q?: string };

/** Payroll → Payslips: every payslip across runs, filterable, each opening the printable payslip. */
export default async function PayslipsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.payroll");
  const sp = await searchParams;
  const scope = (await payrollEmployeeWhere(user)) ?? { id: "none" };
  const runs = await db.payrollRun.findMany({ orderBy: { month: "desc" }, select: { month: true } });
  const month = sp.month ?? runs[0]?.month;
  const slips = month ? await db.payslip.findMany({
    where: {
      run: { month }, employee: { ...scope, ...(sp.q && { OR: [{ fullName: { contains: sp.q } }, { code: { contains: sp.q } }] }) },
      ...(sp.dept && { department: sp.dept === "Not set" ? null : sp.dept }),
    },
    include: { employee: { select: { fullName: true, code: true } }, run: { select: { status: true } } },
    orderBy: { employee: { fullName: "asc" } },
  }) : [];
  const depts = [...new Set(slips.map((s) => s.department ?? "Not set"))];

  return (
    <>
      <PageHeader title="Payslips" description="Approved payslips are visible to employees in My Payslips." />
      <AutoFilterForm className="mb-4 flex flex-wrap gap-2">
        <select name="month" defaultValue={month ?? ""} className="input h-9 w-44" aria-label="Month">
          {runs.map((r) => <option key={r.month} value={r.month}>{format(monthDate(r.month), "MMMM yyyy")}</option>)}
        </select>
        <select name="dept" defaultValue={sp.dept ?? ""} className="input h-9 w-48" aria-label="Department">
          <option value="">All departments</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <input name="q" defaultValue={sp.q} placeholder="Name or code" className="input h-9 w-48" aria-label="Search" />
      </AutoFilterForm>
      <Card className="overflow-x-auto">
        {slips.length === 0 ? <EmptyState title="No payslips" description="Create a payroll run to generate payslips." /> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Department</th><th className="px-4 py-2.5 text-right">Earnings</th><th className="px-4 py-2.5 text-right">Deductions</th><th className="px-4 py-2.5 text-right">Tax</th><th className="px-4 py-2.5 text-right">Net</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {slips.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5"><Link href={`/hr/employees/${s.employeeId}?tab=salary`} className="font-medium hover:underline">{s.employee.fullName}</Link><span className="block text-xs text-muted">{s.employee.code} · {s.designation ?? ""}</span></td>
                  <td className="px-4 py-2.5">{s.department ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(s.earnings)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(s.deductions)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(s.tax)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtPKR(s.net)}</td>
                  <td className="px-4 py-2.5 text-right">{s.run.status === "draft" ? <Badge tone="amber">draft</Badge> : <Link href={`/payslips/${s.id}`} className="text-xs font-medium text-navy-700 hover:underline">Open</Link>}</td>
                </tr>
              ))}
              <tr className="bg-canvas/40 font-semibold">
                <td className="px-4 py-2.5" colSpan={2}>Total · {slips.length}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(slips.reduce((t, s) => t + s.earnings, 0))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(slips.reduce((t, s) => t + s.deductions, 0))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(slips.reduce((t, s) => t + s.tax, 0))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(slips.reduce((t, s) => t + s.net, 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
