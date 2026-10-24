import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, LinkButton } from "@/components/ui";
import { INTERESTS, PROPERTY_TYPES } from "@/lib/crm-shared";
import { saveLead } from "./actions";

type LeadValues = {
  id: string; name: string; phone: string | null; phone2: string | null; email: string | null; sourceId: string | null;
  campaign: string | null; interest: string | null; propertyType: string | null; location: string | null;
  budgetMin: number | null; budgetMax: number | null; notes: string | null; ownerId: string | null;
};

export function LeadForm({
  lead,
  sources,
  owners,
  currentUserId,
  cancelHref,
}: {
  lead?: LeadValues | null;
  sources: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  currentUserId: string;
  cancelHref: string;
}) {
  return (
    <ActionForm action={saveLead} className="space-y-4">
      {lead && <input type="hidden" name="id" value={lead.id} />}
      <Field label="Client name">
        <input name="name" required defaultValue={lead?.name} className="input" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <input name="phone" type="tel" defaultValue={lead?.phone ?? ""} className="input" placeholder="0300-1234567" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={lead?.email ?? ""} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Source">
          <select name="sourceId" defaultValue={lead?.sourceId ?? ""} className="input">
            <option value="">—</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Interest">
          <select name="interest" defaultValue={lead?.interest ?? "buy"} className="input">
            {INTERESTS.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Property type">
          <select name="propertyType" defaultValue={lead?.propertyType ?? ""} className="input">
            <option value="">—</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Preferred location / project">
          <input name="location" defaultValue={lead?.location ?? ""} className="input" placeholder="e.g. DHA Phase 8" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Budget from" hint="e.g. 1.5 cr, 45 lac">
          <input name="budgetMin" defaultValue={lead?.budgetMin ?? ""} className="input" />
        </Field>
        <Field label="Budget to">
          <input name="budgetMax" defaultValue={lead?.budgetMax ?? ""} className="input" />
        </Field>
      </div>
      {owners.length > 1 && (
        <Field label="Responsible">
          <select name="ownerId" defaultValue={lead?.ownerId ?? currentUserId} className="input">
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
      )}

      <details className="group rounded-lg border border-line px-3 py-2" open={!!(lead?.phone2 || lead?.campaign || lead?.notes)}>
        <summary className="cursor-pointer text-sm text-muted group-open:mb-3">More details</summary>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Second phone">
              <input name="phone2" defaultValue={lead?.phone2 ?? ""} className="input" />
            </Field>
            <Field label="Campaign">
              <input name="campaign" defaultValue={lead?.campaign ?? ""} className="input" />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={3} defaultValue={lead?.notes ?? ""} className="input" />
          </Field>
        </div>
      </details>

      <div className="flex gap-2 pt-1">
        <SubmitButton>{lead ? "Save changes" : "Create lead"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost" scroll={false}>Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}
