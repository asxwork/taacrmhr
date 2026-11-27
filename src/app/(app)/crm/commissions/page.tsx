import Link from "@/components/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission, scopeFor, scopeWhere } from "@/lib/permissions";
import { fmtPKR } from "@/lib/crm-shared";
import { usersInScope } from "@/lib/crm";
import { agentShare, commissionState, STATE_LABEL, type CommissionState } from "@/lib/commission-tracker";
import { cn, fmtDate } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { hrefWith } from "@/components/crm/bits";
import { markCommission } from "./actions";

export const metadata = { title: "Commissions" };

type SP = { state?: string; owner?: string; year?: string };
const TONE: Record<CommissionState, string> = { pending: "bg-amber-50 text-amber-800", received: "bg-sky-50 text-sky-800", paid: "bg-emerald-50 text-emerald-800" };

/** Each agent's commission on closed deals: pending, received from the developer, paid to the agent. */
export default async function CommissionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("crm.deals");
  const sp = await searchParams;
  const manager = scopeFor(user, "crm.deals", "edit") === "all";
  const scope = (await scopeWhere(user, "crm.deals"))!;
  const year = Number(sp.year) || null;
  const where: Prisma.DealWhereInput = {
    ...scope, stage: { kind: "won" }, commissionAmount: { not: null },
    ...(sp.owner && { ownerId: sp.owner }),
    ...(year && { closedAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } }),
  };
  const [all, owners] = await Promise.all([
    db.deal.findMany({ where, orderBy: [{ closedAt: "desc" }, { updatedAt: "desc" }], take: 1000, select: { id: true, title: true, value: true, closedAt: true, commissionAmount: true, agentSharePct: true, commissionReceivedAt: true, agentPaidAt: true, agentPaidAmount: true, projectName: true, unitNo: true, owner: { select: { id: true, name: true } } } }),
    usersInScope(user, "crm.deals", "view"),
  ]);
  const rows = all.map((d) => ({ d, share: agentShare(d), state: commissionState(d) }));
  const shown = sp.state ? rows.filter((r) => r.state === sp.state) : rows;
  const sum = (st: CommissionState) => rows.filter((r) => r.state === st).reduce((s, r) => s + (st === "paid" ? r.d.agentPaidAmount ?? r.share ?? 0 : r.share ?? 0), 0);
  const keep = { state: sp.state, owner: sp.owner, year: sp.year };
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2];

  return (
    <>
      <PageHeader title="Commissions" description={manager ? "Agents' commission on closed deals. Mark it received when the developer pays, then paid when the agent gets it." : "Your commission on closed deals and whether it's been paid."} />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["pending", "received", "paid"] as const).map((st) => (
          <Link key={st} href={hrefWith("/crm/commissions", keep, { state: sp.state === st ? undefined : st })} className={cn("rounded-xl border p-4", sp.state === st ? "border-navy-900" : "border-line bg-white hover:bg-canvas")}>
            <p className="text-xs text-muted">{STATE_LABEL[st]}</p>
            <p className="mt-1 text-xl font-semibold">{fmtPKR(sum(st))}</p>
            <p className="text-xs text-muted">{rows.filter((r) => r.state === st).length} deal(s)</p>
          </Link>
        ))}
      </div>
      <AutoFilterForm className="mb-4 flex flex-wrap gap-2">
        {sp.state && <input type="hidden" name="state" value={sp.state} />}
        {owners.length > 1 && (
          <select name="owner" defaultValue={sp.owner ?? ""} className="rounded-lg border border-line px-3 py-2 text-sm">
            <option value="">All agents</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <select name="year" defaultValue={sp.year ?? ""} className="rounded-lg border border-line px-3 py-2 text-sm">
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </AutoFilterForm>
      {shown.length === 0 ? <EmptyState title="No commissions here" description="Closed deals with a commission amount (from the commission form) show here." /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs text-muted"><tr><th className="px-3 py-2">Deal</th><th className="px-3 py-2">Agent</th><th className="px-3 py-2">Closed</th><th className="px-3 py-2 text-right">Commission</th><th className="px-3 py-2 text-right">Agent share</th><th className="px-3 py-2">Status</th>{manager && <th className="px-3 py-2" />}</tr></thead>
            <tbody className="divide-y divide-line">
              {shown.map(({ d, share, state }) => (
                <tr key={d.id}>
                  <td className="px-3 py-2"><Link href={`/crm/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link><span className="block text-xs text-muted">{[d.projectName, d.unitNo && `Unit ${d.unitNo}`].filter(Boolean).join(" · ")}</span></td>
                  <td className="px-3 py-2">{d.owner?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{d.closedAt ? fmtDate(d.closedAt) : "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtPKR(d.commissionAmount)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtPKR(state === "paid" ? d.agentPaidAmount ?? share : share)}{d.agentSharePct != null && <span className="block text-xs font-normal text-muted">{d.agentSharePct}%</span>}</td>
                  <td className="px-3 py-2"><span className={cn("rounded px-2 py-0.5 text-xs", TONE[state])}>{STATE_LABEL[state]}</span>{state === "paid" && d.agentPaidAt && <span className="block text-xs text-muted">{fmtDate(d.agentPaidAt)}</span>}{state === "received" && d.commissionReceivedAt && <span className="block text-xs text-muted">since {fmtDate(d.commissionReceivedAt)}</span>}</td>
                  {manager && (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {state === "pending" && <form action={markCommission}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="what" value="received" /><button className="rounded-md border border-line px-2 py-1 text-xs hover:bg-canvas">Mark received</button></form>}
                        {state === "received" && (
                          <form action={markCommission} className="flex gap-1"><input type="hidden" name="id" value={d.id} /><input type="hidden" name="what" value="paid" /><input name="amount" placeholder={String(share ?? "")} className="w-24 rounded-md border border-line px-2 py-1 text-xs" title="Amount paid (empty = agent share)" /><button className="rounded-md bg-navy-900 px-2 py-1 text-xs text-white">Mark paid</button></form>
                        )}
                        {state === "received" && <form action={markCommission}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="what" value="unreceived" /><button className="rounded-md px-2 py-1 text-xs text-muted hover:bg-canvas" title="Undo received">Undo</button></form>}
                        {state === "paid" && <form action={markCommission}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="what" value="unpaid" /><button className="rounded-md px-2 py-1 text-xs text-muted hover:bg-canvas">Undo paid</button></form>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
