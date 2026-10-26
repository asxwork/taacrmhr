import Link from "next/link";
import { notFound } from "next/navigation";
import { comingSoon } from "@/components/coming-soon";
import { format } from "date-fns";
import { ArrowLeft, Download, Printer, RefreshCw, Trash2, X } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { monthDate, payrollEmployeeWhere } from "@/lib/payroll";
import { fmtPKR } from "@/lib/crm-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { addAdjustment, approvePayroll, deleteRun, markPaid, recalculateRun, removeAdjustment, reopenPayroll } from "../actions";

export const metadata = { title: "Payroll run" };

const n = (v: number) => Math.round(v).toLocaleString("en-PK");

export default async function PayrollRunPage({ params, searchParams }: { params: Promise<{ month: string }>; searchParams: Promise<{ slip?: string; missing?: string }> }) {
  const user = await requirePermission("hr.payroll");
  const [{ month }, sp] = await Promise.all([params, searchParams]);
  const run = await db.payrollRun.findUnique({ where: { month } });
  // Planned pages under /hr/payroll/… (e.g. Dashboard) land here before the catch-all.
  if (!run) return (await comingSoon(`/hr/payroll/${month}`)) ?? notFound();
  const scope = (await payrollEmployeeWhere(user))!;
  const isAdmin = user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";
  const canApprove = user.isSuperAdmin || scopeFor(user, "hr.payroll", "approve") === "all";

  const slips = await db.payslip.findMany({
    where: { runId: run.id, employee: scope },
    include: { employee: { select: { id: true, fullName: true, code: true, photo: true } } },
    orderBy: { employee: { fullName: "asc" } },
  });
  const totals = slips.reduce((t, p) => ({ gross: t.gross + p.earnings, ded: t.deductions + p.deductions, tax: t.tax + p.tax, net: t.net + p.net, deductions: t.deductions + p.deductions }), { gross: 0, ded: 0, tax: 0, net: 0, deductions: 0 });
  const open = sp.slip ? await db.payslip.findFirst({ where: { id: sp.slip, runId: run.id, employee: scope }, include: { lines: { orderBy: { sortOrder: "asc" } }, employee: true } }) : null;
  const adjustments = open ? await db.payrollAdjustment.findMany({ where: { runId: run.id, employeeId: open.employeeId } }) : [];
  const base = `/hr/payroll/${month}`;

  return (
    <>
      <Link href="/hr/payroll" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Payroll</Link>
      <PageHeader
        eyebrow={`Payroll · ${run.status}`}
        title={format(monthDate(month), "MMMM yyyy")}
        description={run.approvedAt ? `Approved ${format(run.approvedAt, "d MMM yyyy")}${run.paidAt ? ` · paid ${format(run.paidAt, "d MMM yyyy")}` : ""}` : "Draft — review, adjust, then approve."}
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/api/export/payroll?month=${month}&type=bank`} variant="secondary" prefetch={false}><Download className="size-4" /> Bank sheet</LinkButton>
            <LinkButton href={`/api/export/payroll?month=${month}&type=register`} variant="secondary" prefetch={false}><Download className="size-4" /> Register</LinkButton>
            {isAdmin && run.status === "draft" && (
              <form action={recalculateRun}><input type="hidden" name="runId" value={run.id} /><Button variant="secondary"><RefreshCw className="size-4" /> Recalculate</Button></form>
            )}
            {canApprove && run.status === "draft" && (
              <form action={approvePayroll}><input type="hidden" name="runId" value={run.id} /><Button>Approve &amp; publish payslips</Button></form>
            )}
            {canApprove && run.status === "approved" && (
              <>
                <form action={reopenPayroll}><input type="hidden" name="runId" value={run.id} /><Button variant="ghost">Reopen</Button></form>
                <form action={markPaid}><input type="hidden" name="runId" value={run.id} /><Button>Mark as paid</Button></form>
              </>
            )}
          </div>
        }
      />

      {sp.missing && <p className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">No salary set for: {sp.missing}. Add it under Payroll → Salaries, then recalculate.</p>}

      <div className="stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["Employees", String(slips.length)], ["Gross pay", fmtPKR(totals.gross)], ["Income tax", fmtPKR(totals.tax)], ["Net payable", fmtPKR(totals.net)]] as const).map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-xl font-semibold tabular-nums">{v}</p></Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {slips.length === 0 ? <EmptyState title="No payslips" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line"><tr>{["Employee", "Days", "Absent", "Earnings", "Deductions", "Tax", "Net"].map((h, i) => <th key={h} className={`th ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {slips.map((p) => (
                  <tr key={p.id} className="hover:bg-canvas/60">
                    <td className="td">
                      <Link href={`${base}?slip=${p.id}`} scroll={false} className="flex items-center gap-3">
                        <PersonAvatar name={p.employee.fullName} photo={p.employee.photo} />
                        <span><span className="block whitespace-nowrap font-medium">{p.employee.fullName}</span><span className="block text-xs text-muted">{p.designation ?? p.employee.code}</span></span>
                      </Link>
                    </td>
                    <td className="td text-right tabular-nums">{p.employedDays}/{p.daysInMonth}</td>
                    <td className="td text-right tabular-nums">{p.absentDays || "—"}</td>
                    <td className="td text-right tabular-nums">{n(p.earnings)}</td>
                    <td className="td text-right tabular-nums">{n(p.deductions)}</td>
                    <td className="td text-right tabular-nums">{n(p.tax)}</td>
                    <td className="td text-right font-semibold tabular-nums">{n(p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isAdmin && run.status === "draft" && (
        <form action={deleteRun} className="mt-6"><input type="hidden" name="runId" value={run.id} /><Button variant="ghost" className="text-muted hover:text-red-600"><Trash2 className="size-4" /> Delete this draft</Button></form>
      )}

      {open && (
        <Drawer title={`${open.employee.fullName} · ${format(monthDate(month), "MMM yyyy")}`} closeHref={base} width="max-w-lg">
          <div className="space-y-5">
            <SlipLines lines={open.lines} net={open.net} />
            <p className="text-xs text-muted">
              {open.employedDays} of {open.daysInMonth} days employed · {open.absentDays} absent · {open.lateCount} late · {open.unpaidLeave} unpaid leave
            </p>
            {isAdmin && run.status === "draft" && (
              <section className="border-t border-line pt-4">
                <h3 className="mb-2 text-sm font-medium">Adjustments</h3>
                {adjustments.map((a) => (
                  <form key={a.id} action={removeAdjustment} className="mb-1.5 flex items-center justify-between text-sm">
                    <input type="hidden" name="id" value={a.id} />
                    <span>{a.label} <span className="text-xs text-muted">{a.taxable ? "taxable" : "tax-free"}</span></span>
                    <span className="flex items-center gap-2 tabular-nums">{a.amount > 0 ? "+" : ""}{n(a.amount)}<button aria-label={`Remove ${a.label}`} title="Remove" className="rounded p-1 text-muted hover:text-red-600"><X className="size-3.5" /></button></span>
                  </form>
                ))}
                <ActionForm action={addAdjustment} className="mt-2 grid grid-cols-[1fr_120px] gap-2">
                  <input type="hidden" name="runId" value={run.id} />
                  <input type="hidden" name="employeeId" value={open.employeeId} />
                  <Field label="Label"><input name="label" required placeholder="e.g. Performance bonus" className="input" /></Field>
                  <Field label="Amount" hint="Minus to deduct"><input name="amount" required inputMode="decimal" className="input" /></Field>
                  <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="taxable" defaultChecked className="accent-navy-900" /> Taxable</label>
                  <div className="col-span-2"><SubmitButton variant="secondary">Add &amp; recalculate</SubmitButton></div>
                </ActionForm>
              </section>
            )}
            {run.status !== "draft" && <LinkButton href={`/payslips/${open.id}`} variant="secondary"><Printer className="size-4" /> Open printable payslip</LinkButton>}
          </div>
        </Drawer>
      )}
    </>
  );
}

function SlipLines({ lines, net }: { lines: { id: string; kind: string; label: string; amount: number }[]; net: number }) {
  const earn = lines.filter((l) => l.kind === "earning");
  const ded = lines.filter((l) => l.kind === "deduction");
  const block = (title: string, rows: typeof lines) => (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      {rows.map((l) => <div key={l.id} className="flex justify-between py-1 text-sm"><span>{l.label}</span><span className="tabular-nums">{n(l.amount)}</span></div>)}
      <div className="flex justify-between border-t border-line pt-1 text-sm font-medium"><span>Total</span><span className="tabular-nums">{n(rows.reduce((s, l) => s + l.amount, 0))}</span></div>
    </div>
  );
  return (
    <div className="space-y-4">
      {block("Earnings", earn)}
      {block("Deductions", ded)}
      <div className="flex justify-between rounded-lg bg-navy-900 px-4 py-3 text-white"><span className="font-medium">Net pay</span><span className="font-semibold tabular-nums">PKR {n(net)}</span></div>
    </div>
  );
}
