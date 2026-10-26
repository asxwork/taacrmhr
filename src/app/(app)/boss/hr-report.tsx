import Link from "next/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { fmtPKR } from "@/lib/crm-shared";
import { hrReport } from "@/lib/reports-hr";
import { APPROVAL_TYPES } from "@/lib/hr-shared";
import type { SessionUser } from "@/lib/auth";
import { Card } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/charts";
import { DrillTiles } from "@/components/drill-tiles";

/** HR report tab: headcount, attendance, leave, payroll, leavers and pending requests for the period. */
export async function BossHrReport({ user, from, to }: { user: SessionUser; from: Date; to: Date }) {
  const [hr, departments, branches, pendingByType] = await Promise.all([
    hrReport(user, { from, to }),
    db.department.findMany({ select: { id: true, name: true } }),
    db.branch.findMany({ select: { id: true, name: true } }),
    db.approvalRequest.groupBy({ by: ["type"], where: { status: "pending" }, _count: true }),
  ]);
  if (!hr) return <Card className="p-6 text-sm text-muted">Your role has no HR report access.</Card>;
  const k = hr.kpis;
  const deptId = new Map(departments.map((d) => [d.name, d.id]));
  const branchId = new Map(branches.map((b) => [b.name, b.id]));
  const worst = [...hr.attendance].filter((r) => r.absent || r.late || r.missing).sort((a, b) => b.absent - a.absent || b.late - a.late).slice(0, 12);

  return (
    <div className="space-y-6">
      <DrillTiles tiles={[
        { key: "head", label: "Headcount", tone: "navy", value: k.headcount, sub: k.probation ? `${k.probation} on probation` : undefined, href: "/hr/employees" },
        { key: "prob", label: "On probation", tone: "violet", value: k.probation, href: "/hr/employees?status=probation" },
        { key: "join", label: "Joined", tone: "green", value: k.joiners, href: "/hr/employees" },
        { key: "left", label: "Left", tone: "red", value: k.leavers, sub: k.attrition != null ? `${(k.attrition * 100).toFixed(1)}% attrition` : undefined, href: "/hr/exits?tab=left" },
        { key: "att", label: "Attendance rate", tone: "teal", value: k.attendanceRate != null ? `${Math.round(k.attendanceRate * 100)}%` : "—", href: "/hr/attendance?view=month" },
        { key: "leave", label: "Leave taken", tone: "blue", value: k.leaveDays, sub: "days", href: "/hr/leave" },
        { key: "pay", label: "Payroll (gross)", tone: "gold", value: fmtPKR(k.payroll), href: "/hr/payroll" },
        { key: "req", label: "Pending requests", tone: "amber", value: pendingByType.reduce((s, p) => s + p._count, 0), href: "/approvals?tab=all" },
      ]} />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-medium">Headcount, last 12 months</h3>
          <ColumnChart data={hr.trend} unit="people" />
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-medium">By department</h3>
          <BarList rows={hr.byDepartment.map((d) => ({ name: d.name, value: d.value, display: String(d.value), href: deptId.has(d.name) ? `/hr/employees?dept=${deptId.get(d.name)}` : undefined }))} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-medium">By branch</h3>
          <BarList rows={hr.byBranch.map((b) => ({ name: b.name, value: b.value, display: String(b.value), href: branchId.has(b.name) ? `/hr/employees?branch=${branchId.get(b.name)}` : undefined }))} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-medium">Leave by type (days)</h3>
          <BarList rows={hr.leaveByType.map((l) => ({ name: l.name, value: l.value, display: String(l.value), href: "/hr/leave" }))} empty="No leave taken in this period." />
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-medium">Waiting for approval</h3>
          <BarList rows={pendingByType.map((p) => ({ name: APPROVAL_TYPES[p.type] ?? p.type, value: p._count, display: String(p._count), href: `/approvals?tab=all&type=${p.type}` }))} empty="Nothing pending." />
        </Card>
      </div>

      <Card className="overflow-hidden">
        <h3 className="border-b border-line px-5 py-3 text-sm font-medium">Attendance: who needs attention</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-canvas/60"><tr>{["Employee", "Present", "Late", "Absent", "No check-out", "Leave", "Late minutes", "Overtime"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {worst.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  <td className="td"><Link href={`/hr/employees/${r.id}`} className="font-medium hover:underline">{r.fullName}</Link><span className="block text-xs text-muted">{[r.department?.name, r.branch?.name].filter(Boolean).join(" · ")}</span></td>
                  <td className="td tabular-nums">{r.present}</td>
                  <td className="td tabular-nums text-amber-700">{r.late || "—"}</td>
                  <td className="td tabular-nums text-red-600">{r.absent || "—"}</td>
                  <td className="td tabular-nums">{r.missing || "—"}</td>
                  <td className="td tabular-nums">{r.leave || "—"}</td>
                  <td className="td tabular-nums">{r.lateMin ? `${r.lateMin}m` : "—"}</td>
                  <td className="td tabular-nums">{r.overtimeMin ? `${Math.round(r.overtimeMin / 60)}h` : "—"}</td>
                </tr>
              ))}
              {worst.length === 0 && <tr><td className="td text-muted" colSpan={8}>No absences or late arrivals in this period.</td></tr>}
            </tbody>
          </table>
        </div>
        <Link href="/hr/attendance/logs" className="block border-t border-line px-5 py-2.5 text-xs font-medium text-navy-900 hover:underline">Attendance logs →</Link>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="overflow-hidden">
          <h3 className="border-b border-line px-5 py-3 text-sm font-medium">Payroll by month</h3>
          <table className="w-full">
            <thead className="bg-canvas/60"><tr>{["Month", "People", "Gross", "Tax", "Net"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {hr.payroll.map((p) => (
                <tr key={p.month} className="hover:bg-canvas/60">
                  <td className="td"><Link href={`/hr/payroll/${p.month}`} className="font-medium hover:underline">{p.label}</Link></td>
                  <td className="td tabular-nums">{p.count}</td>
                  <td className="td tabular-nums">{fmtPKR(p.gross)}</td>
                  <td className="td tabular-nums text-muted">{fmtPKR(p.tax)}</td>
                  <td className="td tabular-nums font-medium">{fmtPKR(p.net)}</td>
                </tr>
              ))}
              {hr.payroll.length === 0 && <tr><td className="td text-muted" colSpan={5}>No approved payroll in this period.</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-medium">Left in this period</h3>
          {hr.leavers.length === 0 ? <p className="text-sm text-muted">Nobody left.</p> : (
            <ul className="space-y-1.5 text-sm">{hr.leavers.map((l) => <li key={l.fullName + l.leftAt}>{l.fullName} <span className="text-xs text-muted">· {l.leftAt ? format(l.leftAt, "d MMM yyyy") : ""}</span></li>)}</ul>
          )}
          <Link href="/hr/exits?tab=left" className="mt-3 block text-xs font-medium text-navy-900 hover:underline">End of employment →</Link>
        </Card>
      </div>
    </div>
  );
}
