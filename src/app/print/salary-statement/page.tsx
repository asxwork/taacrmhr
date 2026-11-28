import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthDate } from "@/lib/payroll";
import { PrintButton } from "../employee/[id]/print-button";

const n = (v: number) => Math.round(v).toLocaleString("en-PK");

export const metadata = { title: "Salary statement" };

/** My salary statement for a year (all payslips, totals): for tax returns, bank or visa applications. */
export default async function SalaryStatement({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? sp.year! : String(new Date().getFullYear());
  const [emp, slips, company] = await Promise.all([
    db.employee.findUnique({ where: { userId: user.id }, select: { fullName: true, code: true, cnic: true, designation: { select: { name: true } } } }).catch(() => null),
    db.payslip.findMany({ where: { employee: { userId: user.id }, run: { status: { in: ["approved", "paid"] }, month: { startsWith: year } } }, include: { run: { select: { month: true } } }, orderBy: { run: { month: "asc" } } }),
    db.setting.findUnique({ where: { key: "company.name" } }),
  ]);
  const t = slips.reduce((a, p) => ({ gross: a.gross + p.earnings, ded: a.ded + p.deductions, tax: a.tax + p.tax, net: a.net + p.net }), { gross: 0, ded: 0, tax: 0, net: 0 });
  const name = company?.value || "The Advisor Associates";
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-white p-10 text-[#0a223c] print:p-0">
      <style>{`@page { size: A4; margin: 16mm } body { background: #fff !important }`}</style>
      <div className="mb-8 flex justify-end print:hidden"><PrintButton target="main" fileName={`Salary statement ${year}`} dark /></div>
      <header className="mb-8 flex items-center justify-between border-b-2 border-[#d4b26a] pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/logo-blue.svg" alt={name} className="h-12" />
        <p className="text-right text-[10px] leading-snug text-slate-500">{name}<br />Payroll</p>
      </header>
      <h1 className="font-serif text-2xl font-semibold">Salary statement {year}</h1>
      <p className="mt-2 text-sm">{emp?.fullName ?? user.name}{emp?.code ? ` · ${emp.code}` : ""}{emp?.designation?.name ? ` · ${emp.designation.name}` : ""}{emp?.cnic ? ` · CNIC ${emp.cnic}` : ""}</p>
      <table className="mt-6 w-full text-sm">
        <thead className="border-b border-slate-300 text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Month</th><th className="py-2 text-right">Gross</th><th className="py-2 text-right">Deductions</th><th className="py-2 text-right">Income tax</th><th className="py-2 text-right">Net pay</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {slips.map((p) => <tr key={p.id}><td className="py-1.5">{format(monthDate(p.run.month), "MMMM yyyy")}</td><td className="py-1.5 text-right tabular-nums">{n(p.earnings)}</td><td className="py-1.5 text-right tabular-nums">{n(p.deductions)}</td><td className="py-1.5 text-right tabular-nums">{n(p.tax)}</td><td className="py-1.5 text-right font-medium tabular-nums">{n(p.net)}</td></tr>)}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 font-semibold"><tr><td className="py-2">Total (PKR)</td><td className="py-2 text-right tabular-nums">{n(t.gross)}</td><td className="py-2 text-right tabular-nums">{n(t.ded)}</td><td className="py-2 text-right tabular-nums">{n(t.tax)}</td><td className="py-2 text-right tabular-nums">{n(t.net)}</td></tr></tfoot>
      </table>
      {slips.length === 0 && <p className="mt-6 text-sm text-slate-500">No published payslips in {year}.</p>}
      <footer className="mt-16 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">Computer-generated statement from the payslips on record · {format(new Date(), "d MMM yyyy")} · {name}</footer>
    </main>
  );
}
