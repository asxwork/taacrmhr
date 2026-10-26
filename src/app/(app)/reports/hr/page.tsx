import { format } from "date-fns";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { fmtPKR } from "@/lib/crm-shared";
import { PERIODS, resolvePeriod } from "@/lib/reports";
import { hrReport } from "@/lib/reports-hr";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { hrefWith } from "@/components/crm/bits";

export const metadata = { title: "HR Reports" };
type SP = { period?: string; from?: string; to?: string; branch?: string };

export default async function HrReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("reports.hr");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.period, sp.from, sp.to);
  const scope = scopeFor(user, "reports.hr");
  const branches = scope === "all" ? await db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [];
  const r = (await hrReport(user, { from, to, branchId: scope === "all" ? sp.branch : undefined }))!;
  const keep = { period: sp.period, from: sp.from, to: sp.to, branch: sp.branch };
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
  const hrs = (min: number) => (min ? `${Math.round(min / 60)}h` : "—");

  const tiles: [string, string, string?][] = [
    ["Headcount", String(r.kpis.headcount), r.kpis.probation ? `${r.kpis.probation} on probation` : undefined],
    ["Joined / left", `${r.kpis.joiners} / ${r.kpis.leavers}`, r.kpis.attrition != null ? `${pct(r.kpis.attrition)} attrition` : undefined],
    ["Attendance", pct(r.kpis.attendanceRate), `${r.kpis.leaveDays} leave day(s) taken`],
    ["Payroll (gross)", fmtPKR(r.kpis.payroll), r.payroll.length ? `${r.payroll.length} approved run(s)` : "No approved runs"],
  ];

  return (
    <>
      <PageHeader
        title="HR Reports"
        description={`${format(from, "d MMM yyyy")} – ${format(to, "d MMM yyyy")} · ${scope === "all" ? "whole company" : scope === "branch" ? "your branch" : scope === "team" ? "you and your team" : "your own record"}`}
        actions={can(user, "reports.hr", "export") && (
          <LinkButton href={hrefWith("/api/export/hr", { ...keep, from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") }, {})} variant="secondary" prefetch={false}>
            <Download className="size-4" /> Attendance CSV
          </LinkButton>
        )}
      />

      <AutoFilterForm className="mb-6 flex flex-wrap items-end gap-2">
        <select name="period" defaultValue={sp.period ?? "month"} className="input w-40">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.period === "custom" ? sp.from : ""} className="input w-40" aria-label="From (custom)" title="From (custom period)" />
        <input type="date" name="to" defaultValue={sp.period === "custom" ? sp.to : ""} className="input w-40" aria-label="To (custom)" title="To (custom period)" />
        {branches.length > 1 && (
          <select name="branch" defaultValue={sp.branch ?? ""} className="input w-40">
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </AutoFilterForm>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-medium">Headcount at month end</h2>
          <ColumnChart data={r.trend} unit="people" />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-medium">By department</h2>
          <BarList rows={r.byDepartment.map((d) => ({ ...d, display: String(d.value) }))} empty="No employees." />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-medium">Payroll cost</h2>
          <BarList rows={r.payroll.map((p) => ({ name: p.label, value: p.gross, display: fmtPKR(p.gross), sub: `net ${fmtPKR(p.net, { prefix: false })} · tax ${fmtPKR(p.tax, { prefix: false })} · ${p.count} people` }))} empty="No approved payroll in this period." />
        </Card>
        <div className="grid gap-4">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-medium">By branch</h2>
            <BarList rows={r.byBranch.map((d) => ({ ...d, display: String(d.value) }))} empty="No employees." />
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-medium">Leave taken (days)</h2>
            <BarList rows={r.leaveByType.map((d) => ({ ...d, display: String(d.value) }))} empty="No approved leave in this period." />
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-medium">Gender</h2>
            <BarList rows={r.byGender.map((d) => ({ ...d, display: String(d.value) }))} empty="No employees." />
          </Card>
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-medium">Attendance summary{to > new Date() ? " (up to today)" : ""}</h2>
        {r.attendance.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No employees.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas/60">
                <tr>{["Employee", "Department", "Present", "Late", "Half day", "Absent", "Missing out", "Leave", "Worked", "Overtime"].map((h, i) => <th key={h} className={`th ${i > 1 ? "text-right" : ""}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.attendance.map((a) => (
                  <tr key={a.id}>
                    <td className="td font-medium">{a.fullName}<span className="ml-2 text-xs text-muted">{a.code}</span></td>
                    <td className="td text-muted">{a.department?.name ?? "—"}</td>
                    <td className="td text-right tabular-nums">{a.present}</td>
                    <td className={`td text-right tabular-nums ${a.late ? "text-amber-700" : ""}`}>{a.late}</td>
                    <td className="td text-right tabular-nums">{a.half}</td>
                    <td className={`td text-right tabular-nums ${a.absent ? "text-red-600" : ""}`}>{a.absent}</td>
                    <td className="td text-right tabular-nums">{a.missing}</td>
                    <td className="td text-right tabular-nums">{a.leave}</td>
                    <td className="td text-right tabular-nums">{hrs(a.workedMin)}</td>
                    <td className="td text-right tabular-nums">{hrs(a.overtimeMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {r.leavers.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="mb-2 text-sm font-medium">Left in this period</h2>
          <ul className="text-sm">{r.leavers.map((l) => <li key={l.fullName + l.leftAt}>{l.fullName} <span className="text-muted">· {l.leftAt ? format(l.leftAt, "d MMM yyyy") : ""}</span></li>)}</ul>
        </Card>
      )}
    </>
  );
}
