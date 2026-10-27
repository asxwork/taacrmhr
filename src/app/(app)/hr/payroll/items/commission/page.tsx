import Link from "next/link";
import { format } from "date-fns";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { payrollSettings } from "@/lib/payroll";
import { commissionFor } from "@/lib/payroll-extra";
import { fmtPKR } from "@/lib/crm-shared";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { PayItemManager } from "@/components/hr/pay-item-pages";

export const metadata = { title: "Commission" };

/** Custom Payitems → Commission: won CRM deals with a commission % (paid automatically) plus manual commission. */
export default async function CommissionPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("hr.payroll");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : format(new Date(), "yyyy-MM");
  const [deals, settings] = await Promise.all([commissionFor(month), payrollSettings()]);
  const byAgent = new Map<string, { name: string; total: number; n: number; employee: boolean }>();
  for (const d of deals) {
    const cur = byAgent.get(d.owner!.id) ?? { name: d.owner!.name, total: 0, n: 0, employee: !!d.owner!.employee };
    byAgent.set(d.owner!.id, { ...cur, total: cur.total + d.commission, n: cur.n + 1 });
  }

  return (
    <>
      <PageHeader title="Commission" description="From the CRM: won deals closed this month with a commission % on the deal."
        actions={<AutoFilterForm><input type="month" name="month" defaultValue={month} className="input h-9" aria-label="Month" /></AutoFilterForm>} />
      <p className="mb-4 text-sm">
        Deal commission through payroll is <Badge tone={settings.commission ? "green" : "neutral"}>{settings.commission ? "on" : "off"}</Badge>{" "}
        <Link href="/hr/payroll?tab=settings" className="text-navy-700 hover:underline">change in payroll settings</Link>
      </p>
      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-x-auto">
          {deals.length === 0 ? <EmptyState title="No won deals with commission this month" /> : (
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Deal</th><th className="px-4 py-2.5">Agent</th><th className="px-4 py-2.5">Closed</th><th className="px-4 py-2.5 text-right">Value</th><th className="px-4 py-2.5 text-right">%</th><th className="px-4 py-2.5 text-right">Commission</th></tr></thead>
              <tbody className="divide-y divide-line">
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2.5"><Link href={`/crm/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link></td>
                    <td className="px-4 py-2.5">{d.owner!.name}</td>
                    <td className="px-4 py-2.5 text-xs">{d.closedAt ? format(d.closedAt, "d MMM") : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(d.value ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.commissionPct}%</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtPKR(d.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold">By agent</h2>
          {byAgent.size === 0 ? <p className="text-sm text-muted">—</p> : (
            <ul className="divide-y divide-line text-sm">
              {[...byAgent.values()].sort((a, b) => b.total - a.total).map((a) => (
                <li key={a.name} className="flex justify-between py-2"><span>{a.name}{!a.employee && <span className="ml-1 text-xs text-amber-600">(no employee record)</span>}</span><b className="tabular-nums">{fmtPKR(a.total)}</b></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <h2 className="mb-3 text-sm font-semibold">Manual commission</h2>
      <PayItemManager kind="commission" month={month} canEdit={user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all"} labelHint="e.g. Rental referral, Palm Residency" />
    </>
  );
}
