import Link from "next/link";
import { db } from "@/lib/db";
import { fmtPKR } from "@/lib/crm-shared";
import { crmReport } from "@/lib/reports";
import { UNIT_STATUSES } from "@/lib/inventory";
import type { SessionUser } from "@/lib/auth";
import { Card } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/charts";
import { DrillTiles } from "@/components/drill-tiles";
import type { BossLinks } from "./links";

/** CRM report tab: leads, pipeline, sources, lost reasons, agents and project sales for the period. */
export async function BossCrmReport({ user, from, to, links }: { user: SessionUser; from: Date; to: Date; links: BossLinks }) {
  const [crm, projects, unitCounts, wonDeals] = await Promise.all([
    crmReport(user, { from, to }),
    db.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.unit.groupBy({ by: ["projectId", "status"], where: { listingType: "project" }, _count: true }),
    db.deal.findMany({ where: { stage: { kind: "won" }, closedAt: { gte: from, lte: to } }, select: { value: true, units: { select: { unit: { select: { projectId: true } } } } } }),
  ]);
  if (!crm) return <Card className="p-6 text-sm text-muted">Your role has no CRM report access.</Card>;
  const k = crm.kpis;

  const projectRows = projects.map((p) => {
    const n = (s: string) => unitCounts.find((u) => u.projectId === p.id && u.status === s)?._count ?? 0;
    const sold = wonDeals.filter((d) => d.units.some((u) => u.unit.projectId === p.id));
    return { ...p, total: UNIT_STATUSES.reduce((s, st) => s + n(st.value), 0), available: n("available"), hold: n("hold"), booked: n("booked"), sold: n("sold"), wonCount: sold.length, wonValue: sold.reduce((s, d) => s + (d.value ?? 0), 0) };
  }).filter((p) => p.total || p.wonCount);

  return (
    <div className="space-y-6">
      <DrillTiles tiles={[
        { key: "leads", label: "New leads", tone: "blue", value: k.newLeads, href: links.leads() },
        { key: "conv", label: "Converted to deals", tone: "green", value: k.converted, sub: k.conversionRate != null ? `${Math.round(k.conversionRate * 100)}% of new leads` : undefined, href: links.leads({ group: "converted" }) },
        { key: "junk", label: "Junk / not interested", tone: "red", value: k.junk, href: links.leads({ group: "junk" }) },
        { key: "won", label: "Deals won", tone: "gold", value: k.won, sub: fmtPKR(k.wonValue), href: links.wonDeals },
        { key: "open", label: "Open pipeline", tone: "navy", value: fmtPKR(k.openValue), sub: `${k.openCount} open deals`, href: "/crm/deals" },
        { key: "days", label: "Days to close", tone: "violet", value: k.daysToClose != null ? Math.round(k.daysToClose) : "—", sub: "average, won deals" },
      ]} />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-medium">New leads over time</h3>
          <ColumnChart data={crm.overTime} unit="leads" />
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-medium">Where leads come from</h3>
          <BarList rows={crm.bySource.map((s) => ({ name: s.name, value: s.leads, display: String(s.leads), sub: s.leads ? `${Math.round((s.converted / s.leads) * 100)}% conv.` : undefined, href: s.id ? links.leads({ source: s.id }) : undefined }))} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-medium">Open pipeline by stage</h3>
          <BarList rows={crm.pipeline.map((s) => ({ name: `${s.pipeline} · ${s.name}`, value: s.value || s.count, display: fmtPKR(s.value), sub: `${s.count} deal(s)`, href: `/crm/deals?view=list&pipeline=${s.pipelineId}&stage=${s.id}` }))} empty="No open deals." />
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-medium">Why deals were lost</h3>
          <BarList rows={crm.lostReasons.map((r) => ({ name: r.name, value: r.value, display: String(r.value) }))} empty="No lost deals in this period." />
        </Card>
      </div>

      <Card className="overflow-hidden">
        <h3 className="border-b border-line px-5 py-3 text-sm font-medium">Agents</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-canvas/60"><tr>{["Agent", "Leads", "Converted", "Calls", "Meetings & visits", "Deals won", "Won value", "Commission"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {crm.leaderboard.map((a) => (
                <tr key={a.id} className="hover:bg-canvas/60">
                  <td className="td"><Link href={links.leads({ owner: a.id })} className="font-medium hover:underline">{a.name}</Link></td>
                  <td className="td tabular-nums">{a.leads}</td>
                  <td className="td tabular-nums">{a.converted}{a.leads ? <span className="ml-1 text-xs text-muted">{Math.round((a.converted / a.leads) * 100)}%</span> : null}</td>
                  <td className="td tabular-nums">{a.calls}</td>
                  <td className="td tabular-nums">{a.meetings}</td>
                  <td className="td tabular-nums">{a.won}</td>
                  <td className="td tabular-nums font-medium">{fmtPKR(a.wonValue)}</td>
                  <td className="td tabular-nums text-muted">{fmtPKR(a.commission)}</td>
                </tr>
              ))}
              {crm.leaderboard.length === 0 && <tr><td className="td text-muted" colSpan={8}>No agent activity in this period.</td></tr>}
            </tbody>
          </table>
        </div>
        {user.isSuperAdmin && <Link href="/reports/agents" className="block border-t border-line px-5 py-2.5 text-xs font-medium text-navy-900 hover:underline">Full agent performance →</Link>}
      </Card>

      <Card className="overflow-hidden">
        <h3 className="border-b border-line px-5 py-3 text-sm font-medium">Projects & inventory</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-canvas/60"><tr>{["Project", "Units", "Available", "On hold", "Booked", "Sold", "Won in period", "Won value"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {projectRows.map((p) => (
                <tr key={p.id} className="hover:bg-canvas/60">
                  <td className="td"><Link href={`/inventory/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link></td>
                  <td className="td tabular-nums">{p.total}</td>
                  <td className="td tabular-nums"><Link href={`/inventory/projects/${p.id}?status=available`} className="hover:underline">{p.available}</Link></td>
                  <td className="td tabular-nums"><Link href={`/inventory/projects/${p.id}?status=hold`} className="hover:underline">{p.hold}</Link></td>
                  <td className="td tabular-nums"><Link href={`/inventory/projects/${p.id}?status=booked`} className="hover:underline">{p.booked}</Link></td>
                  <td className="td tabular-nums"><Link href={`/inventory/projects/${p.id}?status=sold`} className="hover:underline">{p.sold}</Link></td>
                  <td className="td tabular-nums">{p.wonCount}</td>
                  <td className="td tabular-nums font-medium">{fmtPKR(p.wonValue)}</td>
                </tr>
              ))}
              {projectRows.length === 0 && <tr><td className="td text-muted" colSpan={8}>No project stock yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
