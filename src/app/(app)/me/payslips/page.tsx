import Link from "next/link";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthDate } from "@/lib/payroll";
import { fmtPKR } from "@/lib/crm-shared";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "My Payslips" };

export default async function MyPayslipsPage() {
  const user = await requireUser();
  const slips = await db.payslip.findMany({
    where: { employee: { userId: user.id }, run: { status: { in: ["approved", "paid"] } } },
    include: { run: true }, orderBy: { run: { month: "desc" } },
  });
  return (
    <>
      <PageHeader title="My Payslips" description="Published after HR approves each month’s payroll." />
      <Card className="overflow-hidden">
        {slips.length === 0 ? <EmptyState title="No payslips yet" /> : (
          <ul className="stagger divide-y divide-line">
            {slips.map((p) => (
              <li key={p.id}>
                <Link href={`/payslips/${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-canvas/60">
                  <span className="flex-1 font-medium">{format(monthDate(p.run.month), "MMMM yyyy")}</span>
                  <span className="text-sm text-muted">{p.run.status === "paid" ? "Paid" : "Approved"}</span>
                  <span className="font-semibold tabular-nums">{fmtPKR(p.net)}</span>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
