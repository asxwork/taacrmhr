import Link from "@/components/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { profitAndLoss, requireFinanceReports } from "@/lib/finance-reports";
import { lakh, pkr } from "@/lib/finance";
import { Card, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Profit & loss · Finance" };

/** Profit & loss by month: client payments and other income, spending by main category, and what's left. */
export default async function PnlPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requireFinanceReports();
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const { months, categories, totals } = await profitAndLoss(year);
  const now = new Date();
  const shown = months.filter((m) => year < now.getFullYear() || Number(m.key.slice(5)) <= now.getMonth() + 1);
  const cell = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  const money = (n: number) => (n ? lakh(n) : "—");
  return (
    <>
      <PageHeader title="Profit & loss" description="Money earned (client installments received and other income) minus company spending, month by month. Money the owner puts in to fund petty cash is shown separately; it isn't income."
        actions={<div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
            <Link href={`/finance/pnl?year=${year - 1}`} aria-label="Previous year" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronLeft className="size-4" /></Link>
            <span className="min-w-16 text-center text-sm font-medium">{year}</span>
            <Link href={`/finance/pnl?year=${year + 1}`} aria-label="Next year" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronRight className="size-4" /></Link>
          </div>
          <PrintButton target="[data-print-area]" fileName={`Profit-and-loss-${year}`} />
        </div>} />
      <div data-print-area>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Earned", totals.installments + totals.otherIncome, "text-emerald-700", "Installments + other income"], ["Spent", totals.expense, "text-red-600", "Company spending"], [totals.net >= 0 ? "Profit" : "Loss", Math.abs(totals.net), totals.net >= 0 ? "text-emerald-700" : "text-red-600", `${year} so far`], ["Owner funding", totals.funding, "text-navy-900", "Not counted as income"]].map(([l, v, tone, sub]) => (
            <Card key={l as string} className="p-4"><p className="text-xs text-muted">{l}</p><p className={cn("mt-1 text-xl font-semibold tabular-nums", tone as string)}>{pkr(v as number)}</p><p className="text-xs text-muted">{sub}</p></Card>
          ))}
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-canvas/60 text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2.5 text-left">&nbsp;</th>{shown.map((m) => <th key={m.key} className={cell}>{m.label}</th>)}<th className={cell}>Total</th></tr></thead>
            <tbody className="divide-y divide-line">
              <tr className="bg-emerald-50/40 font-medium"><td className="px-3 py-2">Client installments</td>{shown.map((m) => <td key={m.key} className={cell}>{money(m.installments)}</td>)}<td className={cell}>{money(totals.installments)}</td></tr>
              <tr className="bg-emerald-50/40"><td className="px-3 py-2">Other income</td>{shown.map((m) => <td key={m.key} className={cell}>{money(m.otherIncome)}</td>)}<td className={cell}>{money(totals.otherIncome)}</td></tr>
              {categories.map((c) => (
                <tr key={c}><td className="px-3 py-2 text-muted">{c}</td>{shown.map((m) => <td key={m.key} className={cell}>{money(m.expenses.get(c) ?? 0)}</td>)}<td className={cell}>{money(months.reduce((s, m) => s + (m.expenses.get(c) ?? 0), 0))}</td></tr>
              ))}
              <tr className="font-medium"><td className="px-3 py-2">Total spending</td>{shown.map((m) => <td key={m.key} className={cell}>{money(m.totalExpense)}</td>)}<td className={cell}>{money(totals.expense)}</td></tr>
              <tr className="border-t-2 border-line font-semibold"><td className="px-3 py-2.5">Profit / loss</td>{shown.map((m) => <td key={m.key} className={cn(cell, m.net < 0 ? "text-red-600" : "text-emerald-700")}>{money(m.net)}</td>)}<td className={cn(cell, totals.net < 0 ? "text-red-600" : "text-emerald-700")}>{money(totals.net)}</td></tr>
              <tr className="text-muted"><td className="px-3 py-2">Owner funding (not income)</td>{shown.map((m) => <td key={m.key} className={cell}>{money(m.funding)}</td>)}<td className={cell}>{money(totals.funding)}</td></tr>
            </tbody>
          </table>
        </Card>
        <p className="mt-3 text-xs text-muted">Income comes from installments marked paid on deals (CRM) and Finance “Money in” entries that have a category. Give a category to money in that is real income (e.g. rent received, commission) so it counts here.</p>
      </div>
    </>
  );
}
