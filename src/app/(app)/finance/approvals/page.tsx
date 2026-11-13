import Link from "@/components/link";
import { format } from "date-fns";
import { Check, Paperclip, X } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { financeConfig, pkr } from "@/lib/finance";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { decideEntry } from "../actions";

export const metadata = { title: "Approvals · Finance" };

/** Big expenses waiting for the boss. They don't count in totals or balances until approved. */
export default async function FinanceApprovals() {
  await requirePermission("finance", "approve");
  const [cfg, pending, recent] = await Promise.all([
    financeConfig(),
    db.finEntry.findMany({ where: { status: "pending" }, include: { account: true, category: { include: { parent: true } }, _count: { select: { proofs: true } } }, orderBy: { date: "asc" } }),
    db.finEntry.findMany({ where: { status: { in: ["approved", "rejected"] }, approvedAt: { not: null } }, include: { account: true }, orderBy: { approvedAt: "desc" }, take: 15 }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: pending.map((p) => p.createdById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Approvals" description={cfg.approvalAbove ? `Expenses of ${pkr(cfg.approvalAbove)} or more wait here until approved. Change the limit in Finance → Settings.` : "No approval limit is set: turn it on in Finance → Settings."} />
      <Card className="mb-6 overflow-hidden">
        {pending.length === 0 ? <EmptyState title="Nothing waiting" description="New big expenses will appear here." /> : (
          <ul className="divide-y divide-line">
            {pending.map((e) => {
              const n = e._count.proofs + (e.receipt ? 1 : 0);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/finance/entries/${e.id}`} className="font-medium hover:underline">{e.description}</Link>
                    <p className="text-xs text-muted">{format(e.date, "d MMM yyyy")} · {e.account.name} → {e.party || "—"} · {e.category ? (e.category.parent ? `${e.category.parent.name} › ${e.category.name}` : e.category.name) : ""} · by {users.find((u) => u.id === e.createdById)?.name ?? "—"}</p>
                  </div>
                  <Link href={`/finance/entries/${e.id}`} className={n ? "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800" : "rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700"}>{n ? <><Paperclip className="size-3" />{n} proof</> : "No proof"}</Link>
                  <span className="w-32 text-right text-lg font-semibold tabular-nums">{pkr(e.amount)}</span>
                  <form action={decideEntry}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="op" value="approve" /><button className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Check className="size-4" /> Approve</button></form>
                  <form action={decideEntry} className="flex gap-1"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="op" value="reject" /><input name="reason" placeholder="Reason" className="input w-36 py-1.5 text-sm" /><button className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"><X className="size-4" /> Reject</button></form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {recent.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 font-semibold">Recently decided</h2>
          <ul className="divide-y divide-line text-sm">{recent.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5"><span className={e.status === "approved" ? "text-emerald-700" : "text-red-600"}>{e.status === "approved" ? "Approved" : "Rejected"}</span><Link href={`/finance/entries/${e.id}`} className="flex-1 truncate hover:underline">{e.description}</Link><span className="text-xs text-muted">{e.approvedAt && format(e.approvedAt, "d MMM")}</span><span className="w-28 text-right tabular-nums">{pkr(e.amount)}</span></li>
          ))}</ul>
        </Card>
      )}
    </>
  );
}
