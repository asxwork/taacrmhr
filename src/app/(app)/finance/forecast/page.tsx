import Link from "@/components/link";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { cashForecast, requireFinanceReports } from "@/lib/finance-reports";
import { pkr } from "@/lib/finance";
import { Card, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cash forecast · Finance" };

/** Cash now, plus money coming in (client installments) minus money going out (bills, suppliers, salaries). */
export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireFinanceReports();
  const sp = await searchParams;
  const days = [30, 60, 90, 180].includes(Number(sp.days)) ? Number(sp.days) : 90;
  const f = await cashForecast(days);
  const max = Math.max(1, ...f.weeks.map((w) => Math.max(w.in, w.out)));
  return (
    <>
      <PageHeader title="Cash forecast" description="Cash in hand and in the bank now, plus client installments due, minus monthly bills, supplier bills and salaries. A plan, not a promise: late payments change it."
        actions={<div className="flex rounded-lg bg-black/5 p-0.5">{[30, 60, 90, 180].map((d) => <Link key={d} href={`/finance/forecast?days=${d}`} className={cn("rounded-md px-3 py-1.5 text-sm", d === days ? "bg-surface font-medium shadow-xs" : "text-muted")}>{d} days</Link>)}</div>} />
      {f.lowest < 0 && <p className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertTriangle className="size-4 shrink-0" /> Cash runs out: the lowest point is {pkr(f.lowest)}. Collect overdue installments or move bills.</p>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["Cash now", f.cash, ""], ["In 30 days", f.in30, ""], ["In 60 days", f.in60, ""], ["In 90 days", f.in90, ""], ["Overdue from clients", f.overdueIn, "text-amber-700"]].map(([l, v, tone]) => (
          <Card key={l as string} className="p-4"><p className="text-xs text-muted">{l}</p><p className={cn("mt-1 text-lg font-semibold tabular-nums", (v as number) < 0 ? "text-red-600" : (tone as string))}>{pkr(v as number)}</p></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 font-medium">Week by week</h2>
          <ul className="divide-y divide-line text-sm">
            {f.weeks.map((w) => (
              <li key={+w.start} className="grid grid-cols-[5.5rem_minmax(0,1fr)_7rem] items-center gap-3 px-4 py-2">
                <span className="text-xs text-muted">{format(w.start, "d MMM")}</span>
                <span className="space-y-1">
                  <span className="block h-1.5 rounded-full bg-emerald-500" style={{ width: `${(w.in / max) * 100}%` }} title={`In ${pkr(w.in)}`} />
                  <span className="block h-1.5 rounded-full bg-red-400" style={{ width: `${(w.out / max) * 100}%` }} title={`Out ${pkr(w.out)}`} />
                </span>
                <span className={cn("text-right tabular-nums", w.balance < 0 ? "font-medium text-red-600" : "")}>{pkr(w.balance)}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2 text-xs text-muted"><span className="text-emerald-600">■</span> coming in · <span className="text-red-500">■</span> going out · right: cash at the end of the week</p>
        </Card>
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 font-medium">What&apos;s expected</h2>
          {f.lines.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">Nothing due in this period.</p> : (
            <ul className="max-h-[36rem] divide-y divide-line overflow-y-auto text-sm">
              {f.lines.map((l, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-14 shrink-0 text-xs text-muted">{format(l.date, "d MMM")}</span>
                  <span className="min-w-0 flex-1">{l.href ? <Link href={l.href} className="block truncate hover:underline">{l.label}</Link> : <span className="block truncate">{l.label}</span>}<span className="text-xs text-muted">{l.source}</span></span>
                  <span className={cn("shrink-0 tabular-nums", l.kind === "in" ? "text-emerald-700" : "text-red-600")}>{l.kind === "in" ? "+" : "−"}{pkr(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
