import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { saveCampaign } from "@/app/(app)/calls/actions";

/** New / edit campaign: name, script, WhatsApp message, tries and the CRM lead source. */
export function CampaignForm({ c }: { c?: { id: string; name: string; description: string | null; script: string | null; waMessage: string | null; maxAttempts: number; sourceName: string | null; dialPrefix?: string | null; kind?: string; numbersFrom?: string | null } }) {
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
        <Field label="Campaign type" hint="CSR: the calling team; interested callers go to the sales team by rotation. Sales: sales agents call themselves and an interested caller becomes their own lead. Batches go only to agents of this type.">
          <select name="kind" defaultValue={c?.kind ?? "csr"} className="input">
            <option value="csr">CSR (calling team)</option>
            <option value="sales">Sales agents</option>
          </select>
        </Field>
        <Field label="Numbers came from (optional)" hint="Shown to agents on every call, e.g. “Emaar buyers list, provided by Ahmed”.">
          <input name="numbersFrom" defaultValue={c?.numbersFrom ?? ""} maxLength={190} placeholder="e.g. Emaar buyers list, provided by Ahmed" className="input" />
        </Field>
        <Field label="Tries before giving up"><input name="maxAttempts" type="number" min={1} max={10} defaultValue={c?.maxAttempts ?? 3} className="input" /></Field>
        <Field label="Lead source in the CRM"><input name="sourceName" defaultValue={c?.sourceName ?? "CC"} className="input" /></Field>
        <Field label="Dial prefix (optional)" hint="Added before every number when calling, e.g. 27 for your 3CX route: +971 52 440 7884 is dialled as 27971524407884. The saved number doesn't change.">
          <input name="dialPrefix" defaultValue={c?.dialPrefix ?? ""} inputMode="numeric" pattern="[0-9*#+]{0,10}" maxLength={10} placeholder="e.g. 27" className="input w-40 font-mono" />
        </Field>
      </div>
      <SubmitButton>{c ? "Save" : "Create campaign"}</SubmitButton>
    </ActionForm>
  );
}
