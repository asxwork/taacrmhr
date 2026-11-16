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
const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Printable payslip in the company format (Print, or Download PDF). Employees see their own once the run is approved. */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const slip = await db.payslip.findUnique({ where: { id }, select: { id: true, emailedAt: true, run: { select: { status: true } }, employee: { select: { userId: true, branchId: true } } } });
  if (!slip) notFound();
  const own = slip.employee.userId === user.id && slip.run.status !== "draft";
  const hr = can(user, "hr.payroll") && (await scopeMatcher(user, "hr.payroll", "view"))({ ownerId: slip.employee.userId, branchId: slip.employee.branchId });
  if (!own && !hr) notFound();
  const d = (await payslipDoc(id))!;

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
        <PrintButton target="article.print-sheet" fileName={`Payslip ${d.month}`} />
      </div>
      {/* Same layout as the company's Excel payslip (Pay-Slip_fixed.xlsx): navy bar with gold edge, PAYSLIP, details on the right,
          Employer / Employee, Description · Hours · Rate · Amount · YTD · Type, Gross / Deductions / Net, payment detail. */}
      <article className="print-sheet bg-white text-[#0B1F3A] shadow-sm ring-1 ring-line" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        <div className="h-8 border-b-[3px] border-[#B8913A] bg-[#0B1F3A]" />
        <div className="px-6 pb-8 pt-6 sm:px-10">
          {d.status === "draft" && <p className="mb-3 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-800">Draft, not final</p>}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-[40px] font-bold leading-none tracking-tight sm:text-[46px]">PAYSLIP</h1>
            <dl className="grid grid-cols-[auto_auto] gap-x-8 gap-y-1 text-[12.5px]">
              {([["Payslip #", d.number], ["Payment Date", d.paymentDate], ["Pay Period", d.payPeriod], ["Working Days", String(d.workingDays)]] as const).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-right text-[#6B7280]">{k}</dt><dd className="text-right font-bold tabular-nums">{v}</dd></div>
              ))}
            </dl>
          </div>

          <section className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#B8913A]">Employer</p>
              <p className="mt-2 text-[17px] font-bold">{d.employer.name}</p>
              {d.employer.address && <p className="mt-0.5 text-[11.5px] leading-snug">{d.employer.address}</p>}
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#B8913A]">Employee</p>
              <p className="mt-2 text-[17px] font-bold">{d.employee.name}</p>
              <dl className="mt-1 grid grid-cols-[7.5rem_1fr] gap-y-1 text-[12.5px]">
                {([["Employee ID", d.employee.code], ["Designation", d.employee.designation], ["Department", d.employee.department], ["Joining Date", d.joiningDate]] as const).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-[#6B7280]">{k}</dt><dd className="font-bold">{v}</dd></div>
                ))}
              </dl>
            </div>
          </section>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead>
                <tr className="bg-[#0B1F3A] text-[11px] font-bold uppercase text-white">
                  <th className="px-3 py-2.5 text-left">Description</th><th className="px-3 py-2.5 text-right">Hours</th><th className="px-3 py-2.5 text-right">Rate</th><th className="px-3 py-2.5 text-right">Amount</th><th className="px-3 py-2.5 text-right">YTD</th><th className="px-3 py-2.5 text-right">Type</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.label} className="border-b border-[#D9DEE5]">
                    <td className="px-3 py-2.5">{l.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{l.hours != null ? n2(l.hours) : ""}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{l.rate != null ? n2(l.rate) : ""}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{n2(l.amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{n2(l.ytd)}</td>
                    <td className="px-3 py-2.5 text-right text-[#6B7280]">{l.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-[18rem] text-[12.5px]">
              <div className="flex justify-between border-b border-[#D9DEE5] px-2 py-2.5"><dt className="text-[#6B7280]">Gross Pay</dt><dd className="tabular-nums">{n2(d.gross)}</dd></div>
              <div className="flex justify-between border-b border-[#D9DEE5] px-2 py-2.5"><dt className="text-[#6B7280]">Deductions / Tax</dt><dd className="tabular-nums">{n2(d.totalDeductions)}</dd></div>
              <div className="flex items-center justify-between border-l-[3px] border-[#B8913A] bg-[#F1F3F6] px-2 py-3"><dt className="text-[13px] font-bold">NET PAY</dt><dd className="text-[19px] font-bold tabular-nums">{n2(d.net)}</dd></div>
            </dl>
          </div>
          {d.deductions.length > 0 && <p className="mt-2 text-right text-[11px] text-[#6B7280]">Deductions: {d.deductions.map((x) => `${x.label} ${n2(x.amount)}`).join(" · ")}</p>}

          <section className="mt-8">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#B8913A]">Payment Detail</p>
            <dl className="mt-1.5 grid grid-cols-[13rem_1fr] gap-y-1 text-[12.5px]">
              {([["Payment Method", d.payment.method], ["Bank Name", d.payment.bank], ["IBAN / Account Number", d.payment.account], ["Branch", d.payment.branch]] as const).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-[#6B7280]">{k}</dt><dd className="font-bold">{v}</dd></div>
              ))}
            </dl>
          </section>

          <footer className="mt-10 border-t border-[#0B1F3A]/60 pt-2 text-center">
            <p className="text-[10.5px] text-[#6B7280]">This is a computer-generated payslip and is confidential.</p>
            <p className="mt-2 text-[10.5px] font-bold">{d.employer.name}</p>
          </footer>
        </div>
      </article>
    </div>
  );
}
