import Link from "next/link";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { monthDate, payrollEmployeeWhere } from "@/lib/payroll";
import { payslipsFor } from "@/lib/payroll-reports";
import { fmtPKR } from "@/lib/crm-shared";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Vouchers" };

const METHOD: Record<string, string> = { bank: "Bank transfer", cash: "Cash", cheque: "Cheque" };

/** Payroll → Vouchers: the disbursement voucher for a month, grouped by payment method and employee bank. */
export default async function VouchersPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("hr.payroll");
  const sp = await searchParams;
  const runs = await db.payrollRun.findMany({ orderBy: { month: "desc" }, select: { month: true, status: true } });
  const month = sp.month ?? runs[0]?.month;
  const run = runs.find((r) => r.month === month);
  const scope = (await payrollEmployeeWhere(user)) ?? { id: "none" };
  const [slips, from] = await Promise.all([month ? payslipsFor(month, scope) : [], db.companyBank.findFirst({ where: { isDefault: true, active: true } })]);

  const groups = new Map<string, typeof slips>();
  for (const s of slips) {
    const method = s.employee.salary?.paymentMethod ?? "bank";
    const key = method === "bank" ? `Bank transfer · ${s.bankName || "No bank on file"}` : METHOD[method] ?? method;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const total = slips.reduce((t, s) => t + s.net, 0);

  return (
    <>
      <PageHeader title="Vouchers" description="Who gets paid how much, and into which account. Download the bank transfer list as CSV for your bank's bulk upload." />
      {!month ? <Card><EmptyState title="No payroll runs yet" /></Card> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <AutoFilterForm>
              <select name="month" defaultValue={month} className="input h-9 w-44" aria-label="Month">
                {runs.map((r) => <option key={r.month} value={r.month}>{format(monthDate(r.month), "MMMM yyyy")}</option>)}
              </select>
            </AutoFilterForm>
            {run && <Badge tone={run.status === "draft" ? "amber" : "green"}>{run.status}</Badge>}
            <a href={`/api/payroll/export?type=voucher&month=${month}`} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface"><Download className="size-4" /> Download CSV</a>
          </div>
          <Card className="mb-4 flex flex-wrap items-center gap-6 p-5 text-sm">
            <div><p className="text-xs text-muted">Paid from</p><p className="font-medium">{from ? `${from.name} · ${from.accountTitle} · ${from.accountNumber}` : <Link href="/hr/payroll/banks" className="text-navy-700 hover:underline">Add your company bank account</Link>}</p></div>
            <div><p className="text-xs text-muted">Employees</p><p className="font-medium">{slips.length}</p></div>
            <div className="ml-auto text-right"><p className="text-xs text-muted">Total net pay</p><p className="text-xl font-semibold tabular-nums">{fmtPKR(total)}</p></div>
          </Card>
          {[...groups.entries()].sort().map(([k, list]) => (
            <Card key={k} className="mb-4 overflow-x-auto">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm"><b>{k}</b><span className="tabular-nums">{list.length} · {fmtPKR(list.reduce((t, s) => t + s.net, 0))}</span></div>
              <table className="w-full min-w-[640px] text-sm">
                <tbody className="divide-y divide-line">
                  {list.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2"><span className="font-medium">{s.employee.fullName}</span> <span className="text-xs text-muted">{s.employee.code}</span></td>
                      <td className="px-4 py-2 text-xs">{s.accountTitle ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{s.accountNumber ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{fmtPKR(s.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </>
      )}
    </>
  );
}
