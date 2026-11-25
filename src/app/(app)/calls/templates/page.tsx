import Link from "@/components/link";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { isCallSupervisor } from "@/lib/calls";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteCallTemplate, saveCallTemplate } from "../actions";

export const metadata = { title: "Message templates" };

/** Calls → Templates: WhatsApp texts agents pick in the dialer. Everyone has their own; supervisors can share theirs. */
export default async function CallTemplatesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePermission("calls");
  const supervisor = isCallSupervisor(user);
  const sp = await searchParams;
  const rows = await db.callTemplate.findMany({ where: supervisor ? {} : { OR: [{ ownerId: user.id }, { shared: true }] }, orderBy: [{ shared: "desc" }, { name: "asc" }] });
  // Campaigns a template can be for: the agent's own campaigns (supervisors: every campaign that isn't finished).
  const campaigns = supervisor
    ? await db.callCampaign.findMany({ where: { status: { not: "done" } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } })
    : await db.callCampaign.findMany({ where: { targets: { some: { assigneeId: user.id } } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const campName = new Map((await db.callCampaign.findMany({ where: { id: { in: rows.map((r) => r.campaignId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const owners = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.ownerId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const mayEdit = (r: (typeof rows)[number]) => r.ownerId === user.id || supervisor;
  const editing = rows.find((r) => r.id === sp.edit && mayEdit(r));
  const form = (t?: (typeof rows)[number]) => (
    <ActionForm key={t?.id ?? "new"} action={saveCallTemplate} successHref="/calls/templates" className="space-y-3">
      {t && <input type="hidden" name="id" value={t.id} />}
      <label className="block text-sm font-medium">Name<input name="name" required defaultValue={t?.name} placeholder="e.g. First message, Brochure, After no answer" className="input mt-1" /></label>
      <label className="block text-sm font-medium">Message
        <textarea name="body" required rows={7} defaultValue={t?.body} className="input mt-1" placeholder={"Assalam o Alaikum {{name}}, this is {{agent}} from The Advisor Associates…"} />
      </label>
      <label className="block text-sm font-medium">Use it in
        <select name="campaignId" defaultValue={t?.campaignId ?? ""} className="input mt-1">
          <option value="">All my campaigns</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="mt-1 block text-xs font-normal text-muted">A template for one campaign shows only in that campaign&apos;s dialer, at the top of the list.</span>
      </label>
      <p className="text-xs text-muted"><code>{"{{name}}"}</code> becomes the client&apos;s name and <code>{"{{agent}}"}</code> your name.</p>
      {supervisor && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shared" defaultChecked={t?.shared} className="accent-navy-900" /> Shared: every calling agent can use it</label>}
      <div className="flex items-center gap-3">
        <SubmitButton>{t ? "Save changes" : "Add template"}</SubmitButton>
        {t && <Link href="/calls/templates" className="text-sm text-muted hover:underline">Cancel</Link>}
      </div>
    </ActionForm>
  );
  return (
    <>
      <PageHeader title="Message templates" description="Messages you send with the WhatsApp button in the dialer: pick one under the WhatsApp button and it's filled in with the client's name." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {rows.length === 0 ? <Card><EmptyState title="No templates yet" description="Add your first message on the right." /></Card> : rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{r.name}</p>
                {r.shared ? <Badge tone="green">Shared</Badge> : r.ownerId !== user.id && <Badge tone="neutral">{owners.get(r.ownerId ?? "") ?? "Agent"}</Badge>}
                <Badge tone={r.campaignId ? "navy" : "neutral"}>{r.campaignId ? campName.get(r.campaignId) ?? "Campaign" : "All campaigns"}</Badge>
                {mayEdit(r) && (
                  <div className="ml-auto flex items-center gap-1">
                    <Link href={`/calls/templates?edit=${r.id}`} className="rounded-md px-2 py-1 text-sm text-navy-900 hover:bg-canvas dark:text-ink">Edit</Link>
                    <form action={deleteCallTemplate}><input type="hidden" name="id" value={r.id} /><ConfirmButton message={`Delete the template “${r.name}”?`} className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50">Delete</ConfirmButton></form>
                  </div>
                )}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{r.body}</p>
            </Card>
          ))}
        </div>
        <Card className="h-fit p-5">
          <p className="mb-3 font-semibold">{editing ? "Edit template" : "New template"}</p>
          {form(editing)}
        </Card>
      </div>
    </>
  );
}
