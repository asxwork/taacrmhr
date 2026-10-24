import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, LinkButton } from "@/components/ui";
import { saveCompany, saveContact } from "./actions";

type Opt = { id: string; name: string };

type ContactValues = {
  id: string; name: string; phone: string | null; phone2: string | null; email: string | null; cnic: string | null;
  address: string | null; companyId: string | null; sourceId: string | null; notes: string | null; ownerId: string | null;
};

export function ContactForm({ contact, companies, sources, owners, currentUserId, cancelHref }: {
  contact?: ContactValues | null; companies: Opt[]; sources: Opt[]; owners: Opt[]; currentUserId: string; cancelHref: string;
}) {
  return (
    <ActionForm action={saveContact} className="space-y-4">
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <Field label="Full name">
        <input name="name" required defaultValue={contact?.name} className="input" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <input name="phone" type="tel" defaultValue={contact?.phone ?? ""} className="input" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={contact?.email ?? ""} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company">
          <select name="companyId" defaultValue={contact?.companyId ?? ""} className="input">
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="…or new company">
          <input name="newCompany" className="input" placeholder="Company name" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Source">
          <select name="sourceId" defaultValue={contact?.sourceId ?? ""} className="input">
            <option value="">—</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        {owners.length > 1 ? (
          <Field label="Responsible">
            <select name="ownerId" defaultValue={contact?.ownerId ?? currentUserId} className="input">
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </Field>
        ) : <span />}
      </div>
      <details className="group rounded-lg border border-line px-3 py-2" open={!!(contact?.cnic || contact?.address || contact?.notes)}>
        <summary className="cursor-pointer text-sm text-muted group-open:mb-3">More details</summary>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Second phone">
              <input name="phone2" defaultValue={contact?.phone2 ?? ""} className="input" />
            </Field>
            <Field label="CNIC">
              <input name="cnic" defaultValue={contact?.cnic ?? ""} className="input" placeholder="42101-1234567-1" />
            </Field>
          </div>
          <Field label="Address">
            <input name="address" defaultValue={contact?.address ?? ""} className="input" />
          </Field>
          <Field label="Notes">
            <textarea name="notes" rows={3} defaultValue={contact?.notes ?? ""} className="input" />
          </Field>
        </div>
      </details>
      <div className="flex gap-2 pt-1">
        <SubmitButton>{contact ? "Save changes" : "Create contact"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost" scroll={false}>Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}

type CompanyValues = { id: string; name: string; phone: string | null; email: string | null; industry: string | null; address: string | null; notes: string | null; ownerId: string | null };

export function CompanyForm({ company, owners, currentUserId, cancelHref }: { company?: CompanyValues | null; owners: Opt[]; currentUserId: string; cancelHref: string }) {
  return (
    <ActionForm action={saveCompany} className="space-y-4">
      {company && <input type="hidden" name="id" value={company.id} />}
      <Field label="Company name">
        <input name="name" required defaultValue={company?.name} className="input" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <input name="phone" defaultValue={company?.phone ?? ""} className="input" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={company?.email ?? ""} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Industry">
          <input name="industry" defaultValue={company?.industry ?? ""} className="input" />
        </Field>
        {owners.length > 1 ? (
          <Field label="Responsible">
            <select name="ownerId" defaultValue={company?.ownerId ?? currentUserId} className="input">
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </Field>
        ) : <span />}
      </div>
      <Field label="Address">
        <input name="address" defaultValue={company?.address ?? ""} className="input" />
      </Field>
      <Field label="Notes">
        <textarea name="notes" rows={3} defaultValue={company?.notes ?? ""} className="input" />
      </Field>
      <div className="flex gap-2 pt-1">
        <SubmitButton>{company ? "Save changes" : "Create company"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost" scroll={false}>Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}
