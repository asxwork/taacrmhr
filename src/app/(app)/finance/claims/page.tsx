import Link from "@/components/link";
import { format } from "date-fns";
import { Paperclip } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { pkr } from "@/lib/finance";
import { fileUrl } from "@/lib/files";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { payClaim } from "../actions";

export const metadata = { title: "Staff claims · Finance" };

/** Staff expense claims (submitted in My Space → Expenses, approved in HR): pay them in cash here, or leave them for payroll. */
export default async function Claims() {
  const user = await requirePermission("finance");
  const [approved, pending, paid, holders] = await Promise.all([
    db.expense.findMany({ where: { status: "approved", runId: null }, include: { employee: { select: { fullName: true, code: true } } }, orderBy: { date: "asc" } }),
    db.expense.aggregate({ where: { status: "pending" }, _count: true, _sum: { amount: true } }),
    db.finEntry.findMany({ where: { sourceType: "expense" }, include: { account: true }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.finAccount.findMany({ where: { active: true, kind: { not: "owner" } }, orderBy: { name: "asc" } }),
  ]);
  const canPay = can(user, "finance", "create");
  return (
    <>
      <PageHeader title="Staff claims" description="Staff send claims from My Space → Expenses with a photo of the bill. After HR approves, pay them here in cash, or leave them and they are added to the next payroll." />
      {pending._count > 0 && <p className="mb-4 text-sm"><b>{pending._count} claims ({pkr(pending._sum.amount ?? 0)})</b> are waiting for HR approval · <Link href="/hr/expenses" className="text-navy-900 hover:underline">open in HR</Link></p>}
      <Card className="mb-6 overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 font-semibold">Approved, waiting for payment <span className="text-sm font-normal text-muted">{approved.length}</span></h2>
        {approved.length === 0 ? <EmptyState title="Nothing to pay" description="Approved claims appear here." /> : (
          <ul className="divide-y divide-line">{approved.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1"><p className="font-medium">{c.employee.fullName} <span className="text-xs text-muted">{c.employee.code}</span></p><p className="text-xs text-muted">{format(c.date, "d MMM yyyy")} · {c.category}{c.description ? ` · ${c.description}` : ""}</p></div>
              {c.receipt ? <a href={fileUrl(c.receipt)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"><Paperclip className="size-3" /> Bill</a> : <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">No bill</span>}
              <span className="w-28 text-right font-semibold tabular-nums">{pkr(c.amount)}</span>
              {canPay && (
                <ActionForm action={payClaim} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <select name="accountId" required aria-label="Paid by" className="input w-auto py-1.5 text-sm"><option value="">Pay from…</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
                  <SubmitButton>Pay in cash</SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}</ul>
        )}
      </Card>
      {paid.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 font-semibold">Recently paid from Finance</h2>
          <ul className="divide-y divide-line text-sm">{paid.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5"><Link href={`/finance/entries/${e.id}`} className="flex-1 truncate hover:underline">{e.description}</Link><span className="text-xs text-muted">{format(e.date, "d MMM")} · {e.account.name}</span><span className="w-24 text-right tabular-nums">{pkr(e.amount)}</span></li>
          ))}</ul>
        </Card>
      )}
    </>
  );
}
