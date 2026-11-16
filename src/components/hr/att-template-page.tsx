import { format } from "date-fns";
import { Download } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { attendanceEmployeeWhere } from "@/lib/attendance";
import { filtersQuery, readFilters, runTemplate, templateByKey } from "@/lib/attendance-templates";
import { Card, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { AttReportFilters } from "@/components/hr/att-report-filters";
import { AttReportTable } from "@/components/hr/att-report-table";

/** One ready-made attendance report: filters on the left, the result on the right (stacked on phones). */
export async function AttTemplatePage({ user, type, sp }: { user: SessionUser; type: string; sp: Record<string, string | undefined> }) {
  const t = templateByKey(type)!;
  const scope = (await attendanceEmployeeWhere(user)) ?? { id: "none" };
  const f = readFilters(sp);
  if (t.day && !sp.from && !sp.to && !sp.period) { f.period = "today"; f.from = f.to = format(new Date(), "yyyy-MM-dd"); }
  if (t.day) f.from = f.to;
  const [out, emps, branches, departments, users] = await Promise.all([
    runTemplate(t.key, f, scope),
    db.employee.findMany({ where: { AND: [scope, { status: { not: "left" } }] }, select: { id: true, fullName: true, code: true, location: true }, orderBy: { fullName: "asc" } }),
    db.branch.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const locations = [...new Set(emps.map((e) => e.location).filter((x): x is string => !!x))].sort();
  const span = f.from === f.to ? format(new Date(`${f.to}T00:00:00`), "EEE d MMM yyyy") : `${format(new Date(`${f.from}T00:00:00`), "d MMM")} – ${format(new Date(`${f.to}T00:00:00`), "d MMM yyyy")}`;

  return (
    <>
      <PageHeader title={t.name} description={`${span} · ${t.desc}`} actions={
        <>
          <a href={`/api/attendance/export?type=${t.key}&${filtersQuery(f)}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-canvas"><Download className="size-4" /> CSV</a>
          <PrintButton fileName={`${t.key}-${f.from}`} />
        </>
      } />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card className="h-fit p-4 lg:sticky lg:top-4">
          <AttReportFilters key={filtersQuery(f)} template={t.key} day={t.day} value={f} options={{
            locations, branches, departments,
            employees: emps.map((e) => ({ id: e.id, name: `${e.fullName} · ${e.code}` })),
            users: users.map((u) => ({ id: u.id, name: u.name })),
          }} />
        </Card>
        <Card className="min-w-0 overflow-hidden" data-print-area>
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5 text-xs text-muted">
            <span>{out.rows.length - (out.total ? 1 : 0)} row{out.rows.length === 1 ? "" : "s"}</span>
            {out.note && out.rows.length > 0 && <span className="text-amber-700">{out.note}</span>}
          </div>
          <AttReportTable out={out} />
        </Card>
      </div>
    </>
  );
}
