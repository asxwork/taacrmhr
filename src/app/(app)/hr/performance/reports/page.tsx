import Link from "next/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { RATINGS } from "@/lib/hr-shared";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { BarList } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ReportTable } from "@/components/hr/report-table";

export const metadata = { title: "Performance Reports" };

/** Assessment → Reports: for one review cycle, completion, rating spread, department averages and the ranking. */
export default async function PerformanceReports({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const user = await requirePermission("hr.performance");
  const sp = await searchParams;
  const cycles = await db.appraisalCycle.findMany({ orderBy: { from: "desc" } });
  const cycle = cycles.find((c) => c.id === sp.cycle) ?? cycles[0];
  const scope = (await employeeWhere(user)) ?? { id: "none" };
  const rows = cycle ? await db.appraisal.findMany({
    where: { cycleId: cycle.id, employee: scope },
    include: { employee: { select: { id: true, fullName: true, code: true, department: { select: { name: true } } } } },
  }) : [];
  const done = rows.filter((r) => r.status === "done" && r.managerRating);
  const avg = done.length ? done.reduce((s, r) => s + r.managerRating!, 0) / done.length : 0;
  const byDept = new Map<string, number[]>();
  for (const r of done) byDept.set(r.employee.department?.name ?? "Not set", [...(byDept.get(r.employee.department?.name ?? "Not set") ?? []), r.managerRating!]);
  const probation = await db.probationReview.groupBy({ by: ["recommendation"], _count: true });

  return (
    <>
      <PageHeader title="Performance Reports" actions={cycles.length > 0 && (
        <AutoFilterForm><select name="cycle" defaultValue={cycle?.id} className="input h-9 w-56" aria-label="Review cycle">{cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></AutoFilterForm>
      )} />
      {!cycle ? <Card><EmptyState title="No review cycles yet" description="Open one in Assessment → Performance." /></Card> : (
        <>
          <DrillTiles className="mb-6 lg:grid-cols-4 xl:grid-cols-4" tiles={[
            { key: "n", label: "In this cycle", tone: "navy", value: rows.length, sub: `${format(cycle.from, "d MMM")} – ${format(cycle.to, "d MMM yyyy")}`, href: `/hr/performance/${cycle.id}` },
            { key: "s", label: "Waiting for self review", tone: "amber", value: rows.filter((r) => r.status === "self").length, href: `/hr/performance/${cycle.id}` },
            { key: "m", label: "Waiting for manager", tone: "violet", value: rows.filter((r) => r.status === "manager").length, href: `/hr/performance/${cycle.id}` },
            { key: "d", label: "Completed", tone: "green", value: `${done.length} · ${rows.length ? Math.round((done.length / rows.length) * 100) : 0}%`, sub: done.length ? `average ${avg.toFixed(1)}/5` : undefined, href: `/hr/performance/${cycle.id}` },
          ]} />
          <div className="mb-6 grid gap-6 lg:grid-cols-3">
            <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Rating spread</h2>
              <BarList rows={[...RATINGS].reverse().map((r) => { const n = done.filter((d) => d.managerRating === r.value).length; return { name: `${r.value} · ${r.label}`, value: n, display: String(n) }; })} />
            </Card>
            <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Average by department</h2>
              <BarList rows={[...byDept.entries()].map(([k, v]) => ({ name: k, value: v.reduce((a, b) => a + b, 0) / v.length, display: `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} · ${v.length}` })).sort((a, b) => b.value - a.value)} />
            </Card>
            <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Probation recommendations (all time)</h2>
              <BarList rows={probation.map((p) => ({ name: p.recommendation === "terminate" ? "End employment" : p.recommendation[0]!.toUpperCase() + p.recommendation.slice(1), value: p._count, display: String(p._count), href: "/hr/probation" }))} empty="No probation reviews yet." />
            </Card>
          </div>
          <Card className="overflow-x-auto">
            <ReportTable head={["Rank", "Employee", "Department", "Self", "Manager", "Recommendation", "Status"]}
              rows={[...rows].sort((a, b) => (b.managerRating ?? 0) - (a.managerRating ?? 0)).map((r, i) => [String(i + 1), r.employee.fullName, r.employee.department?.name ?? "—", r.selfRating ?? "—", r.managerRating ?? "—", r.recommendation ?? "—", r.status])} />
          </Card>
          <p className="mt-2 text-xs text-muted"><Link href={`/hr/performance/${cycle.id}`} className="hover:underline">Open the cycle</Link> to review or reopen individual appraisals.</p>
        </>
      )}
    </>
  );
}
