import Link from "@/components/link";
import { addMonths, endOfMonth, format, parse, startOfMonth, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { financeChecks, pkr, type CheckRow } from "@/lib/finance";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Checks · Finance" };

/** Things worth a second look. Warnings only: many will be fine. */
export default async function Checks({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission("finance");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? parse(sp.month, "yyyy-MM", new Date()) : new Date();
  const c = await financeChecks(startOfMonth(month), endOfMonth(month));
  const nav = (d: Date) => `/finance/checks?month=${format(d, "yyyy-MM")}`;
  const groups: [string, string, CheckRow[]][] = [
    ["Unusual amounts", "Much more than this payee usually costs.", c.unusual],
    ["Possible double entries", "Same person, amount, day and description.", c.dups],
    ["Same payee paid twice in a week", "Same amount again within 7 days.", c.repeat],
    ["Round cash amounts with no bill", "Rs 5,000+ in round thousands and no proof.", c.roundCash],
    ["Sundays and holidays", "Spending on days the office is closed.", c.offDay],
    ["Entered late", "Added more than 7 days after it happened.", c.late],
  ];
  return (
    <>
      <PageHeader title="Checks" description="Warnings worth a second look. Nothing is blocked; many will be fine."
        actions={<div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          <Link href={nav(subMonths(month, 1))} aria-label="Previous month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronLeft className="size-4" /></Link>
          <span className="min-w-28 text-center text-sm font-medium">{format(month, "MMMM yyyy")}</span>
          <Link href={nav(addMonths(month, 1))} aria-label="Next month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronRight className="size-4" /></Link>
        </div>} />
      <p className="mb-4 text-sm">{c.total ? <><b>{c.total}</b> things to look at in {format(month, "MMMM")}.</> : <span className="text-emerald-700">Nothing unusual in {format(month, "MMMM")}.</span>}</p>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {groups.map(([title, hint, rows]) => (
          <Card key={title} className="overflow-hidden">
            <div className="border-b border-line px-4 py-3"><h2 className="font-semibold">{title} <span className="text-sm font-normal text-muted">{rows.length}</span></h2><p className="text-xs text-muted">{hint}</p></div>
            <ul className="divide-y divide-line text-sm">{rows.slice(0, 15).map((r) => (
              <li key={r.id + title} className="flex items-start gap-3 px-4 py-2.5"><span className="w-14 shrink-0 text-xs text-muted">{format(r.date, "d MMM")}</span><span className="min-w-0 flex-1"><Link href={`/finance/entries/${r.id}`} className="block truncate hover:underline">{r.description}</Link><span className="text-xs text-amber-700">{r.why}</span></span><span className="shrink-0 tabular-nums">{pkr(r.amount)}</span></li>
            ))}{rows.length === 0 && <li className="px-4 py-3 text-muted">None.</li>}{rows.length > 15 && <li className="px-4 py-2 text-xs text-muted">and {rows.length - 15} more</li>}</ul>
          </Card>
        ))}
      </div>
    </>
  );
}
