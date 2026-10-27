import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { saveCompanyBank, updateCompanyBank } from "../extra-actions";

export const metadata = { title: "Disbursement Banks" };

/** Payroll → Settings → Disbursement Banks: company accounts salaries are paid from; the default heads vouchers. */
export default async function BanksPage() {
  const user = await requirePermission("hr.payroll");
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";
  const banks = await db.companyBank.findMany({ orderBy: [{ active: "desc" }, { isDefault: "desc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader title="Disbursement Banks" description="The company accounts salaries are paid from. The default account appears on payroll vouchers." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-x-auto">
          {banks.length === 0 ? <EmptyState title="No company bank accounts yet" /> : (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Bank</th><th className="px-4 py-2.5">Account title</th><th className="px-4 py-2.5">Account / IBAN</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-line">
                {banks.map((b) => (
                  <tr key={b.id} className={b.active ? undefined : "opacity-50"}>
                    <td className="px-4 py-2.5"><span className="font-medium">{b.name}</span>{b.branch && <span className="block text-xs text-muted">{b.branch}</span>}</td>
                    <td className="px-4 py-2.5">{b.accountTitle}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{b.accountNumber}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {b.isDefault ? <Badge tone="green">default</Badge> : canEdit && b.active && <Op id={b.id} op="default" label="Make default" />}
                        {canEdit && <Op id={b.id} op="toggle" label={b.active ? "Disable" : "Enable"} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        {canEdit && (
          <Card className="h-fit p-5">
            <h2 className="mb-3 text-sm font-semibold">Add account</h2>
            <ActionForm action={saveCompanyBank} className="space-y-3">
              <Field label="Bank"><input name="name" required className="input" placeholder="e.g. Meezan Bank" /></Field>
              <Field label="Branch"><input name="branch" className="input" /></Field>
              <Field label="Account title"><input name="accountTitle" required className="input" /></Field>
              <Field label="Account / IBAN"><input name="accountNumber" required className="input" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" /> Default account</label>
              <SubmitButton>Add account</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}

function Op({ id, op, label }: { id: string; op: string; label: string }) {
  return (
    <form action={updateCompanyBank}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} />
      <button className="rounded px-2 py-1 text-xs text-navy-700 hover:bg-canvas">{label}</button>
    </form>
  );
}
