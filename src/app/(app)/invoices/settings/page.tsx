import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { invoiceApprovers, invoiceConfig } from "@/lib/invoices";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { saveInvoiceSettings } from "../actions";

export const metadata = { title: "Invoice settings" };

export default async function InvoiceSettings() {
  const user = await requireUser();
  if (!user.isSuperAdmin && !(can(user, "invoices", "approve") && can(user, "invoices", "edit"))) redirect("/no-access");
  const [c, approvers] = await Promise.all([invoiceConfig(), invoiceApprovers()]);
  return (
    <>
      <PageHeader title="Invoice settings" description="Numbering, approval rules, automatic sending and reminders." />
      <ActionForm action={saveInvoiceSettings} className="max-w-3xl space-y-6">
        <Card className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
          <Field label="Number prefix" hint={`Next: ${c.prefix}-${new Date().getFullYear()}-${String(c.nextNo).padStart(4, "0")}`}><input name="prefix" defaultValue={c.prefix} className="input" /></Field>
          <Field label="Next number"><input name="nextNo" type="number" min={1} defaultValue={c.nextNo} className="input" /></Field>
          <Field label="Days to pay" hint="Due date for new invoices."><input name="dueDays" type="number" min={0} defaultValue={c.dueDays} className="input" /></Field>
          <Field label="Default tax %"><input name="taxPct" type="number" min={0} step="any" defaultValue={c.taxPct} className="input" /></Field>
        </Card>
        <Card className="space-y-3 p-5">
          <p className="font-medium">Approval</p>
          <Field label="Needs approval from (Rs)" hint="0 = every invoice needs a signed approval. Otherwise smaller invoices are approved straight away."><input name="approvalAbove" type="number" min={0} defaultValue={c.approvalAbove} className="input w-48" /></Field>
          <fieldset><legend className="mb-1.5 text-sm font-medium">Usual approvers (first one is picked by default)</legend>
            <div className="flex flex-wrap gap-3 text-sm">{approvers.map((a) => <label key={a.id} className="flex items-center gap-1.5"><input type="checkbox" name="approverIds" value={a.id} defaultChecked={c.approverIds.includes(a.id)} className="accent-navy-900" /> {a.name}</label>)}</div>
            <p className="mt-1 text-xs text-muted">Anyone whose role has Invoices → approve (Roles &amp; Permissions) can approve.</p>
          </fieldset>
        </Card>
        <Card className="space-y-3 p-5">
          <p className="font-medium">Automation</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoSend" defaultChecked={c.autoSend} className="accent-navy-900" /> Email the invoice to the client as soon as it&apos;s approved</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remindersOn" defaultChecked={c.remindersOn} className="accent-navy-900" /> Send payment reminders (client by email, the invoice owner in AMS)</label>
          <Field label="First reminder (days before due)" hint="Then on the due date, and every 7 days while overdue."><input name="reminderDays" type="number" min={0} max={30} defaultValue={c.reminderDays} className="input w-32" /></Field>
        </Card>
        <Card className="space-y-3 p-5">
          <Field label="Default terms"><textarea name="terms" rows={3} defaultValue={c.terms} className="input" /></Field>
          <Field label="Bank details on every invoice" hint="Account title, bank, IBAN…"><textarea name="bank" rows={3} defaultValue={c.bank} className="input" /></Field>
        </Card>
        <SubmitButton>Save settings</SubmitButton>
      </ActionForm>
    </>
  );
}
