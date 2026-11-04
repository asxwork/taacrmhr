import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { fmtPKR } from "@/lib/crm-shared";
import { PERIODS, resolvePeriod } from "@/lib/reports";
import { Card, PageHeader } from "@/components/ui";
import { BarList } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Lost-reason analysis" };

type SP = { period?: string; from?: string; to?: string };
type Row = { name: string; value: number; display: string; sub?: string };

/** Count rows by a key, biggest first. */
function tally<T>(items: T[], key: (x: T) => string, amount?: (x: T) => number): Row[] {
  const m = new Map<string, { n: number; v: number }>();
  for (const x of items) { const k = key(x); const e = m.get(k) ?? { n: 0, v: 0 }; e.n++; e.v += amount?.(x) ?? 0; m.set(k, e); }
  return [...m].map(([name, e]) => ({ name, value: e.n, display: String(e.n), sub: amount && e.v ? fmtPKR(e.v) : undefined })).sort((a, b) => b.value - a.value).slice(0, 12);
}

/** Reports → Lost reasons: why deals are lost and leads closed — by reason, source and agent. */
export default async function LostReasonsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("reports.lost");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.period, sp.from, sp.to);
  const scope = (await scopeWhere(user, "reports.lost"))!;
  const [deals, leads, wonCount] = await Promise.all([
    db.deal.findMany({ where: { ...scope, stage: { kind: "lost" }, closedAt: { gte: from, lte: to } }, select: { lostReason: true, value: true, source: { select: { name: true } }, owner: { select: { name: true } } } }),
    db.lead.findMany({ where: { ...scope, status: { kind: "junk" }, OR: [{ statusChangedAt: { gte: from, lte: to } }, { statusChangedAt: null, updatedAt: { gte: from, lte: to } }] }, select: { status: { select: { name: true } }, source: { select: { name: true } }, owner: { select: { name: true } } } }),
    db.deal.count({ where: { ...scope, stage: { kind: "won" }, closedAt: { gte: from, lte: to } } }),
  ]);
  const lostValue = deals.reduce((a, d) => a + (d.value ?? 0), 0);
  const winRate = wonCount + deals.length ? Math.round((wonCount / (wonCount + deals.length)) * 100) : null;
  const reason = (d: (typeof deals)[number]) => d.lostReason?.trim() || "No reason given";

  const block = (title: string, rows: Row[], empty: string) => (
    <Card className="p-5"><h2 className="mb-4 font-medium">{title}</h2><BarList rows={rows} empty={empty} /></Card>
  );
  return (
    <>
      <PageHeader title="Lost-reason analysis" description={`${format(from, "d MMM yyyy")} – ${format(to, "d MMM yyyy")} · why deals are lost and leads are closed`} />
      <AutoFilterForm className="mb-6 flex flex-wrap items-end gap-2">
        <select name="period" defaultValue={sp.period ?? "month"} className="input w-40">{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
        <input type="date" name="from" defaultValue={sp.period === "custom" ? sp.from : ""} className="input w-40" aria-label="From (custom)" />
        <input type="date" name="to" defaultValue={sp.period === "custom" ? sp.to : ""} className="input w-40" aria-label="To (custom)" />
      </AutoFilterForm>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Deals lost", String(deals.length)], ["Value lost", fmtPKR(lostValue)], ["Win rate", winRate == null ? "—" : `${winRate}%`], ["Leads closed", String(leads.length)]].map(([k, v]) => (
          <Card key={k} className="p-4"><p className="text-xs text-muted">{k}</p><p className="text-2xl font-semibold tabular-nums">{v}</p></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {block("Deals lost — by reason", tally(deals, reason, (d) => d.value ?? 0), "No lost deals in this period.")}
        {block("Leads closed — by reason", tally(leads, (l) => l.status.name), "No closed leads in this period.")}
        {block("Lost deals — by source", tally(deals, (d) => d.source?.name ?? "No source"), "No lost deals in this period.")}
        {block("Closed leads — by source", tally(leads, (l) => l.source?.name ?? "No source"), "No closed leads in this period.")}
        {block("Lost deals — by agent", tally(deals, (d) => d.owner?.name ?? "Unassigned"), "No lost deals in this period.")}
        {block("Closed leads — by agent", tally(leads, (l) => l.owner?.name ?? "Unassigned"), "No closed leads in this period.")}
      </div>
    </>
  );
}
