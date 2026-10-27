import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesFor } from "@/lib/leave";
import { color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { applyMyLeave, withdrawLeave } from "../../hr/leave/actions";
import { encashableBalances, perDayPay } from "@/lib/compensation";
import { EncashForm } from "@/components/hr/encash-form";

export const metadata = { title: "My Leave" };

const TONE = { pending: "amber", approved: "green", rejected: "red", cancelled: "neutral" } as const;
const fmtDays = (n: number) => (Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : "∞");

export default async function MyLeavePage() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, include: { salary: { select: { gross: true } } } });
  if (!emp) return (<><PageHeader title="My Leave" /><Card><EmptyState title="No employee record" description="Ask HR to link your login to your employee profile." /></Card></>);

  const year = new Date().getFullYear();
  const [balances, requests, encashable, encashments] = await Promise.all([
    balancesFor(emp.id, year),
    db.leaveRequest.findMany({ where: { employeeId: emp.id }, include: { type: true }, orderBy: { from: "desc" }, take: 50 }),
    encashableBalances(emp.id),
    db.leaveEncashment.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <>
      <PageHeader eyebrow={String(year)} title="My Leave" description="Balances update as requests are approved." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {balances.map((b) => (
          <Card key={b.type.id} className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted"><span className={cn("size-2 rounded-full", color(b.type.color).dot)} />{b.type.name}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{b.unlimited ? "Unpaid" : fmtDays(b.available)}<span className="ml-1 text-xs font-normal text-muted">{b.unlimited ? "" : "available"}</span></p>
            {!b.unlimited && (
              <p className="mt-1 text-xs text-muted">
                {fmtDays(b.entitled + b.carried + b.adjusted)} total · {fmtDays(b.used)} used{b.pending ? ` · ${fmtDays(b.pending)} pending` : ""}
              </p>
            )}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="mb-4 font-medium">Apply for leave</h2>
          <ActionForm action={applyMyLeave} className="space-y-4">
            <Field label="Type">
              <select name="typeId" required className="input">
                {balances.map((b) => <option key={b.type.id} value={b.type.id}>{b.type.name}{b.unlimited ? "" : ` (${fmtDays(b.available)} left)`}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><input name="from" type="date" required className="input" /></Field>
              <Field label="To" hint="Leave blank for one day"><input name="to" type="date" className="input" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="halfDay" className="accent-navy-900" /> Half day (single date)</label>
            <Field label="Reason"><textarea name="reason" rows={2} className="input" /></Field>
            <SubmitButton pendingText="Sending…">Submit request</SubmitButton>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">Off days and public holidays inside the range aren’t counted.</p>
        </Card>

        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 font-medium">My requests</h2>
          {requests.length === 0 ? <EmptyState title="No leave requests yet" /> : (
            <ul className="divide-y divide-line">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className={cn("size-2 rounded-full", color(r.type.color).dot)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.type.name} · {r.days} day{r.days === 1 ? "" : "s"}</span>
                    <span className="block text-xs text-muted">{format(r.from, "d MMM")}{isSameDay(r.from, r.to) ? "" : ` – ${format(r.to, "d MMM yyyy")}`}{r.halfDay ? " (half day)" : ""}{r.reason ? ` · ${r.reason}` : ""}</span>
                  </span>
                  <Badge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>{r.status}</Badge>
                  {r.approvalId && <Link href={`/approvals?tab=mine&open=${r.approvalId}`} className="text-xs text-muted hover:text-ink hover:underline">Details</Link>}
                  {r.status === "pending" && (
                    <form action={withdrawLeave}><input type="hidden" name="id" value={r.id} /><Button variant="ghost" className="h-8 px-2 text-xs">Withdraw</Button></form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card id="encash" className="mt-6 p-5">
        <h2 className="mb-1 font-medium">Encash leave</h2>
        <p className="mb-4 text-sm text-muted">Turn unused paid leave into pay. Once approved the days leave your balance and the amount comes with the next payslip.</p>
        <EncashForm balances={encashable} perDay={emp.salary ? perDayPay(emp.salary.gross) : null} />
        {encashments.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
            {encashments.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{x.days} day{x.days === 1 ? "" : "s"} {x.typeName} · PKR {Math.round(x.amount).toLocaleString("en-PK")}</span>
                <Badge tone={x.status === "paid" ? "green" : x.status === "approved" ? "navy" : x.status === "pending" ? "amber" : x.status === "rejected" ? "red" : "neutral"}>{x.status === "approved" ? "approved · next payroll" : x.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
