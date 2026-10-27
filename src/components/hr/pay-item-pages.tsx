import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { monthDate } from "@/lib/payroll";
import { fmtPKR } from "@/lib/crm-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, Field } from "@/components/ui";
import { deletePayItem, savePayItem } from "@/app/(app)/hr/payroll/extra-actions";

/** Add form + list for one kind of manual pay item (rewards, manual commission). */
export async function PayItemManager({ kind, month, canEdit, labelHint }: { kind: "reward" | "commission"; month: string; canEdit: boolean; labelHint: string }) {
  const [items, staff] = await Promise.all([
    db.payItem.findMany({ where: { kind, month }, include: { employee: { select: { fullName: true, code: true } } }, orderBy: { createdAt: "desc" } }),
    canEdit ? db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }) : [],
  ]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-x-auto">
        {items.length === 0 ? <EmptyState title={`Nothing for ${format(monthDate(month), "MMMM yyyy")} yet`} /> : (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">For</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2.5"><span className="font-medium">{i.employee.fullName}</span> <span className="text-xs text-muted">{i.employee.code}</span></td>
                  <td className="px-4 py-2.5">{i.label.replace(/^(Reward|Commission): /, "")}{!i.taxable && <span className="ml-1 text-xs text-muted">(tax-free)</span>}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtPKR(i.amount)}</td>
                  <td className="px-4 py-2.5 text-right">{canEdit && <form action={deletePayItem}><input type="hidden" name="id" value={i.id} /><button aria-label="Remove" title="Remove" className="p-1 text-muted hover:text-red-600"><Trash2 className="size-3.5" /></button></form>}</td>
                </tr>
              ))}
              <tr className="bg-canvas/40 font-semibold"><td className="px-4 py-2.5" colSpan={2}>Total</td><td className="px-4 py-2.5 text-right tabular-nums">{fmtPKR(items.reduce((t, i) => t + i.amount, 0))}</td><td /></tr>
            </tbody>
          </table>
        )}
      </Card>
      {canEdit && (
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold">Add {kind === "reward" ? "a reward" : "commission"}</h2>
          <ActionForm action={savePayItem} className="space-y-3">
            <input type="hidden" name="kind" value={kind} />
            <Field label="Employee"><select name="employeeId" required className="input"><option value="">Choose…</option>{staff.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}</select></Field>
            <Field label="For"><input name="label" required className="input" placeholder={labelHint} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (PKR)"><input name="amount" type="number" min={1} required className="input" /></Field>
              <Field label="Payroll month"><input name="month" type="month" required defaultValue={month} className="input" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="taxable" defaultChecked /> Taxable</label>
            <SubmitButton>Add to payroll</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
