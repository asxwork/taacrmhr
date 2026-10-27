import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { PAYMENT_METHODS } from "@/lib/profile-fields";
import { Card, PageHeader } from "@/components/ui";
import { BarList } from "@/components/charts";

export const metadata = { title: "Account Types" };

/** Payroll → Settings → Account Type: how staff are paid (bank, cash, cheque) and which banks they bank with. */
export default async function AccountTypesPage() {
  await requirePermission("hr.payroll");
  const staff = await db.employee.findMany({
    where: { status: { not: "left" } },
    select: { id: true, fullName: true, bankName: true, accountNumber: true, salary: { select: { paymentMethod: true } } },
    orderBy: { fullName: "asc" },
  });
  const methods = PAYMENT_METHODS.map(([v, label]) => ({ v, label, people: staff.filter((e) => (e.salary?.paymentMethod ?? "bank") === v) }));
  const banks = new Map<string, number>();
  for (const e of staff.filter((x) => (x.salary?.paymentMethod ?? "bank") === "bank")) banks.set(e.bankName || "No bank on file", (banks.get(e.bankName || "No bank on file") ?? 0) + 1);
  const missing = staff.filter((e) => (e.salary?.paymentMethod ?? "bank") === "bank" && !e.accountNumber);

  return (
    <>
      <PageHeader title="Account Types" description="Each employee’s payment method is set on their profile (Salary & Benefits); bank accounts in the Banks tab." />
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {methods.map((m) => (
          <Card key={m.v} className="p-5">
            <p className="text-sm text-muted">{m.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{m.people.length}</p>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Employee banks</h2>
          <BarList rows={[...banks.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, value: n, display: String(n) }))} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Paid by bank but no account on file ({missing.length})</h2>
          {missing.length === 0 ? <p className="text-sm text-muted">Everyone paid by bank has an account.</p> : (
            <ul className="divide-y divide-line text-sm">
              {missing.map((e) => <li key={e.id} className="py-2"><Link href={`/hr/employees/${e.id}?tab=banks`} className="hover:underline">{e.fullName}</Link></li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
