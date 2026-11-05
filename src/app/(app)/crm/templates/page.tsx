import Link from "@/components/link";
import { Mail, MessageCircle, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/templates";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { deleteTemplate, saveTemplate } from "./actions";

export const metadata = { title: "Message templates" };

/** Leads → Templates: WhatsApp / email messages agents send from a lead in one tap. */
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePermission("crm.templates");
  const sp = await searchParams;
  const templates = await db.messageTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const canAdd = can(user, "crm.templates", "create");
  const canEdit = can(user, "crm.templates", "edit");
  const editing: Partial<(typeof templates)[number]> | null | undefined = sp.edit === "new" ? (canAdd ? {} : null) : canEdit ? templates.find((t) => t.id === sp.edit) : null;

  return (
    <>
      <PageHeader title="Message templates" description="Ready-made WhatsApp and email messages. Agents pick one from a lead's page; it opens with the lead's details filled in and is noted on the timeline."
        actions={canAdd && <LinkButton href="/crm/templates?edit=new" scroll={false}><Plus className="size-4" /> New template</LinkButton>} />
      <Card className="overflow-hidden">
        {templates.length === 0 ? <EmptyState title="No templates yet" description="Add your first WhatsApp message, e.g. a site-visit invite." /> : (
          <ul className="divide-y divide-line">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                {t.channel === "email" ? <Mail className="mt-0.5 size-4 text-sky-600" /> : <MessageCircle className="mt-0.5 size-4 text-emerald-600" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{canEdit ? <Link href={`/crm/templates?edit=${t.id}`} scroll={false} className="hover:underline">{t.name}</Link> : t.name} {!t.active && <Badge>Off</Badge>}</p>
                  <p className="line-clamp-2 whitespace-pre-line text-sm text-muted">{t.body}</p>
                </div>
                {can(user, "crm.templates", "delete") && (
                  <form action={deleteTemplate}><input type="hidden" name="id" value={t.id} />
                    <button title="Delete" aria-label="Delete" className="rounded p-1.5 text-muted hover:text-red-600"><Trash2 className="size-4" /></button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <Drawer title={editing.id ? "Edit template" : "New template"} closeHref="/crm/templates">
          <ActionForm action={saveTemplate} className="space-y-4">
            {editing.id && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name"><input name="name" required defaultValue={editing.name ?? ""} className="input" placeholder="e.g. Site visit invite" /></Field>
            <Field label="Send by">
              <select name="channel" defaultValue={editing.channel ?? "whatsapp"} className="input"><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select>
            </Field>
            <Field label="Email subject" hint="Only for email templates"><input name="subject" defaultValue={editing.subject ?? ""} className="input" /></Field>
            <Field label="Message"><textarea name="body" required rows={7} defaultValue={editing.body ?? ""} className="input" placeholder="Hi {first_name}, this is {agent} from {company}…" /></Field>
            <div className="rounded-lg bg-canvas p-3 text-xs text-muted">
              <p className="mb-1 font-medium text-ink">Placeholders</p>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">{TEMPLATE_PLACEHOLDERS.map(([k, l]) => <li key={k}><code className="text-navy-900">{k}</code> {l}</li>)}</ul>
            </div>
            <Field label="Status">
              <select name="active" defaultValue={editing.active === false ? "off" : "on"} className="input"><option value="on">On — agents can use it</option><option value="off">Off</option></select>
            </Field>
            <SubmitButton>Save template</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
