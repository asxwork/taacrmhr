import Link from "@/components/link";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { pkr } from "@/lib/finance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { recordPayroll } from "../actions";

export const metadata = { title: "Payroll link · Finance" };

/** HR payroll months next to the salaries already in Finance, so salaries are counted once. */
export default async function PayrollLink() {
  const user = await requirePermission("finance");
  const [runs, holders, salCats] = await Promise.all([
    db.payrollRun.findMany({ where: { status: { in: ["approved", "paid"] } }, orderBy: { month: "desc" }, take: 18, include: { _count: { select: { payslips: true } } } }),
    db.finAccount.findMany({ where: { active: true, kind: { not: "owner" } }, orderBy: { name: "asc" } }),
    db.finCategory.findMany({ where: { name: { contains: "Salar" } }, select: { id: true } }),
  ]);
  const totals = await db.payslip.groupBy({ by: ["runId"], where: { runId: { in: runs.map((r) => r.id) } }, _sum: { net: true } });
  const linked = await db.finEntry.findMany({ where: { sourceType: "payroll", sourceId: { in: runs.map((r) => r.id) } } });
  const handEntered = async (month: string) => {
    const [y, m] = month.split("-").map(Number);
    return (await db.finEntry.aggregate({ where: { status: "approved", kind: "expense", sourceType: null, categoryId: { in: salCats.map((c) => c.id) }, date: { gte: new Date(y!, m! - 1, 1), lte: new Date(y!, m!, 0, 23, 59, 59) } }, _sum: { amount: true } }))._sum.amount ?? 0;
  };
  const rows = await Promise.all(runs.map(async (r) => ({ r, net: totals.find((t) => t.runId === r.id)?._sum.net ?? 0, hand: await handEntered(r.month), link: linked.find((l) => l.sourceId === r.id) })));
  const canAdd = can(user, "finance", "create");
  return (
    <>
      <PageHeader title="Payroll link" description="HR payroll next to the salaries already entered in Finance. Record only what isn't in Finance yet, so salaries are never counted twice." />
      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState title="No approved payroll yet" description="Approved payroll months from HR appear here." /> : (
          <table className="w-full text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Month</th><th className="px-4 py-2.5 text-right">HR payroll (net)</th><th className="px-4 py-2.5 text-right">Salaries already in Finance</th><th className="px-4 py-2.5">Record the rest</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map(({ r, net, hand, link }) => {
              const rest = Math.max(0, Math.round(net - hand));
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3"><Link href={`/hr/payroll/${r.month}`} className="font-medium hover:underline">{r.month}</Link><span className="block text-xs text-muted">{r._count.payslips} payslips · {r.status}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{pkr(net)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{hand ? pkr(hand) : "—"}{hand > 0 && <span className="block text-[11px] text-amber-700">entered by hand (e.g. cash salaries)</span>}</td>
                  <td className="px-4 py-3">{link ? <Link href={`/finance/entries/${link.id}`} className="text-emerald-700 hover:underline">Recorded {pkr(link.amount)} →</Link>
                    : rest === 0 ? <span className="text-xs text-muted">Already fully in Finance</span>
                    : canAdd && (
                      <ActionForm action={recordPayroll} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="amount" defaultValue={rest} inputMode="decimal" aria-label="Amount" className="input w-32 py-1.5" />
                        <select name="accountId" required aria-label="Paid from" className="input w-auto py-1.5"><option value="">Paid from…</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
                        <SubmitButton>Record</SubmitButton>
                      </ActionForm>
                    )}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}
