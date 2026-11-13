import Link from "@/components/link";
import { addMonths, endOfMonth, format, parse, startOfMonth, startOfYear, subMonths } from "date-fns";
import { ArrowDownLeft, ChevronLeft, ChevronRight, Crown, FileWarning, TrendingDown, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { balances, categoryTree, ensureFinanceDefaults, pkr, PROOF_WHERE } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { BarList } from "@/components/charts";
import { LineChart } from "@/components/line-chart";

export const metadata = { title: "Finance" };

/** Finance dashboard: where the money went this month and this year, who spent it, and who holds what. */
export default async function FinanceDashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("finance");
  const seePersonal = can(user, "finance.personal");
  await ensureFinanceDefaults();
  const sp = await searchParams;
  const now = new Date();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? parse(sp.month, "yyyy-MM", now) : now;
  const mFrom = startOfMonth(month), mTo = endOfMonth(month), yFrom = startOfYear(month);
  const range = (from: Date, to: Date) => ({ gte: from, lte: to });
  const trendFrom = startOfMonth(subMonths(month, 11));

  const [tree, monthByCat, yearByCat, inMonth, personalMonth, byHolder, byParty, trend, holders] = await Promise.all([
    categoryTree(),
    db.finEntry.groupBy({ by: ["categoryId"], where: { kind: "expense", personal: false, date: range(mFrom, mTo) }, _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["categoryId"], where: { kind: "expense", personal: false, date: range(yFrom, mTo) }, _sum: { amount: true } }),
    db.finEntry.aggregate({ where: { kind: "in", personal: false, date: range(mFrom, mTo) }, _sum: { amount: true } }),
    db.finEntry.aggregate({ where: { kind: "expense", personal: true, date: range(mFrom, mTo) }, _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["accountId"], where: { kind: "expense", personal: false, date: range(mFrom, mTo) }, _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["party"], where: { kind: "expense", personal: false, date: range(mFrom, mTo), party: { not: null } }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } }, take: 8 }),
    db.finEntry.findMany({ where: { kind: "expense", date: range(trendFrom, mTo) }, select: { date: true, amount: true, personal: true } }),
    balances(),
  ]);
  const [noProof, noProofYear] = await Promise.all([
    db.finEntry.aggregate({ where: { ...PROOF_WHERE.missing, kind: "expense", personal: false, date: range(mFrom, mTo) }, _count: true, _sum: { amount: true } }),
    db.finEntry.count({ where: { ...PROOF_WHERE.missing, kind: "expense", personal: false, date: range(yFrom, mTo) } }),
  ]);
  const sumFor = (rows: { categoryId: string | null; _sum: { amount: number | null } }[], ids: string[]) => rows.filter((r) => r.categoryId && ids.includes(r.categoryId)).reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const spentMonth = monthByCat.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const spentYear = yearByCat.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const company = tree.filter((c) => !c.personal);
  const months = Array.from({ length: 12 }, (_, i) => startOfMonth(subMonths(month, 11 - i)));
  const mk = (d: Date) => format(d, "yyyy-MM");
  const pettyInHand = holders.filter((h) => h.kind === "petty").reduce((s, h) => s + h.balance, 0);
  const owed = holders.filter((h) => h.balance < 0 && h.kind !== "owner").reduce((s, h) => s - h.balance, 0);
  const nav = (d: Date) => `/finance?month=${format(d, "yyyy-MM")}`;

  return (
    <>
      <PageHeader title="Finance" description="Where the money went, who spent it, and who holds what."
        actions={<div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          <Link href={nav(subMonths(month, 1))} aria-label="Previous month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronLeft className="size-4" /></Link>
          <span className="min-w-28 text-center text-sm font-medium">{format(month, "MMMM yyyy")}</span>
          <Link href={nav(addMonths(month, 1))} aria-label="Next month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronRight className="size-4" /></Link>
        </div>} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([
          ["Company spent", spentMonth, format(month, "MMMM"), TrendingDown, "text-red-600", "/finance/entries?kind=expense&month=" + mk(month)],
          ["Spent this year", spentYear, `Since ${format(yFrom, "d MMM")}`, TrendingDown, "", "/finance/entries?kind=expense"],
          ["Money received", inMonth._sum.amount ?? 0, format(month, "MMMM"), ArrowDownLeft, "text-emerald-600", "/finance/entries?kind=in&month=" + mk(month)],
          ...(seePersonal ? [["Sir personal", personalMonth._sum.amount ?? 0, format(month, "MMMM"), Crown, "text-amber-600", "/finance/personal?month=" + mk(month)] as const] : []),
          ["Petty cash in hand", pettyInHand, owed ? `${pkr(owed)} owed to holders` : "All holders", Wallet, pettyInHand < 0 ? "text-red-600" : "text-navy-900", "/finance/holders"],
        ] as const).map(([label, v, sub, Icon, tone, href]) => (
          <Link key={label} href={href} className="rounded-xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="flex items-center gap-1.5 text-xs text-muted"><Icon className="size-3.5" /> {label}</p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone)}>{pkr(v)}</p>
            <p className="text-[11px] text-muted">{sub}</p>
          </Link>
        ))}
      </div>

      {noProof._count > 0 && (
        <Link href={`/finance/entries?proof=missing&kind=expense&month=${mk(month)}`} className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100">
          <FileWarning className="size-5 shrink-0" />
          <span className="flex-1"><b>{noProof._count} expenses ({pkr(noProof._sum.amount ?? 0)}) in {format(month, "MMMM")} have no bill or receipt.</b> {noProofYear} this year. Open the list and attach the proof.</span>
          <ChevronRight className="size-4" />
        </Link>
      )}

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">Summary by category</h2><span className="text-xs text-muted">Company spending only</span></div>
          <table className="w-full text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2">Category</th><th className="px-4 py-2 text-right">{format(month, "MMM")}</th><th className="px-4 py-2 text-right">This year</th></tr></thead>
            <tbody>
              {company.map((c) => {
                const ids = [c.id, ...c.subs.map((s) => s.id)];
                const m = sumFor(monthByCat, ids), y = sumFor(yearByCat, ids);
                return [
                  <tr key={c.id} className="border-t border-line bg-canvas/30 font-semibold">
                    <td className="px-4 py-2"><Link href={`/finance/entries?cat=${c.id}&month=${mk(month)}`} className="hover:underline">{c.name}</Link></td>
                    <td className="px-4 py-2 text-right tabular-nums">{m ? pkr(m) : "—"}</td><td className="px-4 py-2 text-right tabular-nums">{y ? pkr(y) : "—"}</td>
                  </tr>,
                  ...c.subs.map((s) => {
                    const sm = sumFor(monthByCat, [s.id]), sy = sumFor(yearByCat, [s.id]);
                    return (
                      <tr key={s.id} className="text-muted">
                        <td className="py-1.5 pl-8 pr-4">{s.name}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{sm ? pkr(sm) : "—"}</td><td className="px-4 py-1.5 text-right tabular-nums">{sy ? pkr(sy) : "—"}</td>
                      </tr>
                    );
                  }),
                ];
              })}
              <tr className="border-t-2 border-ink/70 font-semibold"><td className="px-4 py-2.5">Total</td><td className="px-4 py-2.5 text-right tabular-nums">{pkr(spentMonth)}</td><td className="px-4 py-2.5 text-right tabular-nums">{pkr(spentYear)}</td></tr>
            </tbody>
          </table>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Who spent · {format(month, "MMMM")}</h2>
            <BarList rows={byHolder.map((r) => ({ name: holders.find((h) => h.id === r.accountId)?.name ?? "—", value: r._sum.amount ?? 0, display: pkr(r._sum.amount ?? 0), href: `/finance/entries?holder=${r.accountId}&month=${mk(month)}` })).sort((a, b) => b.value - a.value)} empty="Nothing spent this month." />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Paid to most · {format(month, "MMMM")}</h2>
            <BarList rows={byParty.map((r) => ({ name: r.party ?? "—", value: r._sum.amount ?? 0, display: pkr(r._sum.amount ?? 0) }))} empty="Nothing spent this month." />
          </Card>
        </div>
      </div>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-semibold">Spending by month</h2>
        <LineChart labels={months.map((d) => format(d, "MMM yy"))} format={(v) => `${Math.round(v / 1000)}k`}
          series={[
            { name: "Company", color: "#c2410c", values: months.map((d) => trend.filter((t) => !t.personal && mk(t.date) === mk(d)).reduce((s, t) => s + t.amount, 0)) },
            ...(seePersonal ? [{ name: "Sir personal", color: "#d4a94a", values: months.map((d) => trend.filter((t) => t.personal && mk(t.date) === mk(d)).reduce((s, t) => s + t.amount, 0)) }] : []),
          ]} />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">Money holders</h2><Link href="/finance/holders" className="text-sm font-medium text-navy-900 hover:underline">All →</Link></div>
        <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-3 lg:grid-cols-5">
          {holders.filter((h) => h.active).map((h) => (
            <Link key={h.id} href={`/finance/entries?holder=${h.id}`} className="p-4 hover:bg-canvas/50">
              <p className="truncate text-sm font-medium">{h.name}</p>
              <p className={cn("text-lg font-semibold tabular-nums", h.balance < 0 ? "text-red-600" : "")}>{pkr(h.balance)}</p>
            </Link>
          ))}
          {holders.length === 0 && <p className="col-span-full p-4 text-sm text-muted">No money holders yet. Add them on Money holders, or import your Excel sheet.</p>}
        </div>
      </Card>
    </>
  );
}
