import Link from "next/link";
import { addMonths, format } from "date-fns";
import { Paperclip } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtPKR } from "@/lib/crm-shared";
import { fileUrl } from "@/lib/files";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { requestLoan, submitExpense, withdrawMine } from "../../hr/expenses/actions";
import { EXPENSE_CATEGORIES } from "@/lib/hr-shared";

export const metadata = { title: "My Expenses & Loans" };
const TONE = { pending: "amber", approved: "navy", paid: "green", active: "navy", closed: "green", rejected: "red", cancelled: "neutral" } as const;

export default async function MyExpensesPage() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id } });
  if (!emp) return (<><PageHeader title="My Expenses & Loans" /><Card><EmptyState title="No employee record" description="Ask HR to link your login to your employee profile." /></Card></>);
  const [expenses, loans] = await Promise.all([
    db.expense.findMany({ where: { employeeId: emp.id }, orderBy: { date: "desc" }, take: 50 }),
    db.loan.findMany({ where: { employeeId: emp.id }, include: { repayments: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <>
      <PageHeader title="My Expenses & Loans" description="Approved claims are paid with your next salary; loan installments are deducted from it." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-medium">Claim an expense</h2>
          <ActionForm action={submitExpense} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input name="date" type="date" required defaultValue={format(new Date(), "yyyy-MM-dd")} className="input" /></Field>
              <Field label="Amount (PKR)"><input name="amount" inputMode="decimal" required className="input" /></Field>
            </div>
            <Field label="Category"><select name="category" className="input">{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Details"><input name="description" className="input" placeholder="e.g. Fuel for DHA site visits" /></Field>
            <Field label="Receipt (photo or PDF)"><input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" /></Field>
            <SubmitButton>Submit claim</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-medium">Request a loan or salary advance</h2>
          <ActionForm action={requestLoan} className="space-y-3">
            <Field label="Type"><select name="kind" className="input"><option value="advance">Salary advance</option><option value="loan">Loan</option></select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (PKR)"><input name="amount" inputMode="decimal" required className="input" /></Field>
              <Field label="Deduct per month"><input name="installment" inputMode="decimal" className="input" placeholder="Full amount" /></Field>
            </div>
            <Field label="First deduction month"><input name="startMonth" type="month" required defaultValue={format(addMonths(new Date(), 1), "yyyy-MM")} className="input" /></Field>
            <Field label="Reason"><input name="reason" className="input" /></Field>
            <SubmitButton>Send request</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 font-medium">My claims</h2>
          {expenses.length === 0 ? <EmptyState title="No claims yet" /> : (
            <ul className="divide-y divide-line">
              {expenses.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1"><span className="block font-medium">{e.category} · {fmtPKR(e.amount)}</span><span className="block text-xs text-muted">{format(e.date, "d MMM yyyy")}{e.description ? ` · ${e.description}` : ""}</span></span>
                  {e.receipt && <a href={fileUrl(e.receipt)} target="_blank" rel="noreferrer" aria-label="Receipt" title="Receipt" className="text-muted hover:text-ink"><Paperclip className="size-4" /></a>}
                  <Badge tone={TONE[e.status as keyof typeof TONE] ?? "neutral"}>{e.status}</Badge>
                  {e.status === "pending" && e.approvalId && <form action={withdrawMine}><input type="hidden" name="approvalId" value={e.approvalId} /><Button variant="ghost" className="h-8 px-2 text-xs">Withdraw</Button></form>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 font-medium">My loans & advances</h2>
          {loans.length === 0 ? <EmptyState title="Nothing borrowed" /> : (
            <ul className="divide-y divide-line">
              {loans.map((l) => {
                const repaid = l.repayments.reduce((s, r) => s + r.amount, 0);
                return (
                  <li key={l.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex-1 font-medium">{l.kind === "advance" ? "Salary advance" : "Loan"} · {fmtPKR(l.amount)}</span>
                      <Badge tone={TONE[l.status as keyof typeof TONE] ?? "neutral"}>{l.status}</Badge>
                      {l.status === "pending" && l.approvalId && <form action={withdrawMine}><input type="hidden" name="approvalId" value={l.approvalId} /><Button variant="ghost" className="h-8 px-2 text-xs">Withdraw</Button></form>}
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (repaid / l.amount) * 100)}%` }} /></div>
                    <p className="mt-1 text-xs text-muted">{fmtPKR(repaid)} repaid · {fmtPKR(Math.max(0, l.amount - repaid))} left · {fmtPKR(l.installment)}/month from {l.startMonth}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">Track approvals in <Link href="/approvals?tab=mine" className="underline">Approvals &amp; Requests</Link>.</p>
    </>
  );
}
