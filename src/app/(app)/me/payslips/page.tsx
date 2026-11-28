import Link from "@/components/link";
import { format } from "date-fns";
import { ChevronRight, Download, Printer } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthDate } from "@/lib/payroll";
import { fmtPKR } from "@/lib/crm-shared";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "My Payslips" };

/** Every payslip by year, with the year's totals, a CSV download and a printable salary statement. */
export default async function MyPayslipsPage() {
  const user = await requireUser();
  const slips = await db.payslip.findMany({
    where: { employee: { userId: user.id }, run: { status: { in: ["approved", "paid"] } } },
    include: { run: true }, orderBy: { run: { month: "desc" } },
  });
  const years = [...new Set(slips.map((p) => p.run.month.slice(0, 4)))];
  return (
    <>
      <PageHeader title="My Payslips" description="Published after HR approves each month’s payroll. Open one to view or download its PDF; each year has its totals, a CSV and a salary statement for tax or bank papers."
        actions={slips.length > 0 && <a href={"/api/me/payslips"} download className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><Download className="size-4" /> All (CSV)</a>} />
      {slips.length === 0 ? <Card><EmptyState title="No payslips yet" /></Card> : (
        <div className="space-y-6">
          {years.map((y) => {
            const list = slips.filter((p) => p.run.month.startsWith(y));
            const t = list.reduce((a, p) => ({ gross: a.gross + p.earnings, tax: a.tax + p.tax, net: a.net + p.net }), { gross: 0, tax: 0, net: 0 });
            return (
              <Card key={y} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-canvas/50 px-5 py-3">
                  <h2 className="text-lg font-semibold">{y}</h2>
                  <span className="text-xs text-muted">Gross <b className="font-medium text-ink">{fmtPKR(t.gross)}</b></span>
                  <span className="text-xs text-muted">Tax <b className="font-medium text-ink">{fmtPKR(t.tax)}</b></span>
                  <span className="text-xs text-muted">Net <b className="font-medium text-ink">{fmtPKR(t.net)}</b></span>
                  <span className="ml-auto flex gap-2">
                    <a href={`/api/me/payslips?year=${y}`} download className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-navy-900 hover:bg-canvas"><Download className="size-3.5" /> CSV</a>
                    <a href={`/print/salary-statement?year=${y}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-navy-900 hover:bg-canvas"><Printer className="size-3.5" /> Salary statement</a>
                  </span>
                </div>
                <ul className="divide-y divide-line">
                  {list.map((p) => (
                    <li key={p.id}>
                      <Link href={`/payslips/${p.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-canvas/60">
                        <span className="flex-1 font-medium">{format(monthDate(p.run.month), "MMMM yyyy")}</span>
                        <span className="text-sm text-muted">{p.run.status === "paid" ? "Paid" : "Approved"}</span>
                        <span className="font-semibold tabular-nums">{fmtPKR(p.net)}</span>
                        <ChevronRight className="size-4 text-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
