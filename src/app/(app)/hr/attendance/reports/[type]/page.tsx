import Link from "next/link";
import { notFound } from "next/navigation";
import { endOfMonth, format, isAfter, startOfDay, startOfMonth } from "date-fns";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { attendanceEmployeeWhere } from "@/lib/attendance";
import { ATT_REPORTS, attendanceReport, type AttReport } from "@/lib/attendance-reports";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ReportTable } from "@/components/hr/report-table";

export const metadata = { title: "Attendance Reports" };

/** Attendance → Reports → Time / Scheduling / Travel, for a date range, with CSV export. */
export default async function AttendanceReportPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission("hr.attendance");
  const [{ type }, sp] = await Promise.all([params, searchParams]);
  const def = ATT_REPORTS.find((t) => t.value === type);
  if (!def) notFound();
  const today = startOfDay(new Date());
  const parse = (v: string | undefined, d: Date) => { const x = v ? new Date(`${v}T00:00:00`) : d; return Number.isNaN(x.getTime()) ? d : x; };
  const from = parse(sp.from, startOfMonth(today));
  let to = parse(sp.to, today);
  if (type !== "travel" && isAfter(to, today)) to = today;
  const range = { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  const table = to < from ? { head: [], rows: [] } : await attendanceReport(type as AttReport, from, to, (await attendanceEmployeeWhere(user)) ?? { id: "none" });

  return (
    <>
      <PageHeader title={`${def.label} Report`} description={def.description} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-black/5 p-0.5">
          {ATT_REPORTS.map((t) => <Link key={t.value} href={`/hr/attendance/reports/${t.value}?from=${range.from}&to=${range.to}`} className={cn("rounded-md px-3 py-1.5 text-sm", t.value === type ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{t.label}</Link>)}
        </div>
        <AutoFilterForm className="flex gap-2">
          <input type="date" name="from" defaultValue={range.from} className="input h-9 w-40" aria-label="From" />
          <input type="date" name="to" defaultValue={range.to} max={type === "travel" ? undefined : format(endOfMonth(today) > today ? today : endOfMonth(today), "yyyy-MM-dd")} className="input h-9 w-40" aria-label="To" />
        </AutoFilterForm>
        <a href={`/api/attendance/export?type=${type}&from=${range.from}&to=${range.to}`} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface"><Download className="size-4" /> Download CSV</a>
      </div>
      <Card className="overflow-x-auto"><ReportTable head={table.head} rows={table.rows} empty="Nothing in this period." /></Card>
    </>
  );
}
