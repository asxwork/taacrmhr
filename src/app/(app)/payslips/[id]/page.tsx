import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeMatcher } from "@/lib/permissions";
import { monthDate } from "@/lib/payroll";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Payslip" };
const n = (v: number) => Math.round(v).toLocaleString("en-PK");

/** Printable payslip (Ctrl+P / "Save as PDF"). Employees see their own once the run is approved. */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const slip = await db.payslip.findUnique({ where: { id }, include: { run: true, employee: { include: { branch: true } }, lines: { orderBy: { sortOrder: "asc" } } } });
  if (!slip) notFound();
  const own = slip.employee.userId === user.id && slip.run.status !== "draft";
  const hr = can(user, "hr.payroll") && (await scopeMatcher(user, "hr.payroll", "view"))({ ownerId: slip.employee.userId, branchId: slip.employee.branchId });
  if (!own && !hr) notFound();

  const company = (await db.setting.findUnique({ where: { key: "company.name" } }))?.value ?? "The Advisor Associates";
  const earn = slip.lines.filter((l) => l.kind === "earning");
  const ded = slip.lines.filter((l) => l.kind === "deduction");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <article className="print-sheet rounded-xl border border-line bg-surface p-8">
        <header className="flex items-start justify-between border-b border-line pb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-blue.svg" alt={company} className="h-14 w-auto" />
          <div className="text-right">
            <p className="font-display text-2xl font-semibold">Payslip</p>
            <p className="text-sm text-muted">{format(monthDate(slip.run.month), "MMMM yyyy")}</p>
            {slip.run.status === "draft" && <p className="mt-1 text-xs font-semibold uppercase text-amber-700">Draft — not final</p>}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-8 gap-y-1.5 border-b border-line py-5 text-sm">
          {([
            ["Employee", slip.employee.fullName], ["Employee code", slip.employee.code],
            ["Designation", slip.designation ?? "—"], ["Department", slip.department ?? "—"],
            ["Branch", slip.employee.branch?.name ?? "—"], ["CNIC", slip.employee.cnic ?? "—"],
            ["Days paid", `${slip.employedDays} of ${slip.daysInMonth}`], ["Absent / late", `${slip.absentDays} / ${slip.lateCount}`],
            ["Bank", slip.bankName ?? "—"], ["Account", slip.accountNumber ?? "—"],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-8 py-5 sm:grid-cols-2">
          {([["Earnings", earn, slip.earnings], ["Deductions", ded, slip.deductions]] as const).map(([title, rows, total]) => (
            <div key={title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
              {rows.map((l) => <div key={l.id} className="flex justify-between py-1 text-sm"><span>{l.label}</span><span className="tabular-nums">{n(l.amount)}</span></div>)}
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-sm font-semibold"><span>Total {title.toLowerCase()}</span><span className="tabular-nums">{n(total)}</span></div>
            </div>
          ))}
        </section>

        <div className="flex items-center justify-between rounded-lg bg-navy-900 px-5 py-4 text-white print:border print:border-black print:bg-white print:text-black">
          <span className="font-medium">Net pay</span>
          <span className="text-xl font-semibold tabular-nums">PKR {n(slip.net)}</span>
        </div>
        <p className="mt-6 text-center text-xs text-muted">This is a system-generated payslip from {company} and does not require a signature.</p>
      </article>
    </div>
  );
}
