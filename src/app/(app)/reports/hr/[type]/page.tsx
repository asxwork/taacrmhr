import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format, startOfMonth } from "date-fns";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { HR_REPORTS, hrTable, type HrReport } from "@/lib/hr-report-tables";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ReportTable } from "@/components/hr/report-table";

export const metadata = { title: "HR Reports" };

/** Reports → Generate Reports → one report, with a date range where it applies and CSV export. */
export default async function HrReportPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission("reports.hr");
  const [{ type }, sp] = await Promise.all([params, searchParams]);
  if (type === "payroll") redirect("/hr/payroll/reports");
  const def = HR_REPORTS.find((t) => t.value === type);
  if (!def) notFound();
  const parse = (v: string | undefined, f: Date) => { const x = v ? new Date(`${v}T00:00:00`) : f; return Number.isNaN(x.getTime()) ? f : x; };
  const from = parse(sp.from, startOfMonth(new Date()));
  const to = parse(sp.to, new Date());
  const range = { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  const table = await hrTable(type as HrReport, from, to, (await employeeWhere(user)) ?? { id: "none" });

  return (
    <>
      <PageHeader title={def.label} description={`${table.rows.filter((r) => r[0] !== "Total").length} row(s)`} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-lg bg-black/5 p-0.5">
          {HR_REPORTS.map((t) => <Link key={t.value} href={`/reports/hr/${t.value}`} className={cn("rounded-md px-3 py-1.5 text-sm", t.value === type ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{t.label.replace(" Reports", "")}</Link>)}
        </div>
        {def.dated && (
          <AutoFilterForm className="flex gap-2">
            <input type="date" name="from" defaultValue={range.from} className="input h-9 w-40" aria-label="From" />
            <input type="date" name="to" defaultValue={range.to} className="input h-9 w-40" aria-label="To" />
          </AutoFilterForm>
        )}
        <a href={`/api/hr/export?type=${type}${def.dated ? `&from=${range.from}&to=${range.to}` : ""}`} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface"><Download className="size-4" /> Download CSV</a>
      </div>
      <Card className="overflow-x-auto"><ReportTable head={table.head} rows={table.rows} empty="Nothing to show." /></Card>
    </>
  );
}
