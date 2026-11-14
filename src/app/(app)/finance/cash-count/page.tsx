import { differenceInCalendarDays, format } from "date-fns";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { balances, holderLimit, pkr } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { saveCashCount } from "../actions";

export const metadata = { title: "Cash count · Finance" };

/** End of day: count the cash in the drawer and compare with what AMS calculated. */
export default async function CashCount({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  const [holders, counts] = await Promise.all([balances(), db.finCashCount.findMany({ orderBy: { date: "desc" }, take: 40 })]);
  const hl = holderLimit(user);
  const ok = hl ? new Set((await db.finAccount.findMany({ where: hl, select: { id: true } })).map((a) => a.id)) : null;
  const cash = holders.filter((h) => h.active && h.kind === "petty" && (!ok || ok.has(h.id)));
  const users = await db.user.findMany({ where: { id: { in: counts.map((c) => c.createdById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const last = (id: string) => counts.find((c) => c.accountId === id);
  return (
    <>
      <PageHeader title="Cash count" description="At the end of the day, count the cash and enter it. A difference shows the same day, not at month end." />
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cash.map((h) => {
          const l = last(h.id); const days = l ? differenceInCalendarDays(new Date(), l.date) : null;
          return (
            <Card key={h.id} className="p-5">
              <div className="flex items-start justify-between"><div><p className="font-semibold">{h.name}</p><p className="text-xs text-muted">AMS balance <b className="text-ink">{pkr(h.balance)}</b></p></div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px]", days == null || days > 2 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>{days == null ? "Never counted" : days === 0 ? "Counted today" : `Counted ${days} day${days === 1 ? "" : "s"} ago`}</span></div>
              {can(user, "finance", "create") && (
                <ActionForm action={saveCashCount} className="mt-4 space-y-3">
                  <input type="hidden" name="accountId" value={h.id} />
                  <Field label="Cash counted (Rs)"><input name="counted" required inputMode="decimal" className="input" autoFocus={sp.h === h.id} /></Field>
                  <Field label="Reason if different"><input name="note" className="input" placeholder="e.g. Rickshaw Rs 300 not entered" /></Field>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="book" /> Book the difference (cash short / extra) as an entry</label>
                  <SubmitButton>Save count</SubmitButton>
                </ActionForm>
              )}
            </Card>
          );
        })}
      </div>
      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 font-semibold">Recent counts</h2>
        <table className="w-full text-sm">
          <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Holder</th><th className="px-4 py-2 text-right">Counted</th><th className="px-4 py-2 text-right">AMS</th><th className="px-4 py-2 text-right">Difference</th><th className="px-4 py-2">Reason</th></tr></thead>
          <tbody className="divide-y divide-line">{counts.map((c) => { const d = c.counted - c.expected; return (
            <tr key={c.id}><td className="px-4 py-2 text-muted">{format(c.date, "d MMM, h:mm a")}<span className="block text-[11px]">{users.find((u) => u.id === c.createdById)?.name}</span></td><td className="px-4 py-2">{holders.find((h) => h.id === c.accountId)?.name}</td>
              <td className="px-4 py-2 text-right tabular-nums">{pkr(c.counted)}</td><td className="px-4 py-2 text-right tabular-nums text-muted">{pkr(c.expected)}</td>
              <td className={cn("px-4 py-2 text-right font-medium tabular-nums", Math.abs(d) < 1 ? "text-emerald-700" : "text-red-600")}>{Math.abs(d) < 1 ? "✓" : `${d < 0 ? "short" : "extra"} ${pkr(Math.abs(d))}`}</td><td className="px-4 py-2 text-muted">{c.note}</td></tr>
          ); })}{counts.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-muted">No counts yet.</td></tr>}</tbody>
        </table>
      </Card>
    </>
  );
}
