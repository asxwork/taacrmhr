import Link from "@/components/link";
import { addMonths, differenceInCalendarMonths, endOfMonth, format, parse, startOfMonth, startOfYear, subMonths } from "date-fns";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Copy, FileText, Landmark, Megaphone, ShieldCheck, Users, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { balances, categoryTree, financeChecks, findDuplicates, lakh, pkr } from "@/lib/finance";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { verifyEntry } from "../actions";

export const metadata = { title: "Boss view · Finance" };
const isImage = (p: string) => /\.(jpe?g|png|webp|gif)$/i.test(p);

/** The owner's finance dashboard: cash position, change vs last month, proof score, biggest spends with bills, alerts. */
export default async function BossFinance({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("finance.boss");
  const sp = await searchParams;
  const now = new Date();
  // Opens on the last complete month, so numbers aren't half a month.
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? parse(sp.month, "yyyy-MM", now) : subMonths(now, 1);
  const mFrom = startOfMonth(month), mTo = endOfMonth(month), pFrom = startOfMonth(subMonths(month, 1)), pTo = endOfMonth(subMonths(month, 1)), yFrom = startOfYear(month);
  const co = { status: "approved", kind: "expense", personal: false } as const;
  const range = (a: Date, b: Date) => ({ gte: a, lte: b });
  const mk = format(month, "yyyy-MM");

  const [tree, holders, thisCat, lastCat, yearRows, monthRows, budgets, payroll, leads, won, pending] = await Promise.all([
    categoryTree(),
    balances(),
    db.finEntry.groupBy({ by: ["categoryId"], where: { ...co, date: range(mFrom, mTo) }, _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["categoryId"], where: { ...co, date: range(pFrom, pTo) }, _sum: { amount: true } }),
    db.finEntry.findMany({ where: { ...co, date: range(yFrom, mTo) }, select: { id: true, accountId: true, amount: true, date: true, description: true, receipt: true, verifiedAt: true, _count: { select: { proofs: true } } } }),
    db.finEntry.findMany({ where: { ...co, date: range(mFrom, mTo) }, include: { account: true, category: { include: { parent: true } }, proofs: { take: 1, orderBy: { createdAt: "asc" } }, _count: { select: { proofs: true } } }, orderBy: { amount: "desc" }, take: 10 }),
    db.finBudget.findMany(),
    db.payslip.aggregate({ where: { run: { month: mk } }, _sum: { net: true }, _count: true }),
    db.lead.count({ where: { createdAt: range(mFrom, mTo) } }),
    db.deal.count({ where: { closedAt: range(mFrom, mTo), stage: { kind: "won" } } }),
    db.finEntry.aggregate({ where: { status: "pending" }, _count: true, _sum: { amount: true } }),
  ]);

  const sumIds = (rows: { categoryId: string | null; _sum: { amount: number | null } }[], ids: string[]) => rows.filter((r) => r.categoryId && ids.includes(r.categoryId)).reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const total = (rows: { _sum: { amount: number | null } }[]) => rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const spent = total(thisCat), spentLast = total(lastCat);
  const change = spentLast ? ((spent - spentLast) / spentLast) * 100 : 0;
  const ytd = yearRows.reduce((s, r) => s + r.amount, 0);
  const monthsGone = differenceInCalendarMonths(month, yFrom) + 1;
  const avg = ytd / monthsGone;
  const hasProof = (r: { receipt: string | null; _count: { proofs: number } }) => !!r.receipt || r._count.proofs > 0;
  const proofAmt = (rows: typeof yearRows) => { const t = rows.reduce((s, r) => s + r.amount, 0); return t ? Math.round((rows.filter(hasProof).reduce((s, r) => s + r.amount, 0) / t) * 100) : 100; };
  const monthYearRows = yearRows.filter((r) => r.date >= mFrom);
  const proofMonth = proofAmt(monthYearRows), proofYear = proofAmt(yearRows);
  const bigNoProof = yearRows.filter((r) => r.amount >= 50000 && !hasProof(r)).sort((a, b) => b.amount - a.amount);
  const dups = findDuplicates(monthYearRows);
  const checks = await financeChecks(mFrom, mTo);

  const cashInHand = holders.filter((h) => h.kind !== "owner" && !h.branch && h.balance > 0).reduce((s, h) => s + h.balance, 0);
  const branchCash = holders.filter((h) => h.branch && h.balance > 0).reduce((s, h) => s + h.balance, 0);
  const owedToStaff = holders.filter((h) => h.kind !== "owner" && h.balance < 0).reduce((s, h) => s - h.balance, 0);
  const byOwner = holders.filter((h) => h.kind === "owner").reduce((s, h) => s + Math.max(0, -h.balance), 0);
  const mainIds = (c: (typeof tree)[number]) => [c.id, ...c.subs.map((x) => x.id)];
  const salaryIds = tree.flatMap((c) => c.subs.filter((s) => /salar/i.test(s.name)).map((s) => s.id));
  const salariesFinance = sumIds(thisCat, salaryIds);
  const marketing = tree.find((c) => /marketing/i.test(c.name));
  const marketingSpend = marketing ? sumIds(thisCat, mainIds(marketing)) : 0;
  const nav = (d: Date) => `/finance/boss?month=${format(d, "yyyy-MM")}`;
  const canVerify = can(user, "finance", "approve");

  const Kpi = ({ label, value, sub, icon: Icon, tone, href }: { label: string; value: string; sub?: React.ReactNode; icon: typeof Wallet; tone?: string; href?: string }) => {
    const body = <><p className="flex items-center gap-1.5 text-xs text-muted"><Icon className="size-3.5" /> {label}</p><p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</p>{sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}</>;
    return href ? <Link href={href} className="rounded-xl border border-line bg-surface p-4 transition hover:shadow-md">{body}</Link> : <div className="rounded-xl border border-line bg-surface p-4">{body}</div>;
  };

  return (
    <>
      <PageHeader title="Boss view" description="Company money at a glance: where it is, where it went, and whether there is a bill for it."
        actions={<div className="flex flex-wrap items-center gap-2"><a href={`/print/finance/${mk}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-canvas">Monthly report (PDF)</a><div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          <Link href={nav(subMonths(month, 1))} aria-label="Previous month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronLeft className="size-4" /></Link>
          <span className="min-w-28 text-center text-sm font-medium">{format(month, "MMMM yyyy")}</span>
          <Link href={nav(addMonths(month, 1))} aria-label="Next month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronRight className="size-4" /></Link>
        </div></div>} />

      {/* Cash position */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Where the money is now</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cash in hand (head office)" value={lakh(cashInHand)} icon={Wallet} href="/finance/holders" sub="Petty cash and accounts" />
        <Kpi label="With Bahadurabad / branches" value={lakh(branchCash)} icon={Landmark} tone={branchCash ? "text-amber-700" : ""} href="/finance/holders" sub="Given, not yet shown as spent" />
        <Kpi label="Company owes staff" value={lakh(owedToStaff)} icon={Users} tone={owedToStaff ? "text-red-600" : ""} href="/finance/holders" sub="They paid from their own pocket" />
        <Kpi label="Paid by owner" value={lakh(byOwner)} icon={Landmark} href="/finance/holders" sub="Your own money put in" />
      </div>

      {/* Spending */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Spending · {format(month, "MMMM")}</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Company spent" value={lakh(spent)} icon={change > 0 ? ArrowUpRight : ArrowDownRight} tone="text-ink" href={`/finance/entries?kind=expense&month=${mk}`}
          sub={spentLast ? <span className={change > 0 ? "text-red-600" : "text-emerald-700"}>{change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% vs {format(pFrom, "MMMM")} ({lakh(spentLast)})</span> : "No data last month"} />
        <Kpi label="This year so far" value={lakh(ytd)} icon={FileText} sub={`Avg ${lakh(avg)} / month · on track for ${lakh(avg * 12)} this year`} />
        <Kpi label="Proof score" value={`${proofMonth}%`} icon={ShieldCheck} tone={proofMonth >= 90 ? "text-emerald-700" : proofMonth >= 60 ? "text-amber-700" : "text-red-600"} href={`/finance/entries?proof=missing&kind=expense&month=${mk}`}
          sub={`of ${format(month, "MMMM")} spending has a bill · ${proofYear}% this year`} />
        <Kpi label="Waiting for your approval" value={String(pending._count)} icon={AlertTriangle} tone={pending._count ? "text-amber-700" : ""} href="/finance/approvals" sub={pending._count ? lakh(pending._sum.amount ?? 0) : "Nothing waiting"} />
      </div>

      {/* Alerts */}
      {(bigNoProof.length > 0 || dups.length > 0) && (
        <Card className="mb-6 border-red-200 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-red-700"><AlertTriangle className="size-4" /> Needs your attention{checks.total > 0 && <Link href={`/finance/checks?month=${mk}`} className="ml-auto text-sm font-medium text-navy-900 hover:underline">{checks.total} checks for {format(month, "MMMM")} →</Link>}</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {bigNoProof.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">{bigNoProof.length} expenses of Rs 50,000+ this year without a bill</p>
                <ul className="space-y-1 text-sm">{bigNoProof.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex justify-between gap-3"><Link href={`/finance/entries/${r.id}`} className="truncate hover:underline">{format(r.date, "d MMM")} · {r.description}</Link><span className="shrink-0 tabular-nums">{pkr(r.amount)}</span></li>
                ))}</ul>
                {bigNoProof.length > 6 && <Link href="/finance/entries?proof=missing&kind=expense" className="mt-1 inline-block text-xs font-medium text-navy-900 hover:underline">All {bigNoProof.length} →</Link>}
              </div>
            )}
            {dups.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Copy className="size-3.5" /> {dups.length} possible double entries in {format(month, "MMMM")}</p>
                <p className="mb-1.5 text-xs text-muted">Same person, amount, day and description. May be fine, worth a look.</p>
                <ul className="space-y-1 text-sm">{dups.slice(0, 6).map((g) => (
                  <li key={g[0]!.id} className="flex justify-between gap-3"><span className="truncate">{format(g[0]!.date, "d MMM")} · {g.map((r) => <Link key={r.id} href={`/finance/entries/${r.id}`} className="mr-2 hover:underline">{r.description}</Link>)}</span><span className="shrink-0 tabular-nums">{g.length} × {pkr(g[0]!.amount)}</span></li>
                ))}</ul>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        {/* Category vs last month vs budget */}
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-3"><h2 className="font-semibold">By category</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2">Category</th><th className="px-4 py-2 text-right">{format(month, "MMM")}</th><th className="px-4 py-2 text-right">{format(pFrom, "MMM")}</th><th className="px-4 py-2 text-right">Change</th><th className="px-4 py-2">Budget</th></tr></thead>
            <tbody className="divide-y divide-line">
              {tree.filter((c) => !c.personal).map((c) => {
                const m = sumIds(thisCat, mainIds(c)), l = sumIds(lastCat, mainIds(c));
                const b = budgets.find((x) => x.categoryId === c.id)?.amount;
                const pct = b ? Math.round((m / b) * 100) : null;
                if (!m && !l && !b) return null;
                const d = l ? ((m - l) / l) * 100 : null;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium"><Link href={`/finance/entries?cat=${c.id}&month=${mk}`} className="hover:underline">{c.name}</Link></td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{lakh(m)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-muted">{lakh(l)}</td>
                    <td className={cn("px-4 py-2.5 text-right text-xs tabular-nums", d == null ? "text-muted" : d > 10 ? "text-red-600" : d < -10 ? "text-emerald-700" : "text-muted")}>{d == null ? "new" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}%`}</td>
                    <td className="w-36 px-4 py-2.5">{pct == null ? <span className="text-xs text-muted">—</span> : (
                      <span className="block"><span className="block h-1.5 overflow-hidden rounded-full bg-canvas"><span className={cn("block h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, pct)}%` }} /></span><span className="text-[11px] text-muted">{pct}% of {lakh(b!)}</span></span>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Checks against other apps · {format(month, "MMMM")}</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3"><dt><span className="flex items-center gap-1.5 font-medium"><Users className="size-4 text-violet-600" /> Salaries</span><span className="text-xs text-muted">Paid in Finance vs HR payroll net</span></dt>
                <dd className="text-right tabular-nums"><span className="block">{lakh(salariesFinance)} <span className="text-xs text-muted">finance</span></span><span className="block">{payroll._count ? lakh(payroll._sum.net ?? 0) : "—"} <span className="text-xs text-muted">payroll</span></span>
                  {payroll._count > 0 && salariesFinance > 0 && <span className="text-[11px] text-amber-700">Both recorded: make sure the same salary isn&apos;t counted twice</span>}</dd></div>
              <div className="flex items-start justify-between gap-3 border-t border-line pt-3"><dt><span className="flex items-center gap-1.5 font-medium"><Megaphone className="size-4 text-sky-600" /> Marketing</span><span className="text-xs text-muted">Spend vs new CRM leads and deals won</span></dt>
                <dd className="text-right tabular-nums"><span className="block">{lakh(marketingSpend)} · {leads} leads · {won} won</span><span className="block text-xs text-muted">{leads ? `${pkr(marketingSpend / leads)} per lead` : "No leads"}{won ? ` · ${lakh(marketingSpend / won)} per deal` : ""}</span></dd></div>
            </dl>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3"><h2 className="font-semibold">Money holders</h2></div>
            <ul className="divide-y divide-line text-sm">{holders.filter((h) => h.active).map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-2.5"><Link href={`/finance/entries?holder=${h.id}`} className="hover:underline">{h.name}{h.branch && <span className="text-xs text-muted"> · {h.branch}</span>}</Link>
                <span className={cn("tabular-nums", h.kind === "owner" ? "text-muted" : h.balance < 0 ? "text-red-600" : "")}>{h.kind === "owner" ? `${lakh(Math.max(0, -h.balance))} put in` : h.balance < 0 ? `owed ${lakh(-h.balance)}` : lakh(h.balance)}</span></li>
            ))}</ul>
          </Card>
        </div>
      </div>

      {/* Biggest spends with bills */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">10 biggest expenses · {format(month, "MMMM")}</h2><Link href={`/finance/entries?kind=expense&month=${mk}`} className="text-sm font-medium text-navy-900 hover:underline">All →</Link></div>
        <ul className="divide-y divide-line">{monthRows.map((e) => {
          const proof = e.proofs[0]?.path ?? e.receipt;
          const n = e._count.proofs + (e.receipt ? 1 : 0);
          return (
            <li key={e.id} className="flex items-center gap-4 px-4 py-3">
              <Link href={`/finance/entries/${e.id}`} className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {proof ? isImage(proof) ? <img src={fileUrl(proof)} alt="" className="size-full object-cover" /> : <FileText className="size-6 text-muted" /> : <span className="text-center text-[10px] leading-tight text-red-600">No<br />bill</span>}
              </Link>
              <div className="min-w-0 flex-1"><Link href={`/finance/entries/${e.id}`} className="block truncate font-medium hover:underline">{e.description}</Link><p className="truncate text-xs text-muted">{format(e.date, "d MMM")} · {e.account.name} → {e.party || "—"} · {e.category ? (e.category.parent?.name ?? e.category.name) : ""}</p></div>
              <span className="text-right font-semibold tabular-nums">{pkr(e.amount)}</span>
              <span className="w-32 text-right">{e.verifiedAt ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck className="size-3.5" /> Checked</span>
                : n && canVerify ? <form action={verifyEntry}><input type="hidden" name="id" value={e.id} /><button className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Mark checked</button></form>
                : <Link href={`/finance/entries/${e.id}`} className="text-xs text-red-600 hover:underline">Ask for bill</Link>}</span>
            </li>
          );
        })}{monthRows.length === 0 && <li className="p-4 text-sm text-muted">No expenses in {format(month, "MMMM")}.</li>}</ul>
      </Card>
    </>
  );
}
