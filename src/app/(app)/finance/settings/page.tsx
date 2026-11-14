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
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Approval for big expenses</h2>
          <p className="mb-4 text-sm text-muted">Expenses of this amount or more wait under Finance → Approvals and don&apos;t count until the boss approves. People with Finance → Approve skip it.</p>
          <ActionForm action={saveFinanceSettings} className="flex flex-wrap items-end gap-3">
            <Field label="Needs approval from (Rs)" hint="0 = no approval needed"><input name="approvalAbove" inputMode="decimal" defaultValue={cfg.approvalAbove} className="input w-48" /></Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Alerts for the owner</h2>
          <p className="mb-4 text-sm text-muted">Every Monday the owner (and anyone with Finance: boss dashboard) gets last week&apos;s spending, biggest expenses, missing bills, bills due and cash in hand by email and notification. Also send an instant alert for big single expenses:</p>
          <ActionForm action={saveFinanceSettings} className="flex flex-wrap items-end gap-3">
            <Field label="Alert me for expenses from (Rs)" hint="0 = off"><input name="alertAbove" inputMode="decimal" defaultValue={cfg.alertAbove} className="input w-48" /></Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Close a month</h2>
          <p className="mb-4 text-sm text-muted">After the month&apos;s accounts are checked, close it: entries in that month and earlier can&apos;t be added, changed or deleted (proof can still be attached). Clear the box to reopen.</p>
          <ActionForm action={saveFinanceSettings} className="flex flex-wrap items-end gap-3">
            <Field label="Closed up to and including"><input name="closedThrough" type="month" defaultValue={cfg.closedThrough} className="input w-48" /></Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
          {cfg.closedThrough && <p className="mt-3 text-sm text-emerald-700">Closed through {cfg.closedThrough}.</p>}
        </Card>
      </div>
    </>
  );
}
