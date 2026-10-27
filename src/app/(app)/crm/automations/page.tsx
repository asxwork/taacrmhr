import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Workflow } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_CONFIG, describe, parseConfig } from "@/lib/automations";
import { fmtDateTime } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { deleteAutomation, saveAutomation } from "./actions";

export const metadata = { title: "Automations" };

/** Super Admin: named bulk actions (e.g. Reshuffle) that run on leads selected in the lead list. */
export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  const sp = await searchParams;
  const [automations, stages, agents] = await Promise.all([
    db.automation.findMany({ orderBy: { name: "asc" } }),
    db.leadStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const editing = sp.new ? null : sp.edit ? automations.find((a) => a.id === sp.edit) : undefined;
  const c = editing ? parseConfig(editing.config) : DEFAULT_CONFIG;

  return (
    <>
      <PageHeader
        title="Automations"
        description="Ready-made actions you run on leads you select in the lead list (With selected → Run automation)."
        actions={<LinkButton href="/crm/automations?new=1" scroll={false}><Plus className="size-4" /> New automation</LinkButton>}
      />
      {automations.length === 0 ? <Card><EmptyState title="No automations yet" /></Card> : (
        <div className="space-y-3">
          {automations.map((a) => {
            const cfg = parseConfig(a.config);
            return (
              <Card key={a.id} className="flex flex-wrap items-start gap-4 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-900/[0.07] text-navy-900"><Workflow className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{a.name}</p>
                    {!a.active && <Badge>Off</Badge>}
                    {(cfg.deleteHistory || cfg.deleteOpen) && <Badge tone="red">Deletes activities</Badge>}
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                    {describe(cfg, { stage: stages.find((s) => s.id === cfg.stageId)?.name, users: agents.filter((u) => cfg.userIds.includes(u.id)).map((u) => u.name) }).map((s) => <li key={s}>{s}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-muted">Run {a.runs} time{a.runs === 1 ? "" : "s"}{a.lastRunAt ? ` · last ${fmtDateTime(a.lastRunAt)}` : ""}</p>
                </div>
                <Link href={`/crm/automations?edit=${a.id}`} scroll={false} className="text-sm font-medium text-navy-900 hover:underline">Edit</Link>
              </Card>
            );
          })}
        </div>
      )}

      {editing !== undefined && (
        <Drawer title={editing ? `Edit “${editing.name}”` : "New automation"} closeHref="/crm/automations">
          <ActionForm action={saveAutomation} className="space-y-5">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name"><input name="name" required defaultValue={editing?.name ?? ""} className="input" placeholder="e.g. Reshuffle: new agent + New Request" autoFocus /></Field>

            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-1.5 text-xs font-medium text-ink/80">Clean up</legend>
              <Check name="deleteHistory" on={c.deleteHistory}>Delete activity history (calls, notes, meetings, emails)</Check>
              <Check name="deleteOpen" on={c.deleteOpen}>Delete open tasks and planned follow-ups</Check>
              <p className="text-xs text-muted">Automations that delete activities can only be run by a Super Admin. The lead keeps a one-line note of what ran.</p>
            </fieldset>

            <Field label="Move to stage">
              <select name="stageId" defaultValue={c.stageId ?? ""} className="input">
                <option value="">Don&apos;t change the stage</option>
                {stages.filter((s) => s.systemKey !== "onhold").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>

            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-1.5 text-xs font-medium text-ink/80">Responsible agent</legend>
              <select name="assign" defaultValue={c.assign} className="input">
                <option value="keep">Keep the current agent</option>
                <option value="one">Give all to one agent</option>
                <option value="roundrobin">Share round-robin between agents</option>
              </select>
              <p className="text-xs text-muted">Default agents (you can change them each time you run it):</p>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-line p-2.5">
                {agents.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="userIds" value={u.id} defaultChecked={c.userIds.includes(u.id)} className="accent-navy-900" /> {u.name}
                  </label>
                ))}
              </div>
              <Check name="avoidSameAgent" on={c.avoidSameAgent}>Never give a lead back to the agent who already had it</Check>
            </fieldset>

            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-1.5 text-xs font-medium text-ink/80">After</legend>
              <Check name="planCall" on={c.planCall}>Plan a “Call the client” task for the new agent, due now</Check>
              <Check name="markReshuffled" on={c.markReshuffled}>Mark the lead as reshuffled (shows in the list and the “Reshuffled” filter)</Check>
            </fieldset>

            {editing && (
              <Field label="Status">
                <select name="active" defaultValue={editing.active ? "on" : "off"} className="input">
                  <option value="on">On: shown in the lead list</option>
                  <option value="off">Off: hidden</option>
                </select>
              </Field>
            )}
            <SubmitButton>{editing ? "Save" : "Create automation"}</SubmitButton>
          </ActionForm>
          {editing && (
            <form action={deleteAutomation} className="mt-6 border-t border-line pt-4">
              <input type="hidden" name="id" value={editing.id} />
              <button className="text-sm text-red-600 hover:underline">Delete this automation</button>
            </form>
          )}
        </Drawer>
      )}
    </>
  );
}

function Check({ name, on, children }: { name: string; on: boolean; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 accent-navy-900" /> <span>{children}</span>
    </label>
  );
}
