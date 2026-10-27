import { format, startOfMonth } from "date-fns";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { agentStats, campaignStats, outcomeStats } from "@/lib/call-reports";
import { Card, PageHeader } from "@/components/ui";
import { BarList } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ReportTable } from "@/components/hr/report-table";

export const metadata = { title: "Call Reports" };

/** Calls → Reports: per agent, per outcome and per campaign for a date range, with CSV export. */
export default async function CallReports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePermission("calls", "create");
  const sp = await searchParams;
  const parse = (v: string | undefined, d: Date) => { const x = v ? new Date(`${v}T00:00:00`) : d; return Number.isNaN(x.getTime()) ? d : x; };
  const from = parse(sp.from, startOfMonth(new Date()));
  const to = parse(sp.to, new Date());
  const end = new Date(to.getTime() + 86_400_000);
  const [agents, outcomes, campaigns] = await Promise.all([agentStats(from, end), outcomeStats(from, end), campaignStats(from, end)]);
  const range = { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  return (
    <>
      <PageHeader title="Call Reports" actions={
        <div className="flex flex-wrap gap-2">
          <AutoFilterForm className="flex gap-2">
            <input type="date" name="from" defaultValue={range.from} className="input h-9 w-40" aria-label="From" />
            <input type="date" name="to" defaultValue={range.to} className="input h-9 w-40" aria-label="To" />
          </AutoFilterForm>
          <a href={`/api/calls/export?from=${range.from}&to=${range.to}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface"><Download className="size-4" /> CSV</a>
        </div>
      } />
      <Card className="mb-6 overflow-x-auto">
        <ReportTable head={["Agent", "Calls", "Reached", "Reach %", "Interested", "Callbacks", "WhatsApp", "Talk min"]}
          rows={agents.map((a) => [a.name, a.calls, a.reached, `${a.reachRate}%`, a.interested, a.callbacks, a.whatsapp, a.talkMin])} empty="No calls in this period." />
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Outcomes</h2><BarList rows={outcomes.map((o) => ({ name: o.label, value: o.count, display: String(o.count) }))} /></Card>
        <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Campaigns</h2><BarList rows={campaigns.map((c) => ({ name: c.name, value: c.calls, display: `${c.calls} calls · ${c.interested} interested`, href: c.id ? `/calls/campaigns/${c.id}` : undefined }))} /></Card>
      </div>
    </>
  );
}
