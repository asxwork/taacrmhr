import { requirePermission } from "@/lib/permissions";
import { financeConfig } from "@/lib/finance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { saveFinanceSettings } from "../actions";

export const metadata = { title: "Settings · Finance" };

export default async function FinanceSettings() {
  await requirePermission("finance.settings", "edit");
  const cfg = await financeConfig();
  return (
    <>
      <PageHeader title="Finance settings" description="Rules for proof, approvals and closing months." />
      <div className="grid max-w-3xl grid-cols-1 gap-6">
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Proof (bills & receipts)</h2>
          <p className="mb-4 text-sm text-muted">Every entry shows whether it has proof. Entries without it appear under “No proof yet” and on the dashboard.</p>
          <ActionForm action={saveFinanceSettings} className="flex flex-wrap items-end gap-3">
            <Field label="Proof is required from (Rs)" hint="Entries of this amount or more can't be saved without a bill, receipt or screenshot. 0 = never blocked, only flagged.">
              <input name="proofAbove" inputMode="decimal" defaultValue={cfg.proofAbove} className="input w-48" />
            </Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
