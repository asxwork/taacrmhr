import Link from "@/components/link";
import { addMonths, endOfMonth, format, parse, startOfMonth, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { categoryTree, companyExpense, lakh, pkr } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { saveBudgets } from "../actions";

export const metadata = { title: "Budgets · Finance" };

/** Monthly budget per category with how much is used. Alerts go out at 80% and 100%. */
export default async function Budgets({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("finance.settings");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? parse(sp.month, "yyyy-MM", new Date()) : new Date();
  const [tree, budgets, spent, avg3] = await Promise.all([
    categoryTree(),
    db.finBudget.findMany(),
    db.finEntry.groupBy({ by: ["categoryId"], where: companyExpense({ date: { gte: startOfMonth(month), lte: endOfMonth(month) } }), _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["categoryId"], where: companyExpense({ date: { gte: startOfMonth(subMonths(month, 3)), lte: endOfMonth(subMonths(month, 1)) } }), _sum: { amount: true } }),
  ]);
  const sum = (rows: typeof spent, ids: string[]) => rows.filter((r) => r.categoryId && ids.includes(r.categoryId)).reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const cats = tree.filter((c) => !c.personal);
  const canEdit = can(user, "finance.settings", "edit");
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = cats.filter((c) => budgets.some((b) => b.categoryId === c.id)).reduce((s, c) => s + sum(spent, [c.id, ...c.subs.map((x) => x.id)]), 0);
  const nav = (d: Date) => `/finance/budgets?month=${format(d, "yyyy-MM")}`;
  return (
    <>
      <PageHeader title="Budgets" description="How much each category may spend per month. You and the approvers get an alert at 80% and when it goes over."
        actions={<div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          <Link href={nav(subMonths(month, 1))} aria-label="Previous month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronLeft className="size-4" /></Link>
          <span className="min-w-28 text-center text-sm font-medium">{format(month, "MMMM yyyy")}</span>
          <Link href={nav(addMonths(month, 1))} aria-label="Next month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronRight className="size-4" /></Link>
        </div>} />
      {totalBudget > 0 && <p className="mb-4 text-sm">Budgeted categories: <b className="tabular-nums">{lakh(totalSpent)}</b> spent of <b className="tabular-nums">{lakh(totalBudget)}</b> ({Math.round((totalSpent / totalBudget) * 100)}%)</p>}
      <Card className="overflow-hidden">
        <ActionForm action={saveBudgets}>
          <table className="w-full text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5 text-right">Avg last 3 months</th><th className="px-4 py-2.5">Monthly budget (Rs)</th><th className="px-4 py-2.5">Used in {format(month, "MMMM")}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {cats.map((c) => {
                const ids = [c.id, ...c.subs.map((x) => x.id)];
                const b = budgets.find((x) => x.categoryId === c.id)?.amount ?? 0;
                const s = sum(spent, ids), a = sum(avg3, ids) / 3;
                const pct = b ? Math.round((s / b) * 100) : 0;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{a ? pkr(a) : "—"}</td>
                    <td className="px-4 py-3">{canEdit ? <input name={`b_${c.id}`} inputMode="decimal" defaultValue={b || ""} placeholder={a ? `e.g. ${Math.round(a / 1000) * 1000}` : "No budget"} className="input w-40" /> : b ? pkr(b) : "—"}</td>
                    <td className="w-72 px-4 py-3">{b ? (
                      <span className="block"><span className="block h-2 overflow-hidden rounded-full bg-canvas"><span className={cn("block h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, pct)}%` }} /></span>
                        <span className={cn("text-xs", pct >= 100 ? "font-medium text-red-600" : "text-muted")}>{pkr(s)} · {pct}%{pct >= 100 ? ` · over by ${pkr(s - b)}` : ` · ${pkr(b - s)} left`}</span></span>
                    ) : <span className="text-xs text-muted">{s ? `${pkr(s)} spent, no budget` : "—"}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {canEdit && <div className="border-t border-line p-4"><SubmitButton>Save budgets</SubmitButton></div>}
        </ActionForm>
      </Card>
    </>
  );
}
