import Link from "@/components/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { color as stageColor } from "@/lib/crm-shared";
import { fmtPKR } from "@/lib/crm-shared";
import { agentPerformance } from "@/lib/agent-reports";
import { personReport } from "@/lib/call-agent-report";
import { Card, EmptyState } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { AutoFilterForm } from "@/components/auto-filter-form";

const hours = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} days`);

/** Boss dashboard → Agent detail: pick an agent and see everything about them for the period. */
export async function BossAgentReport({ from, to, agentId, keep }: { from: Date; to: Date; agentId?: string; keep: Record<string, string | undefined> }) {
  // Everyone who owns leads or deals, or made calls in the last 90 days.
  const [leadOwners, dealOwners, callers] = await Promise.all([
    db.lead.groupBy({ by: ["ownerId"], where: { ownerId: { not: null } } }),
    db.deal.groupBy({ by: ["ownerId"], where: { ownerId: { not: null } } }),
    db.callLog.groupBy({ by: ["agentId"], where: { startedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } } }),
  ]);
  const ids = [...new Set([...leadOwners.map((r) => r.ownerId!), ...dealOwners.map((r) => r.ownerId!), ...callers.map((r) => r.agentId)])];
  const people = await db.user.findMany({ where: { id: { in: ids }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, title: true, branch: { select: { name: true } } } });
  const agent = people.find((p) => p.id === agentId);

  const picker = (
    <AutoFilterForm className="mb-6 flex flex-wrap items-center gap-2">
      {Object.entries({ ...keep, tab: "agent" }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <select name="agent" defaultValue={agentId ?? ""} className="input h-10 w-72 text-base font-medium" aria-label="Agent">
        <option value="">Choose an agent…</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.branch ? ` · ${p.branch.name}` : ""}</option>)}
      </select>
      {agent && <span className="text-sm text-muted">{[agent.title, agent.branch?.name].filter(Boolean).join(" · ")}</span>}
    </AutoFilterForm>
  );
  if (!agent) return <>{picker}<Card><EmptyState title="Choose an agent" description="See their leads by stage, calls, follow-ups, closed deals and commission for the period." /></Card></>;

  const [row, calls, stages, nowBy, newBy, deals, contactActs] = await Promise.all([
    agentPerformance(from, to).then((rows) => rows.find((r) => r.id === agent.id)),
    personReport(agent.id, from, new Date(+to + 1)),
    db.leadStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
    db.lead.groupBy({ by: ["statusId"], where: { ownerId: agent.id }, _count: true }),
    db.lead.groupBy({ by: ["statusId"], where: { ownerId: agent.id, createdAt: { gte: from, lte: to } }, _count: true }),
    db.deal.findMany({ where: { ownerId: agent.id, stage: { kind: "won" }, closedAt: { gte: from, lte: to } }, orderBy: { closedAt: "desc" }, select: { id: true, title: true, value: true, commissionPct: true, commissionAmount: true, agentSharePct: true, unitNo: true, projectName: true, community: true, closedAt: true, contact: { select: { name: true } } } }),
    db.activity.groupBy({ by: ["type"], where: { OR: [{ ownerId: agent.id }, { createdById: agent.id }], type: { in: ["meeting", "visit", "call"] }, doneAt: { gte: from, lte: to } }, _count: true }),
  ]);
  const commissionOf = (d: (typeof deals)[number]) => d.commissionAmount ?? (d.value && d.commissionPct ? (d.value * d.commissionPct) / 100 : 0);
  const wonValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);
  const commission = deals.reduce((s, d) => s + commissionOf(d), 0);
  const agentShare = deals.reduce((s, d) => s + (d.agentSharePct != null ? (commissionOf(d) * d.agentSharePct) / 100 : 0), 0);
  const act = (t: string) => contactActs.find((a) => a.type === t)?._count ?? 0;
  const stageRows = stages.map((st) => ({ ...st, now: nowBy.find((r) => r.statusId === st.id)?._count ?? 0, came: newBy.find((r) => r.statusId === st.id)?._count ?? 0 })).filter((r) => r.now || r.came);
  const maxNow = Math.max(1, ...stageRows.map((r) => r.now));
  const range = `from=${format(from, "yyyy-MM-dd")}&to=${format(to, "yyyy-MM-dd")}`;
  const created = `&created=custom&cfrom=${format(from, "yyyy-MM-dd")}&cto=${format(to, "yyyy-MM-dd")}`;

  return (
    <>
      {picker}
      <div className="space-y-6">
        <DrillTiles className="lg:grid-cols-4 xl:grid-cols-4" tiles={[
          { key: "open", label: "Open leads now", tone: "navy", value: row?.open ?? 0, href: `/crm/leads?owner=${agent.id}` },
          { key: "new", label: "New leads in period", tone: "blue", value: row?.newLeads ?? 0, sub: row?.newLeads ? `${Math.round(((row.contactedNew ?? 0) / row.newLeads) * 100)}% contacted · first response ${hours(row.avgFirstResponseH)}` : undefined, href: `/crm/leads?owner=${agent.id}${created}` },
          { key: "won", label: "Deals closed", tone: "gold", value: deals.length, sub: fmtPKR(wonValue), href: `/crm/deals?owner=${agent.id}` },
          { key: "comm", label: "Commission", tone: "green", value: fmtPKR(commission), sub: agentShare ? `agent's share ${fmtPKR(agentShare)}` : undefined },
          { key: "calls", label: "Calls logged (CRM)", tone: "sky", value: act("call"), sub: row?.calls ? `${row.callsWithNotes} with notes` : undefined },
          { key: "dialer", label: "Dialer calls", tone: "violet", value: calls.total.calls, sub: calls.total.calls ? `${calls.total.reachPct}% connected · ${calls.total.interested} interested` : undefined, href: `/calls/reports/agent/${agent.id}?${range}` },
          { key: "meet", label: "Meetings & site visits", tone: "slate", value: act("meeting") + act("visit") },
          { key: "risk", label: "Needs attention", tone: "red", value: (row?.neverContacted ?? 0) + (row?.overdueNow ?? 0), sub: `${row?.neverContacted ?? 0} never contacted · ${row?.overdueNow ?? 0} overdue`, href: `/reports/agents/${agent.id}` },
        ]} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="overflow-hidden">
            <h3 className="border-b border-line px-5 py-3 text-sm font-medium">Leads by stage</h3>
            {stageRows.length === 0 ? <p className="p-5 text-sm text-muted">No leads.</p> : (
              <table className="w-full text-sm">
                <thead className="bg-canvas/60 text-left text-xs text-muted"><tr><th className="px-5 py-2 font-medium">Stage</th><th className="px-3 py-2 text-right font-medium">Now</th><th className="px-5 py-2 text-right font-medium">Came in this period</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {stageRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-2"><span className="inline-flex items-center gap-2"><span className={`size-2.5 rounded-full ${stageColor(r.color ?? "slate").dot}`} />{r.name}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums"><span className="inline-flex items-center justify-end gap-2"><span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-canvas sm:block"><span className={`block h-full rounded-full ${stageColor(r.color ?? "slate").bar}`} style={{ width: `${(r.now / maxNow) * 100}%` }} /></span><Link href={`/crm/leads?owner=${agent.id}&stage=${r.id}`} className="w-8 font-medium hover:underline">{r.now}</Link></span></td>
                      <td className="px-5 py-2 text-right tabular-nums">{r.came ? <Link href={`/crm/leads?owner=${agent.id}&stage=${r.id}${created}`} className="hover:underline">{r.came}</Link> : "·"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card className="overflow-hidden">
            <h3 className="border-b border-line px-5 py-3 text-sm font-medium">Follow-up discipline</h3>
            <dl className="grid grid-cols-2 gap-px bg-line text-sm">
              {([
                ["Follow-ups due", row?.followUpsDue ?? 0], ["Done on time", row?.followUpsDue ? `${row.onTime} (${Math.round((row.onTime / row.followUpsDue) * 100)}%)` : "—"],
                ["Overdue now", row?.overdueNow ?? 0], ["No next step", row?.noNextStep ?? 0],
                ["Stale (no activity)", row?.stale ?? 0], ["Closed without contact", row?.closedNoContact ?? 0],
                ["Converted in period", row?.converted ?? 0], ["Never contacted", row?.neverContacted ?? 0],
              ] as [string, string | number][]).map(([k, v]) => <div key={k} className="bg-surface px-5 py-3"><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 font-semibold tabular-nums">{v}</dd></div>)}
            </dl>
            <Link href={`/reports/agents/${agent.id}`} className="block border-t border-line px-5 py-2.5 text-xs font-medium text-navy-900 hover:underline dark:text-ink">Full agent performance →</Link>
          </Card>
        </div>

        <Card className="overflow-x-auto">
          <h3 className="border-b border-line px-5 py-3 text-sm font-medium">Deals closed in the period</h3>
          {deals.length === 0 ? <p className="p-5 text-sm text-muted">No closed deals in this period.</p> : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs text-muted"><tr>{["Deal", "Property", "Value", "Commission", "Agent share", "Closed"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2"><Link href={`/crm/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link><span className="block text-xs text-muted">{d.contact?.name ?? "—"}</span></td>
                    <td className="px-4 py-2">{[d.unitNo, d.projectName].filter(Boolean).join(" · ") || "—"}{d.community && <span className="block text-xs text-muted">{d.community}</span>}</td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fmtPKR(d.value)}</td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{commissionOf(d) ? fmtPKR(commissionOf(d)) : "—"}{d.commissionPct ? <span className="text-xs text-muted"> · {d.commissionPct}%</span> : null}</td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{d.agentSharePct != null ? `${fmtPKR((commissionOf(d) * d.agentSharePct) / 100)} · ${d.agentSharePct}%` : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{d.closedAt ? format(d.closedAt, "d MMM yyyy") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
