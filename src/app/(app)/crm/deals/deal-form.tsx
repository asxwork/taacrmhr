import { format } from "date-fns";
import { fmtPhone } from "@/lib/crm-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, LinkButton } from "@/components/ui";
import { saveDeal } from "./actions";

type DealValues = {
  id: string; title: string; pipelineId: string; contactId: string | null; value: number | null; commissionPct: number | null;
  expectedClose: Date | null; sourceId: string | null; notes: string | null; ownerId: string | null;
};
type Opt = { id: string; name: string };

export function DealForm({
  deal, pipelines, contacts, sources, owners, currentUserId, cancelHref, defaultPipelineId, defaultContactId,
}: {
  deal?: DealValues | null;
  pipelines: Opt[];
  contacts: (Opt & { phone: string | null })[];
  sources: Opt[];
  owners: Opt[];
  currentUserId: string;
  cancelHref: string;
  defaultPipelineId?: string;
  defaultContactId?: string;
}) {
  return (
    <ActionForm action={saveDeal} className="space-y-4">
      {deal && <input type="hidden" name="id" value={deal.id} />}
      <Field label="Deal title" hint="e.g. 3-bed apartment — DHA Phase 8">
        <input name="title" required defaultValue={deal?.title} className="input" autoFocus />
      </Field>
      {!deal && (
        <Field label="Pipeline">
          <select name="pipelineId" defaultValue={defaultPipelineId} className="input">
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Value (PKR)" hint="e.g. 2.5 cr, 80 lac">
          <input name="value" defaultValue={deal?.value ?? ""} className="input" />
        </Field>
        <Field label="Expected close">
          <input name="expectedClose" type="date" defaultValue={deal?.expectedClose ? format(deal.expectedClose, "yyyy-MM-dd") : ""} className="input" />
        </Field>
      </div>

      <fieldset className="space-y-2 rounded-lg border border-line p-3">
        <legend className="px-1 text-xs font-medium text-ink/80">Client</legend>
        <select name="contactId" defaultValue={deal?.contactId ?? defaultContactId ?? ""} className="input">
          <option value="">— New contact (fill below) —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${fmtPhone(c.phone)}` : ""}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input name="newContactName" placeholder="New contact name" className="input" />
          <input name="newContactPhone" placeholder="Phone" className="input" />
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Source">
          <select name="sourceId" defaultValue={deal?.sourceId ?? ""} className="input">
            <option value="">—</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Commission %">
          <input name="commissionPct" type="number" step="0.01" min="0" max="100" defaultValue={deal?.commissionPct ?? ""} className="input" />
        </Field>
      </div>
      {owners.length > 1 && (
        <Field label="Responsible">
          <select name="ownerId" defaultValue={deal?.ownerId ?? currentUserId} className="input">
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Notes">
        <textarea name="notes" rows={3} defaultValue={deal?.notes ?? ""} className="input" />
      </Field>
      <div className="flex gap-2 pt-1">
        <SubmitButton>{deal ? "Save changes" : "Create deal"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost" scroll={false}>Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}
