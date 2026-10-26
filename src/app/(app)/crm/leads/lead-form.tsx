import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, LinkButton } from "@/components/ui";
import { INTERESTS, PROPERTY_TYPES } from "@/lib/crm-shared";
import { saveLead } from "./actions";

type LeadValues = {
  id: string; name: string; phone: string | null; phone2: string | null; email: string | null; sourceId: string | null;
  sourceInfo: string | null; projectId: string | null;
  campaign: string | null; interest: string | null; propertyType: string | null; location: string | null;
  budgetMin: number | null; budgetMax: number | null; notes: string | null; ownerId: string | null;
};

type Opt = { id: string; name: string };

/** Bitrix-style "Lead information" panel form: one column, grouped, with the save bar stuck to the bottom. */
export function LeadForm({
  lead,
  sources,
  projects,
  owners,
  stages,
  currentUserId,
  cancelHref,
}: {
  lead?: LeadValues | null;
  sources: Opt[];
  projects: Opt[];
  owners: Opt[];
  /** Only when creating: the stage the new lead starts in. */
  stages?: Opt[];
  currentUserId: string;
  cancelHref: string;
}) {
  return (
    <ActionForm action={saveLead} className="space-y-6">
      {lead && <input type="hidden" name="id" value={lead.id} />}

      <Group title="Lead">
        {stages && stages.length > 0 && (
          <Field label="Stage">
            <select name="statusId" defaultValue={stages[0]!.id} className="input">
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Client name">
          <input name="name" required defaultValue={lead?.name} className="input" autoFocus={!lead} placeholder="e.g. Ahmed Siddiqui" />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" defaultValue={lead?.phone ?? ""} className="input" placeholder="0300-1234567" />
        </Field>
        <Field label="Second phone">
          <input name="phone2" type="tel" defaultValue={lead?.phone2 ?? ""} className="input" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={lead?.email ?? ""} className="input" />
        </Field>
      </Group>

      <Group title="Where it came from">
        <Field label="Source">
          <select name="sourceId" defaultValue={lead?.sourceId ?? ""} className="input">
            <option value="">—</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Source information" hint="e.g. the Zameen ad title, Facebook form or referral name">
          <textarea name="sourceInfo" rows={2} defaultValue={lead?.sourceInfo ?? ""} className="input resize-y" />
        </Field>
        <Field label="Campaign">
          <input name="campaign" defaultValue={lead?.campaign ?? ""} className="input" />
        </Field>
      </Group>

      <Group title="Requirement">
        <Field label="Project">
          <select name="projectId" defaultValue={lead?.projectId ?? ""} className="input">
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interest">
            <select name="interest" defaultValue={lead?.interest ?? "buy"} className="input">
              {INTERESTS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </Field>
          <Field label="Property type">
            <select name="propertyType" defaultValue={lead?.propertyType ?? ""} className="input">
              <option value="">—</option>
              {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Preferred location">
          <input name="location" defaultValue={lead?.location ?? ""} className="input" placeholder="e.g. DHA Phase 8" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Budget from" hint="e.g. 1.5 cr, 45 lac">
            <input name="budgetMin" defaultValue={lead?.budgetMin ?? ""} className="input" />
          </Field>
          <Field label="Budget to">
            <input name="budgetMax" defaultValue={lead?.budgetMax ?? ""} className="input" />
          </Field>
        </div>
      </Group>

      <Group title="More">
        {owners.length > 1 && (
          <Field label="Responsible">
            <select name="ownerId" defaultValue={lead?.ownerId ?? currentUserId} className="input">
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Notes">
          <textarea name="notes" rows={3} defaultValue={lead?.notes ?? ""} className="input resize-y" />
        </Field>
      </Group>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex gap-2 rounded-b-xl border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
        <SubmitButton>{lead ? "Save" : "Create lead"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}
