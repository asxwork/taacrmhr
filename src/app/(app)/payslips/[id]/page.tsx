import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeMatcher } from "@/lib/permissions";
import { payslipDoc } from "@/lib/payslip-doc";
import { fmtDateTime } from "@/lib/utils";
import { PrintButton } from "@/components/print-button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { resendPayslip } from "@/app/(app)/hr/payroll/payslip-actions";

export const metadata = { title: "Payslip" };
const n = (v: number) => Math.round(v).toLocaleString("en-PK");

/** Printable payslip in the company format (Ctrl+P / "Save as PDF"). Employees see their own once the run is approved. */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const slip = await db.payslip.findUnique({ where: { id }, select: { id: true, emailedAt: true, run: { select: { status: true } }, employee: { select: { userId: true, branchId: true } } } });
  if (!slip) notFound();
  const own = slip.employee.userId === user.id && slip.run.status !== "draft";
  const hr = can(user, "hr.payroll") && (await scopeMatcher(user, "hr.payroll", "view"))({ ownerId: slip.employee.userId, branchId: slip.employee.branchId });
  if (!own && !hr) notFound();
  const d = (await payslipDoc(id))!;
  const label = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-end gap-2">
        {hr && d.status !== "draft" && (
          <ActionForm action={resendPayslip} className="flex items-center gap-2">
            <input type="hidden" name="id" value={d.id} />
            <span className="text-xs text-muted">{slip.emailedAt ? `Emailed ${fmtDateTime(slip.emailedAt)}` : "Not emailed yet"}</span>
            <SubmitButton variant="secondary" pendingText="Sending…"><Mail className="size-4" /> {slip.emailedAt ? "Email again" : "Email to employee"}</SubmitButton>
          </ActionForm>
        )}
        <PrintButton />
      </div>
      <article className="print-sheet overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-4 bg-navy-950 px-8 py-6 text-white print:bg-white print:text-black">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-gold.svg" alt={d.employer.name} className="h-11 w-auto print:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-blue.svg" alt={d.employer.name} className="hidden h-11 w-auto print:block" />
            <p className="mt-4 text-xs tracking-[0.3em] text-gold-400 print:text-black">PAYSLIP</p>
            <p className="font-display text-2xl font-semibold">{d.month}</p>
            {d.status === "draft" && <p className="mt-1 text-xs font-semibold uppercase text-amber-300">Draft, not final</p>}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1 text-sm">
            {([["Payslip #", d.number], ["Payment date", d.paymentDate], ["Pay period", d.payPeriod], ["Working days", String(d.workingDays)]] as const).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-white/60 print:text-black/60">{k}</dt><dd className="text-right font-semibold tabular-nums">{v}</dd></div>
            ))}
          </dl>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b border-line px-8 py-6 sm:grid-cols-2">
          <div>
            <p className={label}>Employer</p>
            <p className="mt-1 font-semibold">{d.employer.name}</p>
            {d.employer.address && <p className="text-sm text-muted">{d.employer.address}</p>}
          </div>
          <div>
            <p className={label}>Employee</p>
            <p className="mt-1 font-semibold">{d.employee.name}</p>
            <dl className="mt-1 space-y-0.5 text-sm">
              {([["Employee ID", d.employee.code], ["Designation", d.employee.designation], ["Department", d.employee.department], ["Days paid", d.daysPaid]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
              ))}
            </dl>
          </div>
        </section>

        <section className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink/80 text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2">Description</th><th className="py-2 text-right">Hours</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">YTD</th><th className="py-2 pl-4">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.earnings.map((e, i) => (
                <tr key={`e${i}`}>
                  <td className="py-2">{e.label}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{e.hours ?? ""}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{e.rate != null ? n(e.rate) : ""}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{n(e.amount)}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{n(e.ytd)}</td>
                  <td className="py-2 pl-4 text-xs text-muted">{e.type}</td>
                </tr>
              ))}
              <tr className="bg-canvas/70 font-semibold"><td className="py-2" colSpan={3}>Gross pay</td><td className="py-2 text-right tabular-nums">{n(d.gross)}</td><td colSpan={2} /></tr>
              {d.deductions.map((e, i) => (
                <tr key={`d${i}`}>
                  <td className="py-2 text-red-700">− {e.label}</td><td /><td />
                  <td className="py-2 text-right tabular-nums text-red-700">{n(e.amount)}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{n(e.ytd)}</td>
                  <td className="py-2 pl-4 text-xs text-muted">{e.type}</td>
                </tr>
              ))}
              <tr className="bg-canvas/70 font-semibold"><td className="py-2" colSpan={3}>Deductions / tax</td><td className="py-2 text-right tabular-nums">{n(d.totalDeductions)}</td><td colSpan={2} /></tr>
            </tbody>
          </table>

          <div className="mt-5 flex items-center justify-between rounded-xl bg-navy-900 px-6 py-4 text-white print:border print:border-black print:bg-white print:text-black">
            <span><span className="block text-xs tracking-[0.2em] text-white/60 print:text-black/60">NET PAY</span><span className="text-xs text-white/60 print:text-black/60">Year to date PKR {n(d.ytdNet)}</span></span>
            <span className="font-display text-2xl font-semibold tabular-nums">PKR {n(d.net)}</span>
          </div>
        </section>

        <section className="border-t border-line px-8 py-6">
          <p className={label}>Payment detail</p>
          <dl className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {([["Payment method", d.payment.method], ["Bank name", d.payment.bank], ["IBAN / Account number", d.payment.account], ["Branch", d.payment.branch], ["Account title", d.payment.title]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        </section>
        <footer className="bg-canvas px-8 py-3 text-center text-xs text-muted">This is a computer-generated payslip and is confidential. · {d.employer.name}</footer>
      </article>
    </div>
  );
}
