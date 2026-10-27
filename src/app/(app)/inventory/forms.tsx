import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, LinkButton } from "@/components/ui";
import { FREQUENCIES, LISTING_TYPES, SIZE_UNITS, UNIT_TYPES } from "@/lib/inventory-shared";
import { bulkCreateUnits, saveBlock, saveProject, saveUnit } from "./actions";

type Opt = { id: string; name: string };
type ProjectOpt = Opt & { blocks: Opt[] };

type UnitValues = {
  id: string; listingType: string; purpose: string; projectId: string | null; blockId: string | null; unitNo: string; type: string;
  size: number | null; sizeUnit: string; bedrooms: number | null; bathrooms: number | null; floor: string | null; facing: string | null;
  corner: boolean; parkFacing: boolean; mainRoad: boolean; price: number | null; address: string | null; lat: number | null; lng: number | null;
  propertyOwner: string | null; propertyOwnerPhone: string | null; notes: string | null; ownerId: string | null;
};

export function UnitForm({
  unit, projects, owners, currentUserId, cancelHref, allowedTypes, defaults,
}: {
  unit?: UnitValues | null;
  projects: ProjectOpt[];
  owners: Opt[];
  currentUserId: string;
  cancelHref: string;
  /** Listing types this user may create (ignored when editing). */
  allowedTypes: string[];
  defaults?: { projectId?: string; blockId?: string };
}) {
  const types = unit ? LISTING_TYPES.filter((t) => t.value === unit.listingType) : LISTING_TYPES.filter((t) => allowedTypes.includes(t.value));
  return (
    <ActionForm action={saveUnit} className="space-y-4">
      {unit && <input type="hidden" name="id" value={unit.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Listing type">
          <select name="listingType" defaultValue={unit?.listingType ?? types[0]?.value} disabled={!!unit} className="input">
            {types.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Purpose">
          <select name="purpose" defaultValue={unit?.purpose ?? "sale"} className="input">
            <option value="sale">For sale</option>
            <option value="rent">For rent</option>
          </select>
        </Field>
      </div>
      <Field label="Project / block" hint="Required for project stock; optional for listings.">
        <select name="blockId" defaultValue={unit?.blockId ?? defaults?.blockId ?? ""} className="input">
          <option value="">— None —</option>
          {projects.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.blocks.map((b) => (
                <option key={b.id} value={b.id}>{p.name} · {b.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit / plot no.">
          <input name="unitNo" required defaultValue={unit?.unitNo} className="input" placeholder="e.g. A-1203, Plot 45" autoFocus />
        </Field>
        <Field label="Property type">
          <select name="type" defaultValue={unit?.type ?? "Apartment"} className="input">
            {UNIT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Size">
          <input name="size" inputMode="decimal" defaultValue={unit?.size ?? ""} className="input" />
        </Field>
        <Field label="Unit">
          <select name="sizeUnit" defaultValue={unit?.sizeUnit ?? "sqft"} className="input">
            {SIZE_UNITS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Price (PKR)" hint="Monthly rent for rentals">
          <input name="price" defaultValue={unit?.price ?? ""} className="input" placeholder="e.g. 2.5 cr" />
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Field label="Beds">
          <input name="bedrooms" type="number" min={0} defaultValue={unit?.bedrooms ?? ""} className="input" />
        </Field>
        <Field label="Baths">
          <input name="bathrooms" type="number" min={0} defaultValue={unit?.bathrooms ?? ""} className="input" />
        </Field>
        <Field label="Floor">
          <input name="floor" defaultValue={unit?.floor ?? ""} className="input" />
        </Field>
        <Field label="Facing">
          <input name="facing" defaultValue={unit?.facing ?? ""} className="input" placeholder="Park, Sea…" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {([["corner", "Corner"], ["parkFacing", "Park facing"], ["mainRoad", "Main road"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" name={k} defaultChecked={unit?.[k]} className="accent-navy-900" /> {l}
          </label>
        ))}
      </div>

      {(unit ? unit.listingType !== "project" : types.some((t) => t.value !== "project")) && (
        <fieldset className="min-w-0 space-y-3 rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink/80">Listing details (resale / rental)</legend>
          <Field label="Address">
            <input name="address" defaultValue={unit?.address ?? ""} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Property owner">
              <input name="propertyOwner" defaultValue={unit?.propertyOwner ?? ""} className="input" />
            </Field>
            <Field label="Owner phone">
              <input name="propertyOwnerPhone" defaultValue={unit?.propertyOwnerPhone ?? ""} className="input" />
            </Field>
          </div>
          {owners.length > 1 && (
            <Field label="Listing agent">
              <select name="ownerId" defaultValue={unit?.ownerId ?? currentUserId} className="input">
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </Field>
          )}
        </fieldset>
      )}

      <details className="group rounded-lg border border-line px-3 py-2" open={!!(unit?.notes || unit?.lat)}>
        <summary className="cursor-pointer text-sm text-muted group-open:mb-3">More details</summary>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <input name="lat" inputMode="decimal" defaultValue={unit?.lat ?? ""} className="input" placeholder="24.8" />
            </Field>
            <Field label="Longitude">
              <input name="lng" inputMode="decimal" defaultValue={unit?.lng ?? ""} className="input" placeholder="67.06" />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={3} defaultValue={unit?.notes ?? ""} className="input" />
          </Field>
        </div>
      </details>

      {!unit && (
        <Field label="Photos (optional)" hint="Up to 12. The first one is the cover; add more later from the unit page.">
          <input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
        </Field>
      )}
      <div className="flex gap-2 pt-1">
        <SubmitButton>{unit ? "Save changes" : "Add unit"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost" scroll={false}>Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}

type ProjectValues = {
  id: string; name: string; code: string | null; developer: string | null; location: string | null; city: string; kind: string; status: string;
  description: string | null; planDownPct: number | null; planInstallments: number | null; planFrequency: string | null; planPossessionPct: number | null;
};

export function ProjectForm({ project, cancelHref }: { project?: ProjectValues | null; cancelHref: string }) {
  return (
    <ActionForm action={saveProject} className="space-y-4">
      {project && <input type="hidden" name="id" value={project.id} />}
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Project name">
          <input name="name" required defaultValue={project?.name} className="input" autoFocus />
        </Field>
        <Field label="Code">
          <input name="code" defaultValue={project?.code ?? ""} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Developer">
          <input name="developer" defaultValue={project?.developer ?? ""} className="input" />
        </Field>
        <Field label="Location">
          <input name="location" defaultValue={project?.location ?? ""} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="City">
          <input name="city" defaultValue={project?.city ?? "Karachi"} className="input" />
        </Field>
        <Field label="Type">
          <select name="kind" defaultValue={project?.kind ?? "residential"} className="input">
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="mixed">Mixed use</option>
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={project?.status ?? "active"} className="input">
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
      </div>
      <fieldset className="min-w-0 space-y-3 rounded-lg border border-line p-3">
        <legend className="px-1 text-xs font-medium text-ink/80">Standard payment plan</legend>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Down %">
            <input name="planDownPct" type="number" step="0.1" defaultValue={project?.planDownPct ?? ""} className="input" />
          </Field>
          <Field label="Installments">
            <input name="planInstallments" type="number" defaultValue={project?.planInstallments ?? ""} className="input" />
          </Field>
          <Field label="Every">
            <select name="planFrequency" defaultValue={project?.planFrequency ?? "monthly"} className="input">
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Possession %">
            <input name="planPossessionPct" type="number" step="0.1" defaultValue={project?.planPossessionPct ?? ""} className="input" />
          </Field>
        </div>
      </fieldset>
      <Field label="Description">
        <textarea name="description" rows={3} defaultValue={project?.description ?? ""} className="input" />
      </Field>
      {!project && (
        <Field label="Photos (optional)" hint="Up to 12. The first one is the cover shown on project cards.">
          <input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
        </Field>
      )}
      <div className="flex gap-2 pt-1">
        <SubmitButton>{project ? "Save changes" : "Create project"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost" scroll={false}>Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}

export function BlockForm({ projectId, block }: { projectId: string; block?: { id: string; name: string; sortOrder: number } }) {
  return (
    <ActionForm action={saveBlock} className="flex flex-wrap items-end gap-2" successMessage={block ? undefined : "Block added."}>
      <input type="hidden" name="projectId" value={projectId} />
      {block && <input type="hidden" name="id" value={block.id} />}
      <Field label={block ? "Block" : "New block / tower / phase"} className="min-w-40 flex-1">
        <input name="name" required defaultValue={block?.name} className="input" />
      </Field>
      <Field label="Order" className="w-20">
        <input name="sortOrder" type="number" defaultValue={block?.sortOrder ?? 0} className="input" />
      </Field>
      <SubmitButton variant={block ? "secondary" : "primary"}>{block ? "Save" : "Add"}</SubmitButton>
    </ActionForm>
  );
}

export function BulkUnitsForm({ projectId, blocks }: { projectId: string; blocks: Opt[] }) {
  return (
    <ActionForm action={bulkCreateUnits} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="text-sm text-muted">Creates a numbered run of units, e.g. prefix <b className="text-ink">A-</b> from <b className="text-ink">101</b> to <b className="text-ink">110</b> → A-101 … A-110. Existing numbers are skipped.</p>
      <Field label="Block">
        <select name="blockId" required className="input">
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Prefix">
          <input name="prefix" className="input" placeholder="A-" />
        </Field>
        <Field label="From">
          <input name="from" type="number" required className="input" />
        </Field>
        <Field label="To">
          <input name="to" type="number" required className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Type">
          <select name="type" className="input">
            {UNIT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <input name="size" inputMode="decimal" className="input" />
        </Field>
        <Field label="Unit">
          <select name="sizeUnit" className="input">
            {SIZE_UNITS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Beds">
          <input name="bedrooms" type="number" className="input" />
        </Field>
        <Field label="Floor">
          <input name="floor" className="input" />
        </Field>
        <Field label="Price each">
          <input name="price" className="input" placeholder="e.g. 3.2 cr" />
        </Field>
      </div>
      <SubmitButton pendingText="Creating…">Create units</SubmitButton>
    </ActionForm>
  );
}
