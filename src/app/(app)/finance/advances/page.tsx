import Link from "@/components/link";
import { addMonths, format } from "date-fns";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { lakh, pkr } from "@/lib/finance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { giveAdvance } from "../actions";

export const metadata = { title: "Advances & loans · Finance" };

/** Money given to staff in advance: how much, repaid through payroll so far, and still outstanding. */
export default async function Advances() {
  const user = await requirePermission("finance");
  const [loans, holders, employees] = await Promise.all([
    db.loan.findMany({ where: { status: { in: ["active", "closed"] } }, include: { employee: { select: { fullName: true, code: true } }, repayments: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.finAccount.findMany({ where: { active: true, kind: { not: "owner" } }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }),
  ]);
  const paidOut = await db.finEntry.findMany({ where: { sourceType: "loan", sourceId: { in: loans.map((l) => l.id) } }, select: { id: true, sourceId: true } });
  const rows = loans.map((l) => { const repaid = l.repayments.reduce((s, r) => s + r.amount, 0); return { l, repaid, left: Math.max(0, l.amount - repaid), entry: paidOut.find((p) => p.sourceId === l.id) }; });
  const outstanding = rows.filter((r) => r.l.status === "active").reduce((s, r) => s + r.left, 0);
  const canAdd = can(user, "finance", "create");
  return (
    <>
      <PageHeader title="Advances & loans" description="Money given to staff ahead of salary. Installments come off their salary in HR payroll automatically." />
      <p className="mb-4 text-sm">Outstanding with staff: <b className="tabular-nums">{lakh(outstanding)}</b></p>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_22rem]">
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5 text-right">Given</th><th className="px-4 py-2.5 text-right">Repaid</th><th className="px-4 py-2.5 text-right">Left</th><th className="px-4 py-2.5">Payout</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map(({ l, repaid, left, entry }) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5"><span className="font-medium">{l.employee.fullName}</span><span className="block text-xs text-muted">{l.kind} · {pkr(l.installment)}/month from {l.startMonth}{l.status === "closed" && " · fully repaid"}</span></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{pkr(l.amount)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{pkr(repaid)}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{left ? pkr(left) : "—"}</td>
                <td className="px-4 py-2.5">{entry ? <Link href={`/finance/entries/${entry.id}`} className="text-xs text-navy-900 hover:underline">Paid →</Link> : canAdd && l.status === "active" ? (
                  <ActionForm action={giveAdvance} className="flex gap-1"><input type="hidden" name="loanId" value={l.id} /><select name="accountId" required aria-label="Paid from" className="input w-auto py-1 text-xs"><option value="">Pay from…</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select><SubmitButton>Pay</SubmitButton></ActionForm>
                ) : <span className="text-xs text-muted">—</span>}</td>
              </tr>
            ))}{rows.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-muted">No advances or loans yet.</td></tr>}</tbody>
          </table>
        </Card>
        {canAdd && (
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Give an advance</h2>
            <ActionForm action={giveAdvance} className="space-y-3">
              <Field label="Employee"><select name="employeeId" required className="input"><option value="">Choose…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} {e.code ? `(${e.code})` : ""}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Type"><select name="kind" className="input"><option value="advance">Advance</option><option value="loan">Loan</option></select></Field>
                <Field label="Amount (Rs)"><input name="amount" required inputMode="decimal" className="input" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Per month (Rs)"><input name="installment" inputMode="decimal" className="input" placeholder="All at once" /></Field>
                <Field label="Deduct from"><input name="startMonth" type="month" required defaultValue={format(addMonths(new Date(), 1), "yyyy-MM")} className="input" /></Field>
              </div>
              <Field label="Paid from"><select name="accountId" required className="input"><option value="">Choose…</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
              <Field label="Reason (optional)"><input name="reason" className="input" /></Field>
              <SubmitButton>Give advance</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
