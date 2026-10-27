import Link from "next/link";
import { addDays, format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { monthDate } from "@/lib/payroll";
import { fmtPKR } from "@/lib/crm-shared";
import { Card, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { BarList } from "@/components/charts";
import { LineChart } from "@/components/line-chart";

export const metadata = { title: "Payroll Dashboard" };

/** Payroll → Dashboard: cost trend, latest run, where the money goes and what is waiting to be paid. */
export default async function PayrollDashboard() {
  await requirePermission("hr.payroll");
  const now = new Date();
  const [runs, pendingExpenses, encashments, loans, revisionsDue, notice] = await Promise.all([
    db.payrollRun.findMany({ orderBy: { month: "desc" }, take: 12, include: { payslips: { select: { net: true, gross: true, tax: true, earnings: true, deductions: true, department: true } } } }),
    db.expense.aggregate({ where: { status: "approved", runId: null }, _sum: { amount: true }, _count: true }),
    db.leaveEncashment.aggregate({ where: { status: "approved", runId: null }, _sum: { amount: true }, _count: true }),
    db.loan.findMany({ where: { status: "active" }, include: { repayments: { select: { amount: true } } } }),
    db.salaryProfile.count({ where: { nextIncrementAt: { lte: addDays(now, 30) }, employee: { status: { not: "left" } } } }),
    db.employee.count({ where: { status: "notice", settlements: { none: {} } } }),
  ]);
  const latest = runs[0];
  const sum = (r: (typeof runs)[number] | undefined, k: "net" | "gross" | "tax" | "deductions") => (r ? r.payslips.reduce((s, p) => s + p[k], 0) : 0);
  const trend = [...runs].reverse();
  const byDept = new Map<string, number>();
  for (const p of latest?.payslips ?? []) byDept.set(p.department ?? "Not set", (byDept.get(p.department ?? "Not set") ?? 0) + p.net);
  const outstanding = loans.reduce((s, l) => s + l.amount - l.repayments.reduce((t, r) => t + r.amount, 0), 0);

  return (
    <>
      <PageHeader title="Payroll Dashboard" description={latest ? `Latest payroll: ${format(monthDate(latest.month), "MMMM yyyy")} (${latest.status})` : "No payroll runs yet."} />
      <DrillTiles className="mb-6 lg:grid-cols-4 xl:grid-cols-4" tiles={[
        { key: "net", label: "Net pay (latest)", tone: "green", value: fmtPKR(sum(latest, "net")), sub: `${latest?.payslips.length ?? 0} payslips`, href: latest ? `/hr/payroll/${latest.month}` : "/hr/payroll" },
        { key: "gross", label: "Gross (latest)", tone: "navy", value: fmtPKR(sum(latest, "gross")), href: "/hr/payroll/reports" },
        { key: "tax", label: "Income tax (latest)", tone: "amber", value: fmtPKR(sum(latest, "tax")), href: `/hr/payroll/reports${latest ? `?month=${latest.month}&type=tax` : ""}` },
        { key: "loans", label: "Loans outstanding", tone: "red", value: fmtPKR(outstanding), sub: `${loans.length} active`, href: "/hr/expenses" },
        { key: "claims", label: "Claims to pay", tone: "violet", value: fmtPKR(pendingExpenses._sum.amount ?? 0), sub: `${pendingExpenses._count} approved`, href: "/hr/expenses" },
        { key: "enc", label: "Encashments to pay", tone: "teal", value: fmtPKR(encashments._sum.amount ?? 0), sub: `${encashments._count} approved`, href: "/hr/leave-encashment?status=approved" },
        { key: "inc", label: "Increments due (30 days)", tone: "gold", value: revisionsDue, href: "/hr/salary-revisions?tab=due" },
        { key: "set", label: "Settlements to prepare", tone: "orange", value: notice, href: "/hr/payroll/settlements" },
      ]} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Payroll cost by month</h2>
          <LineChart labels={trend.map((r) => format(monthDate(r.month), "MMM yy"))} format={(v) => `${Math.round(v / 1000)}k`}
            series={[{ name: "Gross", color: "#1c3f63", values: trend.map((r) => sum(r, "gross")) }, { name: "Net", color: "#10b981", values: trend.map((r) => sum(r, "net")) }, { name: "Tax", color: "#f59e0b", values: trend.map((r) => sum(r, "tax")) }]} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Net pay by department{latest ? ` · ${format(monthDate(latest.month), "MMM yyyy")}` : ""}</h2>
          <BarList rows={[...byDept.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, value: v, display: fmtPKR(v), href: latest ? `/hr/payroll/payslips?month=${latest.month}&dept=${encodeURIComponent(name)}` : undefined }))} />
        </Card>
      </div>
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Month</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Payslips</th><th className="px-4 py-2.5 text-right">Gross</th><th className="px-4 py-2.5 text-right">Deductions</th><th className="px-4 py-2.5 text-right">Net</th></tr></thead>
          <tbody className="divide-y divide-line">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5"><Link href={`/hr/payroll/${r.month}`} className="font-medium hover:underline">{format(monthDate(r.month), "MMMM yyyy")}</Link></td>
                <td className="px-4 py-2.5 capitalize">{r.status}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.payslips.length}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(sum(r, "gross"))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(sum(r, "deductions"))}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtPKR(sum(r, "net"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
