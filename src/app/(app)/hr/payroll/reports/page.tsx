import Link from "next/link";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { monthDate, payrollEmployeeWhere } from "@/lib/payroll";
import { REPORT_TYPES, reportTable, type ReportType } from "@/lib/payroll-reports";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ReportTable } from "@/components/hr/report-table";

export const metadata = { title: "Payroll Reports" };

/** Payroll → Reports: department summary, salary register, tax, EOBI and bank voucher for a month, with CSV export. */
export default async function PayrollReports({ searchParams }: { searchParams: Promise<{ month?: string; type?: string }> }) {
  const user = await requirePermission("hr.payroll");
  const sp = await searchParams;
  const runs = await db.payrollRun.findMany({ orderBy: { month: "desc" }, select: { month: true } });
  const month = sp.month ?? runs[0]?.month;
  const type = (REPORT_TYPES.some((t) => t.value === sp.type) ? sp.type : "summary") as ReportType;
  const scope = (await payrollEmployeeWhere(user)) ?? { id: "none" };
  const table = month ? await reportTable(type, month, scope) : null;

  return (
    <>
      <PageHeader title="Payroll Reports" description="Every report comes from the payslips of the chosen month and downloads as CSV for Excel." />
      {!month ? <Card><EmptyState title="No payroll runs yet" /></Card> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <AutoFilterForm className="flex gap-2">
              <input type="hidden" name="type" value={type} />
              <select name="month" defaultValue={month} className="input h-9 w-44" aria-label="Month">
                {runs.map((r) => <option key={r.month} value={r.month}>{format(monthDate(r.month), "MMMM yyyy")}</option>)}
              </select>
            </AutoFilterForm>
            <div className="flex flex-wrap rounded-lg bg-black/5 p-0.5">
              {REPORT_TYPES.map((t) => (
                <Link key={t.value} href={`/hr/payroll/reports?month=${month}&type=${t.value}`} className={cn("rounded-md px-3 py-1.5 text-sm", type === t.value ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{t.label}</Link>
              ))}
            </div>
            <a href={`/api/payroll/export?type=${type}&month=${month}`} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface"><Download className="size-4" /> Download CSV</a>
          </div>
          <Card className="overflow-x-auto">{table && <ReportTable head={table.head} rows={table.rows} />}</Card>
        </>
      )}
    </>
  );
}
