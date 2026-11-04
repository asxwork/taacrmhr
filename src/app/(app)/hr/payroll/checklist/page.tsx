import Link from "next/link";
import { addMonths, endOfMonth, format, parse, startOfMonth } from "date-fns";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { toggleCheck } from "./actions";

export const metadata = { title: "Payroll checklist" };

/** Payroll → Checklist: the monthly run in order, with live hints and a tick (who/when) per step. */
export default async function PayrollChecklistPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requirePermission("hr.payrollchecklist");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? parse(sp.m!, "yyyy-MM", new Date()) : startOfMonth(new Date());
  const m = format(month, "yyyy-MM");
  const from = startOfMonth(month), to = endOfMonth(month);
  const [checks, run, pendingLeave, pendingApprovals, revisions, joiners, leavers] = await Promise.all([
    db.payrollCheck.findMany({ where: { month: m } }),
    db.payrollRun.findUnique({ where: { month: m }, select: { id: true, status: true, approvedAt: true, paidAt: true, _count: { select: { payslips: true } } } }),
    db.leaveRequest.count({ where: { status: "pending", from: { lte: to }, to: { gte: from } } }),
    db.approvalRequest.count({ where: { status: "pending" } }),
    db.salaryRevision.count({ where: { effectiveFrom: { gte: from, lte: to } } }),
    db.employee.count({ where: { joiningDate: { gte: from, lte: to } } }),
    db.employee.count({ where: { leftAt: { gte: from, lte: to } } }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: checks.map((c) => c.doneById).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const done = new Map(checks.map((c) => [c.key, c]));
  const steps: { key: string; title: string; hint: string; href: string; auto?: boolean }[] = [
    { key: "attendance", title: "Review attendance", hint: "Fix missing check-outs and absences before salaries are worked out.", href: "/hr/attendance" },
    { key: "leave", title: "Decide all leave for the month", hint: pendingLeave ? `${pendingLeave} leave request(s) still waiting` : "No leave waiting", href: "/approvals" },
    { key: "approvals", title: "Clear other approvals", hint: pendingApprovals ? `${pendingApprovals} request(s) waiting in Approvals` : "Nothing waiting", href: "/approvals" },
    { key: "people", title: "Check joiners, leavers and salary changes", hint: `${joiners} joined, ${leavers} left, ${revisions} salary revision(s) this month`, href: "/hr/salary-revisions" },
    { key: "items", title: "Enter commission, bonuses and deductions", hint: "Commission, rewards and one-off pay items for this month.", href: "/hr/payroll/items/commission" },
    { key: "loans", title: "Confirm loan and advance deductions", hint: "Check installments due this month.", href: "/hr/expenses" },
    { key: "run", title: "Run payroll", hint: run ? `Run created · ${run._count.payslips} payslip(s)` : "Not run yet", href: run ? `/hr/payroll/${m}` : "/hr/payroll", auto: !!run },
    { key: "approve", title: "Approve the run", hint: run?.approvedAt ? `Approved ${format(run.approvedAt, "d MMM")}` : "Not approved yet", href: `/hr/payroll/${m}`, auto: !!run?.approvedAt },
    { key: "bank", title: "Send the bank file / vouchers", hint: "Download the bank advice and send it to the bank.", href: "/hr/payroll/vouchers" },
    { key: "paid", title: "Mark as paid and share payslips", hint: run?.paidAt ? `Paid ${format(run.paidAt, "d MMM")}` : "Not paid yet", href: `/hr/payroll/${m}`, auto: !!run?.paidAt },
  ];
  const canEdit = can(user, "hr.payrollchecklist", "edit");
  const complete = steps.filter((s) => s.auto || done.has(s.key)).length;
  const nav = (d: Date) => `/hr/payroll/checklist?m=${format(d, "yyyy-MM")}`;

  return (
    <>
      <PageHeader title="Payroll checklist" description="Work down the list each month. Steps AMS can see (run, approved, paid) tick themselves; tick the rest as you finish them." />
      <div className="mb-4 flex items-center gap-2">
        <Link href={nav(addMonths(month, -1))} className="rounded-lg border border-line p-2 hover:bg-canvas" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
        <span className="min-w-32 text-center font-medium">{format(month, "MMMM yyyy")}</span>
        <Link href={nav(addMonths(month, 1))} className="rounded-lg border border-line p-2 hover:bg-canvas" aria-label="Next month"><ChevronRight className="size-4" /></Link>
        <span className="ml-auto text-sm text-muted">{complete} of {steps.length} done</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-emerald-500" style={{ width: `${(complete / steps.length) * 100}%` }} /></div>
      <Card className="overflow-hidden">
        <ol className="divide-y divide-line">
          {steps.map((s, i) => {
            const c = done.get(s.key);
            const ok = s.auto || !!c;
            return (
              <li key={s.key} className="flex items-center gap-3 px-4 py-3">
                {canEdit && !s.auto ? (
                  <form action={toggleCheck}><input type="hidden" name="month" value={m} /><input type="hidden" name="key" value={s.key} />
                    <button aria-label={ok ? `Untick ${s.title}` : `Tick ${s.title}`} className="block">{ok ? <CheckCircle2 className="size-6 text-emerald-600" /> : <Circle className="size-6 text-muted hover:text-emerald-600" />}</button>
                  </form>
                ) : ok ? <CheckCircle2 className="size-6 text-emerald-600" /> : <Circle className="size-6 text-muted" />}
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", ok && "text-muted line-through decoration-emerald-600/40")}>{i + 1}. {s.title}</p>
                  <p className="text-xs text-muted">{s.hint}{c ? ` · ticked by ${users.find((u) => u.id === c.doneById)?.name ?? "—"}, ${format(c.doneAt, "d MMM h:mm a")}` : ""}{s.auto ? " · automatic" : ""}</p>
                </div>
                <Link href={s.href} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-canvas">Open</Link>
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}
