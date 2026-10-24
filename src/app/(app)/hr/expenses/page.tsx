import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { Paperclip } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { fmtPKR } from "@/lib/crm-shared";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { recordLoanPayment } from "../payroll/actions";

export const metadata = { title: "Expenses & Loans" };
const TONE = { pending: "amber", approved: "navy", paid: "green", active: "navy", closed: "green", rejected: "red", cancelled: "neutral" } as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; pay?: string }> }) {
  const user = await requirePermission("hr.expenses");
  const sp = await searchParams;
  const tab = sp.tab === "loans" ? "loans" : "expenses";
  const empScope = (await scopeWhere(user, "hr.expenses", "view", { owner: "userId", branch: "branchId" })) as Prisma.EmployeeWhereInput;
  const canEdit = can(user, "hr.expenses", "edit");
  const status = sp.status ?? "open";

  const tabs = (
    <div className="mb-4 flex rounded-lg bg-black/5 p-0.5 sm:w-fit">
      {([["expenses", "Expense claims"], ["loans", "Loans & advances"]] as const).map(([t, label]) => (
        <Link key={t} href={t === "expenses" ? "/hr/expenses" : "/hr/expenses?tab=loans"} className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{label}</Link>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (tab === "expenses") {
    const statusWhere = status === "open" ? { in: ["pending", "approved"] } : status === "all" ? undefined : status;
    const rows = await db.expense.findMany({ where: { employee: empScope, ...(statusWhere && { status: statusWhere }) }, include: { employee: { select: { fullName: true, photo: true } } }, orderBy: { date: "desc" }, take: 300 });
    const total = rows.reduce((s, e) => s + e.amount, 0);
    body = (
      <>
        <Filters base="/hr/expenses" status={status} options={["open", "pending", "approved", "paid", "rejected", "all"]} />
        <Card className="overflow-hidden">
          {rows.length === 0 ? <EmptyState title="No claims" /> : (
            <ul className="divide-y divide-line">
              {rows.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <PersonAvatar name={e.employee.fullName} photo={e.employee.photo} />
                  <span className="min-w-0 flex-1"><span className="block font-medium">{e.employee.fullName} · {e.category}</span><span className="block text-xs text-muted">{format(e.date, "d MMM yyyy")}{e.description ? ` · ${e.description}` : ""}</span></span>
                  {e.receipt && <a href={fileUrl(e.receipt)} target="_blank" rel="noreferrer" aria-label="Open receipt" title="Receipt" className="text-muted hover:text-ink"><Paperclip className="size-4" /></a>}
                  <span className="w-28 text-right font-medium tabular-nums">{fmtPKR(e.amount)}</span>
                  <Badge tone={TONE[e.status as keyof typeof TONE] ?? "neutral"}>{e.status}</Badge>
                  {e.status === "pending" && e.approvalId && <Link href={`/approvals?tab=waiting&open=${e.approvalId}`} className="text-xs font-medium text-navy-900 hover:underline">Review</Link>}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-4 py-3 text-xs text-muted">{rows.length} claim(s) · {fmtPKR(total)}. Approved claims are reimbursed in the next payroll.</p>
        </Card>
      </>
    );
  } else {
    const statusWhere = status === "open" ? { in: ["pending", "active"] } : status === "all" ? undefined : status;
    const loans = await db.loan.findMany({ where: { employee: empScope, ...(statusWhere && { status: statusWhere }) }, include: { employee: { select: { fullName: true, photo: true } }, repayments: true }, orderBy: { createdAt: "desc" } });
    const paying = sp.pay ? loans.find((l) => l.id === sp.pay && l.status === "active") : null;
    body = (
      <>
        <Filters base="/hr/expenses?tab=loans" status={status} options={["open", "pending", "active", "closed", "rejected", "all"]} />
        <Card className="overflow-hidden">
          {loans.length === 0 ? <EmptyState title="No loans or advances" /> : (
            <ul className="divide-y divide-line">
              {loans.map((l) => {
                const repaid = l.repayments.reduce((s, r) => s + r.amount, 0);
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <PersonAvatar name={l.employee.fullName} photo={l.employee.photo} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{l.employee.fullName} · {l.kind === "advance" ? "Advance" : "Loan"} {fmtPKR(l.amount)}</span>
                      <span className="block text-xs text-muted">{fmtPKR(l.installment)}/month from {l.startMonth} · {fmtPKR(repaid)} repaid · {fmtPKR(Math.max(0, l.amount - repaid))} left{l.reason ? ` · ${l.reason}` : ""}</span>
                    </span>
                    <Badge tone={TONE[l.status as keyof typeof TONE] ?? "neutral"}>{l.status}</Badge>
                    {l.status === "pending" && l.approvalId && <Link href={`/approvals?tab=waiting&open=${l.approvalId}`} className="text-xs font-medium text-navy-900 hover:underline">Review</Link>}
                    {l.status === "active" && canEdit && <Link href={`/hr/expenses?tab=loans&pay=${l.id}`} scroll={false} className="text-xs text-muted hover:text-ink hover:underline">Record repayment</Link>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        {paying && (
          <Drawer title={`Repayment · ${paying.employee.fullName}`} closeHref="/hr/expenses?tab=loans" width="max-w-md">
            <p className="mb-4 text-sm text-muted">Use this when money is paid back outside payroll (cash, transfer). Payroll deductions are recorded automatically when a run is approved.</p>
            <ActionForm action={recordLoanPayment} className="space-y-4">
              <input type="hidden" name="loanId" value={paying.id} />
              <Field label="Amount (PKR)"><input name="amount" inputMode="decimal" required className="input" /></Field>
              <Field label="Note"><input name="note" className="input" placeholder="e.g. Cash received" /></Field>
              <SubmitButton>Record</SubmitButton>
            </ActionForm>
          </Drawer>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Expenses & Loans" description="Claims and borrowing, approved through the approval chain and settled via payroll." />
      {tabs}
      {body}
    </>
  );
}

function Filters({ base, status, options }: { base: string; status: string; options: string[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
      {options.map((s) => (
        <Link key={s} href={`${base}${base.includes("?") ? "&" : "?"}status=${s}`} className={cn("rounded-full border px-3 py-1 capitalize", status === s ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted hover:text-ink")}>{s}</Link>
      ))}
    </div>
  );
}
