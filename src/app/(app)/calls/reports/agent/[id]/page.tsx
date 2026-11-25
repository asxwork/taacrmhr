import { notFound, redirect } from "next/navigation";
import Link from "@/components/link";
import { format, startOfMonth } from "date-fns";
import { History } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { isCallSupervisor, outcome } from "@/lib/calls";
import { db } from "@/lib/db";
import { personReport } from "@/lib/call-agent-report";
import { fmtPhone } from "@/lib/crm-shared";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { BarList } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { HourChart } from "@/components/calls/day-report";

export const metadata = { title: "Agent calling report" };
const mmss = (s: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");

/** Calls → Reports → one agent: totals, every day, campaigns, outcomes, hours and the latest calls. Supervisors see anyone; agents themselves. */
export default async function AgentReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; campaign?: string }> }) {
  const viewer = await requirePermission("calls");
  const { id } = await params;
  const supervisor = isCallSupervisor(viewer);
  if (!supervisor && id !== viewer.id) redirect(`/calls/reports/agent/${viewer.id}`);
  const agent = await db.user.findUnique({ where: { id }, select: { id: true, name: true, title: true } });
  if (!agent) notFound();
  const sp = await searchParams;
  const parse = (v: string | undefined, d: Date) => { const x = v ? new Date(`${v}T00:00:00+05:00`) : d; return Number.isNaN(x.getTime()) ? d : x; };
  const from = parse(sp.from, startOfMonth(new Date()));
  const to = parse(sp.to, new Date());
  const end = new Date(+parse(format(to, "yyyy-MM-dd"), to) + 86_400_000);
  const range = { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  const usedIds = (await db.callLog.groupBy({ by: ["campaignId"], where: { agentId: id } })).map((g) => g.campaignId).filter((x): x is string => !!x);
  const campaignList = await db.callCampaign.findMany({ where: { id: { in: usedIds } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const campaignId = sp.campaign && campaignList.some((c) => c.id === sp.campaign) ? sp.campaign : undefined;
  const r = await personReport(id, from, end, { campaignId });
  const t = r.total;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ from: range.from, to: range.to, ...(campaignId ? { campaign: campaignId } : {}), ...extra }).toString();

  return (
    <>
      <PageHeader eyebrow={supervisor ? "Calling report · person by person" : "My calling report"} title={agent.name} description={`${format(from, "d MMM yyyy")} – ${format(to, "d MMM yyyy")}${campaignId ? ` · ${campaignList.find((c) => c.id === campaignId)?.name}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AutoFilterForm className="flex flex-wrap gap-2">
              <input type="date" name="from" defaultValue={range.from} className="input h-9 w-40" aria-label="From" />
              <input type="date" name="to" defaultValue={range.to} className="input h-9 w-40" aria-label="To" />
              <select name="campaign" defaultValue={campaignId ?? ""} className="input h-9 w-52" aria-label="Campaign">
                <option value="">All campaigns</option>
                {campaignList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </AutoFilterForm>
            <Link href={`/calls/history?${qs({ agent: id })}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><History className="size-4" /> Every call</Link>
          </div>
        } />
      {supervisor && <p className="-mt-4 mb-5 text-sm"><Link href={`/calls/reports?tab=agents&${qs({})}`} className="text-muted hover:text-ink hover:underline">← All agents</Link></p>}
      <DrillTiles className="mb-6 lg:grid-cols-6 xl:grid-cols-6" tiles={[
        { key: "c", label: "Calls", tone: "navy", value: t.calls, sub: `${t.perDay}/day · ${t.days} day(s)` },
        { key: "r", label: "Connected", tone: "green", value: t.reached, sub: `${t.reachPct}% of calls` },
        { key: "i", label: "Interested", tone: "gold", value: t.interested, sub: `${t.interestedPct}% of connected` },
        { key: "cb", label: "Callbacks", tone: "sky", value: t.callbacks },
        { key: "na", label: "No answer", tone: "amber", value: t.notAnswered + t.voicemail + t.switchedOff, sub: `${t.switchedOff} switched off` },
        { key: "tk", label: "Talk time", tone: "slate", value: `${t.talkMin} min`, sub: `avg call ${mmss(t.avgSec)}` },
      ]} />
      {t.calls + t.whatsapp === 0 ? <Card><EmptyState title="No calls in this period" description="Change the dates or the campaign." /></Card> : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2"><h2 className="mb-3 text-sm font-semibold">Calls by hour</h2><HourChart hours={r.hours} /></Card>
            <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Outcomes</h2><BarList rows={r.outcomes.map((o) => ({ name: o.label, value: o.n, display: String(o.n) }))} /></Card>
          </div>
          <Card className="mb-6 overflow-x-auto">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Day by day</h2>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr>{["Day", "Calls", "Connected", "Interested", "Callbacks", "No answer", "Switched off", "Wrong", "Not interested", "WhatsApp", "Talk", "Avg", "Hours"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {r.days.map((d) => (
                  <tr key={d.date} className="hover:bg-canvas/60">
                    <td className="whitespace-nowrap px-3 py-2"><Link href={`/calls/history?from=${d.date}&to=${d.date}&agent=${id}${campaignId ? `&campaign=${campaignId}` : ""}`} className="font-medium hover:underline">{format(new Date(`${d.date}T12:00:00`), "EEE d MMM")}</Link></td>
                    <td className="px-3 py-2 font-medium tabular-nums">{d.calls}</td>
                    <td className="px-3 py-2 tabular-nums">{d.reached} <span className="text-xs text-muted">{d.reachPct}%</span></td>
                    <td className="px-3 py-2 tabular-nums">{d.interested}</td>
                    <td className="px-3 py-2 tabular-nums">{d.callbacks}</td>
                    <td className="px-3 py-2 tabular-nums">{d.notAnswered + d.voicemail}</td>
                    <td className="px-3 py-2 tabular-nums">{d.switchedOff}</td>
                    <td className="px-3 py-2 tabular-nums">{d.wrong}</td>
                    <td className="px-3 py-2 tabular-nums">{d.notInterested}</td>
                    <td className="px-3 py-2 tabular-nums">{d.whatsapp}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{d.talkMin} min</td>
                    <td className="px-3 py-2 tabular-nums">{mmss(d.avgSec)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{d.first}–{d.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="mb-6 overflow-x-auto">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Campaigns</h2>
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr>{["Campaign", "Calls", "Connected", "Interested", "Callbacks", "No answer", "Wrong", "Talk"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {r.campaigns.map((c) => (
                  <tr key={c.id || "none"}>
                    <td className="px-3 py-2 font-medium">{c.id && supervisor ? <Link href={`/calls/campaigns/${c.id}`} className="hover:underline">{c.name}</Link> : c.name}</td>
                    <td className="px-3 py-2 tabular-nums">{c.calls}</td>
                    <td className="px-3 py-2 tabular-nums">{c.reached} <span className="text-xs text-muted">{c.reachPct}%</span></td>
                    <td className="px-3 py-2 tabular-nums">{c.interested}</td>
                    <td className="px-3 py-2 tabular-nums">{c.callbacks}</td>
                    <td className="px-3 py-2 tabular-nums">{c.notAnswered + c.voicemail + c.switchedOff}</td>
                    <td className="px-3 py-2 tabular-nums">{c.wrong}</td>
                    <td className="px-3 py-2 tabular-nums">{c.talkMin} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="overflow-x-auto">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Latest calls</h2><Link href={`/calls/history?${qs({ agent: id })}`} className="text-xs font-medium hover:underline">See every call</Link></div>
            <table className="w-full min-w-[640px] text-sm">
              <tbody className="divide-y divide-line">
                {r.latest.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-muted">{format(l.startedAt, "d MMM, h:mm a")}</td>
                    <td className="px-3 py-2"><span className="font-medium">{l.target?.name ?? "—"}</span><span className="block font-mono text-xs text-muted">{fmtPhone(l.phone)}</span></td>
                    <td className="px-3 py-2"><Badge tone={outcome(l.outcome)?.reached ? "green" : "neutral"}>{outcome(l.outcome)?.label ?? l.outcome}</Badge>{l.target?.leadId && <Link href={`/crm/leads/${l.target.leadId}`} className="ml-1.5 text-xs font-medium text-navy-900 hover:underline dark:text-ink">lead</Link>}</td>
                    <td className="px-3 py-2 tabular-nums text-xs">{mmss(l.durationSec ?? 0)}</td>
                    <td className="max-w-sm truncate px-3 py-2 text-xs text-muted">{l.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
