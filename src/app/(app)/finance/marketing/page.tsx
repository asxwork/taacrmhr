import Link from "@/components/link";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { marketingReturn, requireFinanceReports } from "@/lib/finance-reports";
import { pkr } from "@/lib/finance";
import { Card, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Marketing cost per lead · Finance" };

const RANGES = [["1", "This month"], ["3", "Last 3 months"], ["6", "Last 6 months"], ["12", "Last 12 months"]] as const;

/** Which lead source pays off: marketing spending vs leads and won deals per source. */
export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireFinanceReports();
  const sp = await searchParams;
  const m = RANGES.some(([v]) => v === sp.m) ? Number(sp.m) : 3;
  const from = startOfMonth(subMonths(new Date(), m - 1)), to = endOfMonth(new Date());
  const r = await marketingReturn(from, to);
  const per = (a: number, b: number) => (a && b ? pkr(a / b) : "—");
  return (
    <>
      <PageHeader title="Marketing cost per lead" description={`${format(from, "MMM yyyy")} – ${format(to, "MMM yyyy")}. Spending under Marketing (or mentioning Facebook, Instagram, Zameen, Graana…) matched to the lead source it paid for, against the leads and won deals from that source.`}
        actions={<div className="flex max-w-full overflow-x-auto rounded-lg bg-black/5 p-0.5">{RANGES.map(([v, l]) => <Link key={v} href={`/finance/marketing?m=${v}`} className={cn("shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm", Number(v) === m ? "bg-surface font-medium shadow-xs" : "text-muted")}>{l}</Link>)}</div>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Marketing spend", pkr(r.totalSpend)], ["Leads", String(r.totalLeads)], ["Cost per lead", per(r.totalSpend, r.totalLeads)], ["Cost per won deal", per(r.totalSpend, r.totalDeals)]].map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-lg font-semibold tabular-nums">{v}</p></Card>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Source</th><th className="px-4 py-2.5 text-right">Spend</th><th className="px-4 py-2.5 text-right">Leads</th><th className="px-4 py-2.5 text-right">Cost / lead</th><th className="px-4 py-2.5 text-right">Won deals</th><th className="px-4 py-2.5 text-right">Cost / deal</th><th className="px-4 py-2.5 text-right">Deal value</th></tr></thead>
          <tbody className="divide-y divide-line">
            {r.rows.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2.5 font-medium">{s.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{s.spend ? pkr(s.spend) : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums"><Link href={`/crm/leads?source=${s.id}`} className="hover:underline">{s.leads}</Link></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{per(s.spend, s.leads)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{s.deals}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{per(s.spend, s.deals)}</td>
                <td className={cn("px-4 py-2.5 text-right tabular-nums", s.value > s.spend && s.spend ? "text-emerald-700" : "")}>{s.value ? pkr(s.value) : "—"}</td>
              </tr>
            ))}
            {r.unmatchedTotal > 0 && <tr className="text-muted"><td className="px-4 py-2.5">Marketing not linked to a source</td><td className="px-4 py-2.5 text-right tabular-nums">{pkr(r.unmatchedTotal)}</td><td colSpan={5} className="px-4 py-2.5 text-xs">Add the source name (e.g. “Meta”, “Zameen”) to the description or tags so it counts above.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
