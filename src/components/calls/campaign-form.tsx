import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { saveCampaign } from "@/app/(app)/calls/actions";

/** New / edit campaign: name, script, WhatsApp message, tries and the CRM lead source. */
export function CampaignForm({ c }: { c?: { id: string; name: string; description: string | null; script: string | null; waMessage: string | null; maxAttempts: number; sourceName: string | null } }) {
  return (
    <ActionForm action={saveCampaign} className="space-y-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Name"><input name="name" required defaultValue={c?.name} className="input" placeholder="e.g. Palm Residency launch – Nov" /></Field>
      <Field label="Short description"><input name="description" defaultValue={c?.description ?? ""} className="input" /></Field>
      <Field label="Call script" hint="{{name}} = the person's name, {{agent}} = the agent's name">
        <textarea name="script" rows={7} defaultValue={c?.script ?? "Assalam-o-Alaikum {{name}}, this is {{agent}} from The Advisor Associates.\n\nWe have a new launch at Palm Residency with a 25% down payment and 36 monthly installments.\n\nWould you like details on WhatsApp, or a site visit this week?"} className="input" />
      </Field>
      <Field label="WhatsApp message" hint="Opens in WhatsApp ready to send. {{name}} and {{agent}} work here too.">
        <textarea name="waMessage" rows={3} defaultValue={c?.waMessage ?? "Assalam-o-Alaikum {{name}}, this is {{agent}} from The Advisor Associates. As discussed, here are the details:"} className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tries before giving up"><input name="maxAttempts" type="number" min={1} max={10} defaultValue={c?.maxAttempts ?? 3} className="input" /></Field>
        <Field label="Lead source in the CRM"><input name="sourceName" defaultValue={c?.sourceName ?? "CC"} className="input" /></Field>
      </div>
      <SubmitButton>{c ? "Save" : "Create campaign"}</SubmitButton>
    </ActionForm>
  );
}
