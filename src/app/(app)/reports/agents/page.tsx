import Link from "@/components/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Info } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERIODS, resolvePeriod } from "@/lib/reports";
import { agentPerformance, STALE_DAYS, type AgentRow } from "@/lib/agent-reports";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Avatar } from "@/components/ui";
import { hrefWith } from "@/components/crm/bits";

export const metadata = { title: "Agent performance" };
type SP = { period?: string; from?: string; to?: string; branch?: string; scope?: string };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const hours = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} days`);

/** Super Admin only: how each agent works their leads — response time, calls, follow-up discipline, neglected leads. */
export default async function AgentPerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.period, sp.from, sp.to);
  const [rows, branches] = await Promise.all([
    agentPerformance(from, to, sp.branch || undefined),
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const keep = { period: sp.period, from: sp.from, to: sp.to };
  // Leads by stage, per agent: every lead they own now (or only the ones that came in during the period).
  const inPeriod = sp.scope === "period";
  const [stages, stageCounts] = await Promise.all([
    db.leadStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true, kind: true } }),
    db.lead.groupBy({ by: ["ownerId", "statusId"], where: { ownerId: { not: null }, ...(sp.branch ? { branchId: sp.branch } : {}), ...(inPeriod ? { createdAt: { gte: from, lte: to } } : {}) }, _count: true }),
  ]);
  const stageOwners = [...new Set(stageCounts.map((c) => c.ownerId!))];
  const ownerNames = new Map((await db.user.findMany({ where: { id: { in: stageOwners } }, select: { id: true, name: true, active: true } })).map((u) => [u.id, u]));
  const cellOf = (o: string, st: string) => stageCounts.find((c) => c.ownerId === o && c.statusId === st)?._count ?? 0;
  const rowTotal = (o: string) => stageCounts.filter((c) => c.ownerId === o).reduce((a, c) => a + c._count, 0);
  const colTotal = (st: string) => stageCounts.filter((c) => c.statusId === st).reduce((a, c) => a + c._count, 0);
  const stageRows = stageOwners.sort((a, b) => rowTotal(b) - rowTotal(a));
  const created = inPeriod ? `&created=custom&cfrom=${format(from, "yyyy-MM-dd")}&cto=${format(to, "yyyy-MM-dd")}` : "";
  const leadsHref = (o: string, st?: string) => `/crm/leads?owner=${o}${st ? `&stage=${st}` : ""}${created}`;
  const total = rows.reduce((t, r) => ({
    newLeads: t.newLeads + r.newLeads, contactedNew: t.contactedNew + r.contactedNew, neverContacted: t.neverContacted + r.neverContacted,
    calls: t.calls + r.calls, followUpsDue: t.followUpsDue + r.followUpsDue, onTime: t.onTime + r.onTime, overdueNow: t.overdueNow + r.overdueNow,
    noNextStep: t.noNextStep + r.noNextStep, closedNoContact: t.closedNoContact + r.closedNoContact,
  }), { newLeads: 0, contactedNew: 0, neverContacted: 0, calls: 0, followUpsDue: 0, onTime: 0, overdueNow: 0, noNextStep: 0, closedNoContact: 0 });

  const tiles: [string, string, string, boolean][] = [
    ["New leads contacted", `${pct(total.contactedNew, total.newLeads) ?? "—"}%`, `${total.contactedNew} of ${total.newLeads}`, (pct(total.contactedNew, total.newLeads) ?? 100) < 80],
    ["Calls logged", String(total.calls), `${format(from, "d MMM")} – ${format(to, "d MMM")}`, false],
    ["Follow-ups on time", `${pct(total.onTime, total.followUpsDue) ?? "—"}%`, `${total.onTime} of ${total.followUpsDue} due`, (pct(total.onTime, total.followUpsDue) ?? 100) < 80],
    ["Needs attention now", String(total.neverContacted + total.overdueNow), `${total.neverContacted} never contacted · ${total.overdueNow} overdue`, total.neverContacted + total.overdueNow > 0],
  ];

  return (
    <>
      <PageHeader title="Agent performance" eyebrow="Super Admin" description="How each agent is working their leads: first response, calls, follow-up discipline and neglected leads." />

      <AutoFilterForm className="mb-6 flex flex-wrap items-end gap-2">
        <select name="period" defaultValue={sp.period ?? "month"} className="input w-40">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {sp.period === "custom" && (<>
        <input type="date" name="from" defaultValue={sp.period === "custom" ? sp.from : ""} className="input w-40" aria-label="From (custom)" />
        <input type="date" name="to" defaultValue={sp.period === "custom" ? sp.to : ""} className="input w-40" aria-label="To (custom)" />
        </>)}
        {branches.length > 1 && (
          <select name="branch" defaultValue={sp.branch ?? ""} className="input w-40">
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </AutoFilterForm>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, sub, bad]) => (
          <Card key={label} className={cn("p-4", bad && "border-red-200")}>
            <p className="text-xs text-muted">{label}</p>
            <p className={cn("mt-1 text-xl font-semibold", bad && "text-red-600")}>{value}</p>
            <p className="mt-0.5 text-xs text-muted">{sub}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState title="No agents with leads" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas/60">
                <tr>
                  <th className="th">Agent</th>
                  <Th title="Open leads they own now">Open</Th>
                  <Th title="New leads in the period, and how many have been contacted">New · contacted</Th>
                  <Th title="Average time from a new lead coming in to the first logged call, meeting, visit or email">First response</Th>
                  <Th title="Open leads with no call, meeting, visit or email ever logged">Never contacted</Th>
                  <Th title="Calls logged in the period · per working day · share with a real note">Calls</Th>
                  <Th title="Planned follow-ups due in the period done by the end of their due day">On time</Th>
                  <Th title="Planned follow-ups past their time and still open">Overdue</Th>
                  <Th title="Open leads with nothing planned">No next step</Th>
                  <Th title={`Open leads with no activity for ${STALE_DAYS}+ days`}>Stale</Th>
                  <Th title="Closed as Not Interested / Not Valid in the period without a single contact logged">Closed, no contact</Th>
                  <Th title="Leads converted to deals in the period">Converted</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => <AgentLine key={r.id} r={r} href={hrefWith(`/reports/agents/${r.id}`, keep, {})} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Leads by stage</h2>
            <p className="text-xs text-muted">How many leads each agent has in every stage{inPeriod ? ", for leads that came in during the period" : " right now"}. Click a number to open those leads.</p>
          </div>
          <div className="flex rounded-lg bg-black/5 p-0.5 text-sm">
            {([["", "All their leads now"], ["period", "Came in this period"]] as const).map(([k, l]) => (
              <Link key={k || "all"} href={hrefWith("/reports/agents", { ...keep, branch: sp.branch }, k ? { scope: k } : {})} className={cn("rounded-md px-3 py-1", (sp.scope ?? "") === k ? "bg-surface font-medium shadow-xs" : "text-muted")}>{l}</Link>
            ))}
          </div>
        </div>
        {stageRows.length === 0 ? <EmptyState title="No leads" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas/60">
                <tr>
                  <th className="th sticky left-0 bg-canvas">Agent</th>
                  {stages.map((st) => <th key={st.id} className="th whitespace-nowrap text-right"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: st.color ?? "#94a3b8" }} />{st.name}</span></th>)}
                  <th className="th text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stageRows.map((o) => {
                  const u = ownerNames.get(o);
                  return (
                    <tr key={o} className="hover:bg-canvas/60">
                      <td className="td sticky left-0 whitespace-nowrap bg-surface"><Link href={hrefWith(`/reports/agents/${o}`, keep, {})} className="font-medium text-navy-900 hover:underline dark:text-ink">{u?.name ?? "—"}</Link>{u && !u.active && <span className="ml-1 text-xs text-muted">(inactive)</span>}</td>
                      {stages.map((st) => { const n = cellOf(o, st.id); return <td key={st.id} className="td text-right tabular-nums">{n ? <Link href={leadsHref(o, st.id)} className="hover:underline">{n}</Link> : <span className="text-muted/50">·</span>}</td>; })}
                      <td className="td text-right font-semibold tabular-nums"><Link href={leadsHref(o)} className="hover:underline">{rowTotal(o)}</Link></td>
                    </tr>
                  );
                })}
                <tr className="bg-canvas/60 font-semibold">
                  <td className="td sticky left-0 bg-canvas">Total</td>
                  {stages.map((st) => <td key={st.id} className="td text-right tabular-nums">{colTotal(st.id) || "·"}</td>)}
                  <td className="td text-right tabular-nums">{stageCounts.reduce((a, c) => a + c._count, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Measured from what agents log in the CRM. A call that isn&apos;t logged doesn&apos;t count, so this also shows who isn&apos;t logging their work. Red means act now; amber means watch.
      </p>
    </>
  );
}

function Th({ children, title }: { children: React.ReactNode; title: string }) {
  return <th className="th whitespace-nowrap text-right" title={title}><span className="cursor-help border-b border-dotted border-muted/50">{children}</span></th>;
}

function AgentLine({ r, href }: { r: AgentRow; href: string }) {
  const contactedPct = pct(r.contactedNew, r.newLeads);
  const onTimePct = pct(r.onTime, r.followUpsDue);
  const notesPct = pct(r.callsWithNotes, r.calls);
  const cell = (bad: boolean, warn: boolean, children: React.ReactNode) => (
    <td className={cn("td whitespace-nowrap text-right tabular-nums", bad ? "bg-red-50 font-medium text-red-700" : warn ? "bg-amber-50 text-amber-800" : "")}>{children}</td>
  );
  return (
    <tr className="hover:bg-canvas/60">
      <td className="td">
        <Link href={href} className="flex items-center gap-2 font-medium text-navy-900 hover:underline">
          <Avatar name={r.name} className="size-7 text-[10px]" />
          <span>{r.name}{r.branch && <span className="block text-xs font-normal text-muted">{r.branch}</span>}</span>
        </Link>
      </td>
      {cell(false, false, r.open)}
      {cell((contactedPct ?? 100) < 70, (contactedPct ?? 100) < 90, <>{r.newLeads} · {contactedPct ?? "—"}{contactedPct !== null && "%"}</>)}
      {cell((r.avgFirstResponseH ?? 0) > 24, (r.avgFirstResponseH ?? 0) > 4, hours(r.avgFirstResponseH))}
      {cell(r.neverContacted > 0, false, r.neverContacted)}
      {cell(r.calls === 0 && r.open > 0, (notesPct ?? 100) < 70, <>{r.calls}{r.callDays ? <span className="text-muted"> · {(r.calls / r.callDays).toFixed(1)}/day</span> : null}{notesPct !== null && <span className="block text-xs text-muted">{notesPct}% with notes</span>}</>)}
      {cell((onTimePct ?? 100) < 70, (onTimePct ?? 100) < 90, <>{onTimePct ?? "—"}{onTimePct !== null && "%"}{r.late ? <span className="block text-xs text-muted">{r.late} late</span> : null}</>)}
      {cell(r.overdueNow > 0, false, r.overdueNow)}
      {cell(false, r.noNextStep > 0, r.noNextStep)}
      {cell(false, r.stale > 0, r.stale)}
      {cell(r.closedNoContact > 0, false, r.closedNoContact)}
      {cell(false, false, r.converted)}
    </tr>
  );
}
