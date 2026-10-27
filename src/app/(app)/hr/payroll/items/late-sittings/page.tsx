import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { monthDate, payrollSettings } from "@/lib/payroll";
import { lateSittingSuggestions } from "@/lib/payroll-extra";
import { fmtPKR } from "@/lib/crm-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { saveLateSittings } from "../../extra-actions";

export const metadata = { title: "No. Of Late Sittings" };

/** Custom Payitems → No. Of Late Sittings: count per employee (suggested from attendance) × a fixed rate. */
export default async function LateSittingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("hr.payroll");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : format(new Date(), "yyyy-MM");
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";
  const employees = await db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true, shift: { select: { end: true } } }, orderBy: { fullName: "asc" } });
  const [suggested, saved, settings] = await Promise.all([
    lateSittingSuggestions(month, employees.map((e) => e.id)),
    db.payItem.findMany({ where: { month, kind: "late_sitting" } }),
    payrollSettings(),
  ]);
  const savedBy = new Map(saved.map((s) => [s.employeeId, s]));

  return (
    <>
      <PageHeader title="No. Of Late Sittings" description="Staying an hour or more after the shift ends counts as a late sitting. The suggestion comes from attendance; adjust and save to pay them with the month's payroll."
        actions={<AutoFilterForm><input type="month" name="month" defaultValue={month} className="input h-9" aria-label="Month" /></AutoFilterForm>} />
      <Card className="p-5">
        <ActionForm action={saveLateSittings}>
          <input type="hidden" name="month" value={month} />
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <Field label="Rate per sitting (PKR)"><input name="rate" type="number" min={0} defaultValue={saved[0]?.rate ?? settings.lateSittingRate} disabled={!canEdit} className="input w-40" /></Field>
            <p className="pb-2 text-sm text-muted">{format(monthDate(month), "MMMM yyyy")} · total {fmtPKR(saved.reduce((t, s) => t + s.amount, 0))} saved</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Shift ends</th><th className="px-4 py-2.5 text-right">From attendance</th><th className="px-4 py-2.5 text-right">Sittings to pay</th><th className="px-4 py-2.5 text-right">Saved amount</th></tr></thead>
              <tbody className="divide-y divide-line">
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2"><span className="font-medium">{e.fullName}</span> <span className="text-xs text-muted">{e.code}</span></td>
                    <td className="px-4 py-2 text-xs text-muted">{e.shift?.end ?? "default"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{suggested.get(e.id) ?? 0}</td>
                    <td className="px-4 py-2 text-right"><input name={`n:${e.id}`} type="number" min={0} disabled={!canEdit} defaultValue={savedBy.get(e.id)?.quantity ?? suggested.get(e.id) ?? 0} className="input h-8 w-20 text-right" aria-label={`Late sittings for ${e.fullName}`} /></td>
                    <td className="px-4 py-2 text-right tabular-nums">{savedBy.get(e.id) ? fmtPKR(savedBy.get(e.id)!.amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && <div className="mt-4"><SubmitButton>Save late sittings</SubmitButton></div>}
        </ActionForm>
      </Card>
    </>
  );
}
