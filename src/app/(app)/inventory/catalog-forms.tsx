import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { KNOWN_AREAS } from "@/lib/inventory-shared";
import { saveArea, saveDeveloper } from "./catalog-actions";

type Dev = { id: string; name: string; contactName: string | null; phone: string | null; email: string | null; website: string | null; notes: string | null };
type Area = { id: string; name: string; city: string; notes: string | null };

export function DeveloperForm({ d }: { d?: Dev | null }) {
  return (
    <ActionForm action={saveDeveloper} className="space-y-4">
      {d && <input type="hidden" name="id" value={d.id} />}
      <Field label="Developer name"><input name="name" required defaultValue={d?.name} placeholder="e.g. ABS Developers" className="input" autoFocus /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Contact person"><input name="contactName" defaultValue={d?.contactName ?? ""} className="input" /></Field>
        <Field label="Phone"><input name="phone" defaultValue={d?.phone ?? ""} inputMode="tel" className="input" /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={d?.email ?? ""} className="input" /></Field>
        <Field label="Website"><input name="website" defaultValue={d?.website ?? ""} placeholder="example.com" className="input" /></Field>
      </div>
      <Field label="Notes" hint="Commission terms, payment plans, who to call for bookings…"><textarea name="notes" rows={4} defaultValue={d?.notes ?? ""} className="input" /></Field>
      <SubmitButton>{d ? "Save developer" : "Add developer"}</SubmitButton>
    </ActionForm>
  );
}

export function AreaForm({ a }: { a?: Area | null }) {
  return (
    <ActionForm action={saveArea} className="space-y-4">
      {a && <input type="hidden" name="id" value={a.id} />}
      <Field label="Area / society"><input name="name" required list="area-suggest" defaultValue={a?.name} placeholder="e.g. DHA Phase 8" className="input" autoFocus /></Field>
      <datalist id="area-suggest">{KNOWN_AREAS.map((n) => <option key={n} value={n} />)}</datalist>
      <Field label="City"><input name="city" defaultValue={a?.city ?? "Karachi"} className="input" /></Field>
      <Field label="Notes" hint="What sells here, typical sizes and prices, landmarks…"><textarea name="notes" rows={4} defaultValue={a?.notes ?? ""} className="input" /></Field>
      <SubmitButton>{a ? "Save area" : "Add area"}</SubmitButton>
    </ActionForm>
  );
}
