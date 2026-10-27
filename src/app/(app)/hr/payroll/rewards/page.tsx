import { format } from "date-fns";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { PayItemManager } from "@/components/hr/pay-item-pages";

export const metadata = { title: "Rewards" };

/** Payroll → Settings → Rewards: one-off bonuses paid with a month's payroll (and noted on the employee's history). */
export default async function RewardsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("hr.payroll");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : format(new Date(), "yyyy-MM");
  return (
    <>
      <PageHeader title="Rewards" description="Bonuses and spot awards. They are added to that month's payroll when it is calculated."
        actions={<AutoFilterForm><input type="month" name="month" defaultValue={month} className="input h-9" aria-label="Month" /></AutoFilterForm>} />
      <PayItemManager kind="reward" month={month} canEdit={user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all"} labelHint="e.g. Top closer of the month" />
    </>
  );
}
