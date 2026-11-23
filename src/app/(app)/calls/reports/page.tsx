import Link from "@/components/link";
import { format, startOfMonth } from "date-fns";
import { Download, FileText } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { isCallSupervisor } from "@/lib/calls";
import { db } from "@/lib/db";
import { agentStats, campaignStats, hourStats, outcomeStats } from "@/lib/call-reports";
import { callReportText, callTotalsText, pkDay, type DaySummary } from "@/lib/call-daily";
import { CopyText } from "@/components/calls/copy-text";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { BarList } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ReportTable } from "@/components/hr/report-table";
import { HourChart } from "@/components/calls/day-report";
import { cn } from "@/lib/utils";

export const metadata = { title: "Call Reports" };

const mmss = (s: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");

/** Calls → Reports: the period overview (agents, hours, outcomes, campaigns) and the end-of-shift daily reports. */
export default async function CallReports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; tab?: string; agent?: string }> }) {
  const viewer = await requirePermission("calls");
  const sp = await searchParams;
  const tab = sp.tab === "daily" ? "daily" : "overview";
  // Agents see only their own numbers; supervisors see everyone (lib/calls isCallSupervisor).
  const supervisor = isCallSupervisor(viewer);
  const only = supervisor ? undefined : viewer.id;
  const parse = (v: string | undefined, d: Date) => { const x = v ? new Date(`${v}T00:00:00`) : d; return Number.isNaN(x.getTime()) ? d : x; };
  const from = parse(sp.from, startOfMonth(new Date()));
  const to = parse(sp.to, new Date());
  const end = new Date(to.getTime() + 86_400_000);
  const range = { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  const tabLink = (t: string) => `/calls/reports?tab=${t}&from=${range.from}&to=${range.to}`;

  const header = (
    <>
      <PageHeader title="Call Reports" actions={
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <AutoFilterForm className="flex min-w-0 flex-1 gap-2">
            <input type="hidden" name="tab" value={tab} />
            <input type="date" name="from" defaultValue={range.from} className="input h-9 min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="From" />
            <input type="date" name="to" defaultValue={range.to} className="input h-9 min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="To" />
          </AutoFilterForm>
          {tab === "overview" && <a href={`/api/calls/export?from=${range.from}&to=${range.to}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface"><Download className="size-4" /> CSV</a>}
        </div>
      } />
      <div className="mb-5 flex w-fit rounded-lg bg-black/5 p-0.5">
        {([["overview", "Overview"], ["daily", "Daily reports"]] as const).map(([t, l]) => (
          <Link key={t} href={tabLink(t)} className={cn("rounded-md px-3 py-1.5 text-sm", t === tab ? "bg-surface font-medium shadow-xs" : "text-muted")}>{l}</Link>
        ))}
      </div>
    </>
  );

  if (tab === "daily") {
    const reports = await db.callDailyReport.findMany({
      where: { date: { gte: range.from, lte: range.to }, ...(supervisor ? (sp.agent ? { agentId: sp.agent } : {}) : { agentId: viewer.id }) },
      orderBy: [{ date: "desc" }, { sentAt: "desc" }], take: 300,
    });
    const names = new Map((await db.user.findMany({ where: { id: { in: [...new Set(reports.map((r) => r.agentId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const notes = new Map((await db.callDayNote.findMany({ where: { agentId: { in: [...new Set(reports.map((r) => r.agentId))] }, date: { in: [...new Set(reports.map((r) => r.date))] } } })).map((n) => [`${n.agentId}|${n.date}`, n.feedback]));
    const today = pkDay().date;
    return (
      <>
        {header}
        <p className="mb-4 text-sm text-muted">Made automatically for every calling agent when their shift ends, and sent to them, their manager and the call supervisors.
          {" "}<Link href={`/calls/reports/daily/live?date=${today}`} className="font-medium text-ink underline">See my day so far</Link></p>
        {reports.length > 0 && (() => {
          // The latest day in the list, written the way the team shares it: each agent, then the totals.
          const day = reports[0]!.date;
          const ofDay = reports.filter((r) => r.date === day).map((r) => ({ r, s: JSON.parse(r.data) as DaySummary }));
          const text = [...ofDay.map(({ r, s }) => callReportText(s, notes.get(`${r.agentId}|${day}`), names.get(r.agentId) ?? "")), callTotalsText(ofDay.map((x) => x.s))].join("\n\n");
          return <Card className="mb-4 p-5"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{format(new Date(`${day}T12:00:00`), "EEE d MMM")} · copy for WhatsApp</p><CopyText text={text} label="Copy all" /></Card>;
        })()}
        {!reports.length ? <Card><EmptyState title="No daily reports in this period" description="The first ones arrive after today’s shifts end." /></Card> : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                {["Date", ...(supervisor ? ["Agent"] : []), "Calls", "Connected", "Qualified", "Callbacks", "Talk", "Avg call", "Hours", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {reports.map((r) => {
                  const s = JSON.parse(r.data) as DaySummary;
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/60">
                      <td className="whitespace-nowrap px-4 py-2.5">{format(new Date(`${r.date}T12:00:00`), "EEE d MMM")}</td>
                      {supervisor && <td className="px-4 py-2.5"><Link href={`/calls/reports?tab=daily&from=${range.from}&to=${range.to}&agent=${r.agentId}`} className="hover:underline">{names.get(r.agentId) ?? "—"}</Link></td>}
                      <td className="px-4 py-2.5 tabular-nums font-medium">{s.calls}</td>
                      <td className="px-4 py-2.5 tabular-nums">{s.reached} <span className="text-xs text-muted">{s.reachPct}%</span></td>
                      <td className="px-4 py-2.5 tabular-nums">{s.interested}</td>
                      <td className="px-4 py-2.5 tabular-nums">{s.callbacks}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{s.talkMin} min</td>
                      <td className="px-4 py-2.5 tabular-nums">{mmss(s.avgSec)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">{s.first ? `${s.first}–${s.last}` : "—"}</td>
                      <td className="px-4 py-2.5 text-right"><Link href={`/calls/reports/daily/${r.id}`} className="inline-flex items-center gap-1 text-xs font-medium hover:underline"><FileText className="size-3.5" /> Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </>
    );
  }

  const [agents, outcomes, campaigns, hours] = await Promise.all([agentStats(from, end, only), outcomeStats(from, end, only), campaignStats(from, end, only), hourStats(from, end, only)]);
  const today = pkDay().date;
  return (
    <>
      {header}
      <Card className="mb-6 overflow-x-auto">
        <ReportTable head={["Agent", "Calls", "Reached", "Reach %", "Interested", "Callbacks", "WhatsApp", "Talk min", "Avg call", "Today"]}
          rows={agents.map((a) => [a.name, a.calls, a.reached, `${a.reachRate}%`, a.interested, a.callbacks, a.whatsapp, a.talkMin, mmss(a.avgSec),
            supervisor || a.id === viewer.id ? <Link key={a.id} href={`/calls/reports/daily/live?agent=${a.id}&date=${today}`} className="text-xs font-medium underline">Live day</Link> : ""])} empty="No calls in this period." />
      </Card>
      <Card className="mb-6 p-5"><h2 className="mb-3 text-sm font-semibold">Calls by hour</h2><HourChart hours={hours} /></Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Outcomes</h2><BarList rows={outcomes.map((o) => ({ name: o.label, value: o.count, display: String(o.count) }))} /></Card>
        <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Campaigns</h2><BarList rows={campaigns.map((c) => ({ name: c.name, value: c.calls, display: `${c.calls} calls · ${c.interested} interested`, href: c.id ? `/calls/campaigns/${c.id}` : undefined }))} /></Card>
      </div>
    </>
  );
}
