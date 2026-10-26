import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { COLOR_NAMES, color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { holdConfig } from "@/lib/lead-hold";
import { deleteStage, saveHoldRules, saveLeadSource, saveLeadStatus, savePipeline, saveStage } from "./actions";

export const metadata = { title: "CRM Settings" };

function ColorSelect({ value }: { value?: string }) {
  return (
    <select name="color" defaultValue={value ?? "slate"} className="input w-24" aria-label="Colour">
      {COLOR_NAMES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

const Dot = ({ c }: { c: string }) => <span className={cn("size-2.5 shrink-0 rounded-full", color(c).dot)} />;
function UnitStatusSelect({ value, disabled }: { value?: string | null; disabled?: boolean }) {
  return (
    <select name="unitStatus" defaultValue={value ?? ""} disabled={disabled} className="input w-36" aria-label="Sets unit to" title="Linked units are set to this status when a deal enters the stage">
      <option value="">Unit: no change</option>
      <option value="hold">Unit → On hold</option>
      <option value="booked">Unit → Booked</option>
      <option value="sold">Unit → Sold</option>
      <option value="rented">Unit → Rented</option>
    </select>
  );
}

const Order = ({ value }: { value: number }) => <input name="sortOrder" type="number" defaultValue={value} className="input w-16" aria-label="Order" title="Order" />;

export default async function CrmSettingsPage() {
  const user = await requirePermission("settings.company");
  const editable = can(user, "settings.company", "edit");
  const [statuses, pipelines, sources, hold, people] = await Promise.all([
    db.leadStatus.findMany({ include: { _count: { select: { leads: true } } }, orderBy: { sortOrder: "asc" } }),
    db.pipeline.findMany({ include: { stages: { include: { _count: { select: { deals: true } } }, orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } }),
    db.leadSource.findMany({ include: { _count: { select: { leads: true } } }, orderBy: { sortOrder: "asc" } }),
    holdConfig(db),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const newStage = statuses.find((s) => s.systemKey === "new");
  const holdStage = statuses.find((s) => s.systemKey === "onhold");

  return (
    <>
      <PageHeader title="CRM Settings" description="Lead statuses, deal pipelines and lead sources. Lower order numbers come first. “Unit →” sets linked property units when a deal enters that stage; Lost always releases them." />
      <fieldset disabled={!editable} className="space-y-10">
        <Section title="Lead statuses" hint="Open = active work. Converted = set automatically on convert. Junk = closed without a deal.">
          <Card className="divide-y divide-line">
            {statuses.map((s) => (
              <ActionForm key={s.id} action={saveLeadStatus} className="flex flex-wrap items-center gap-2 p-3">
                <input type="hidden" name="id" value={s.id} />
                <Dot c={s.color} />
                <input name="name" defaultValue={s.name} required className="input w-44" aria-label="Name" />
                <ColorSelect value={s.color} />
                <select name="kind" defaultValue={s.kind} className="input w-32" aria-label="Kind">
                  <option value="open">Open</option>
                  <option value="converted">Converted</option>
                  <option value="junk">Junk</option>
                </select>
                <Order value={s.sortOrder} />
                <label className="flex items-center gap-1.5 px-1 text-sm text-muted">
                  <input type="checkbox" name="active" defaultChecked={s.active} className="accent-navy-900" /> Active
                </label>
                <span className="flex-1" />
                {s.systemKey && <Badge tone="gold">{s.systemKey === "onhold" ? "System: set automatically" : "System: start stage"}</Badge>}
                <Badge>{s._count.leads} leads</Badge>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
            ))}
            <ActionForm action={saveLeadStatus} className="flex flex-wrap items-center gap-2 bg-canvas/50 p-3">
              <input name="name" required placeholder="New status" className="input w-44" />
              <ColorSelect />
              <select name="kind" className="input w-32" defaultValue="open">
                <option value="open">Open</option>
                <option value="junk">Junk</option>
              </select>
              <Order value={(statuses.at(-1)?.sortOrder ?? 0) + 1} />
              <SubmitButton>Add status</SubmitButton>
            </ActionForm>
          </Card>
        </Section>

        <Section title="On-hold rules" hint="Keeps new leads moving. Only the system moves leads to On-hold; nobody can pick it by hand.">
          <Card className="p-4">
            <ActionForm action={saveHoldRules} className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="enabled" defaultChecked={hold.enabled} className="accent-navy-900" /> On
              </label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                A lead still in <b className="font-medium">{newStage?.name ?? "New Request"}</b>
                <input name="toHoldHours" type="number" min={1} max={720} defaultValue={hold.toHoldHours} className="input w-20" aria-label="Hours until On-hold" />
                hours after it was assigned moves to <b className="font-medium">{holdStage?.name ?? "On-hold"}</b>.
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                After
                <input name="reassignHours" type="number" min={1} max={720} defaultValue={hold.reassignHours} className="input w-20" aria-label="Hours on hold until reassignment" />
                hours on hold, the responsible person becomes
                <select name="holdingUserId" defaultValue={hold.holdingUserId ?? ""} className="input w-48" aria-label="Held leads go to">
                  <option value="">— nobody (stay with agent) —</option>
                  {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                and every Super Admin is asked who should get it, with recommended agents (same area, project and branch, lighter workload).
              </div>
              <p className="text-xs text-muted">Giving a held lead to an agent puts it back in {newStage?.name ?? "New Request"} and restarts the clock. Checks run every few minutes while the app is in use, and on the hourly cron link.</p>
              <SubmitButton>Save rules</SubmitButton>
            </ActionForm>
          </Card>
        </Section>

        <Section title="Deal pipelines" hint="Each pipeline has its own stages. Won and Lost close the deal.">
          <div className="space-y-4">
            {pipelines.map((p) => (
              <Card key={p.id} className="overflow-hidden">
                <ActionForm action={savePipeline} className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas/50 p-3">
                  <input type="hidden" name="id" value={p.id} />
                  <input name="name" defaultValue={p.name} required className="input w-48 font-medium" aria-label="Pipeline name" />
                  <Order value={p.sortOrder} />
                  <label className="flex items-center gap-1.5 px-1 text-sm text-muted">
                    <input type="checkbox" name="isDefault" defaultChecked={p.isDefault} className="accent-navy-900" /> Default
                  </label>
                  <span className="flex-1" />
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </ActionForm>
                <div className="divide-y divide-line">
                  {p.stages.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 p-3">
                      <ActionForm action={saveStage} className="flex flex-1 flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={s.id} />
                        <Dot c={s.color} />
                        <input name="name" defaultValue={s.name} required className="input w-44" aria-label="Stage name" />
                        <ColorSelect value={s.color} />
                        <input name="probability" type="number" min={0} max={100} defaultValue={s.probability} className="input w-20" aria-label="Probability %" title="Probability %" />
                        <Order value={s.sortOrder} />
                        <UnitStatusSelect value={s.unitStatus} disabled={s.kind === "lost"} />
                        {s.kind !== "open" && <Badge tone={s.kind === "won" ? "green" : "red"}>{s.kind}</Badge>}
                        <span className="flex-1" />
                        <Badge>{s._count.deals} deals</Badge>
                        <SubmitButton variant="secondary">Save</SubmitButton>
                      </ActionForm>
                      {s.kind === "open" && (
                        <ActionForm action={deleteStage}>
                          <input type="hidden" name="id" value={s.id} />
                          <SubmitButton variant="danger">Remove</SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  ))}
                  <ActionForm action={saveStage} className="flex flex-wrap items-center gap-2 bg-canvas/30 p-3">
                    <input type="hidden" name="pipelineId" value={p.id} />
                    <input name="name" required placeholder="New stage" className="input w-44" />
                    <ColorSelect />
                    <input name="probability" type="number" min={0} max={100} placeholder="%" className="input w-20" />
                    <Order value={(p.stages.filter((s) => s.kind === "open").at(-1)?.sortOrder ?? 0) + 1} />
                    <SubmitButton>Add stage</SubmitButton>
                  </ActionForm>
                </div>
              </Card>
            ))}
            <Card>
              <ActionForm action={savePipeline} className="flex flex-wrap items-center gap-2 p-3">
                <input name="name" required placeholder="New pipeline, e.g. Investments" className="input w-64" />
                <Order value={(pipelines.at(-1)?.sortOrder ?? 0) + 1} />
                <SubmitButton>Add pipeline</SubmitButton>
              </ActionForm>
            </Card>
          </div>
        </Section>

        <Section title="Lead sources" hint="Turn off a source to hide it without losing history.">
          <Card className="divide-y divide-line">
            {sources.map((s) => (
              <ActionForm key={s.id} action={saveLeadSource} className="flex flex-wrap items-center gap-2 p-3">
                <input type="hidden" name="id" value={s.id} />
                <input name="name" defaultValue={s.name} required className="input w-56" aria-label="Source name" />
                <Order value={s.sortOrder} />
                <label className="flex items-center gap-1.5 px-1 text-sm text-muted">
                  <input type="checkbox" name="active" defaultChecked={s.active} className="accent-navy-900" /> Active
                </label>
                <span className="flex-1" />
                <Badge>{s._count.leads} leads</Badge>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
            ))}
            <ActionForm action={saveLeadSource} className="flex items-center gap-2 bg-canvas/50 p-3">
              <input name="name" required placeholder="New source, e.g. TikTok" className="input w-56" />
              <SubmitButton>Add source</SubmitButton>
            </ActionForm>
          </Card>
        </Section>
      </fieldset>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-medium">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p>}
      {children}
    </section>
  );
}
