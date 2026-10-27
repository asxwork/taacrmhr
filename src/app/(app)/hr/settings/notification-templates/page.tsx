import { can, requirePermission } from "@/lib/permissions";
import { savedTemplates } from "@/lib/notify-templates";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { saveTemplates } from "../actions";

export const metadata = { title: "Notification Templates" };

/** System Settings → Templates → Notification: wording of the automatic notifications and emails. */
export default async function NotificationTemplates() {
  const user = await requirePermission("settings.company");
  const canEdit = user.isSuperAdmin || can(user, "settings.company", "edit");
  const templates = await savedTemplates();
  return (
    <>
      <PageHeader title="Notification" description="The wording of automatic notifications (and the emails sent with them). Clear a box to go back to the default." />
      <ActionForm action={saveTemplates} className="space-y-4">
        {templates.map((t) => (
          <Card key={t.key} className="p-5">
            <div className="mb-3 flex items-center gap-2"><h2 className="font-semibold">{t.label}</h2>{t.custom && <Badge tone="navy">customised</Badge>}</div>
            <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
              <Field label="Title"><input name={`${t.key}:title`} defaultValue={t.title} disabled={!canEdit} className="input" /></Field>
              <Field label="Message"><input name={`${t.key}:body`} defaultValue={t.body} disabled={!canEdit} className="input" /></Field>
            </div>
            <p className="mt-2 text-xs text-muted">Placeholders: {t.vars.map((v) => <code key={v} className="mr-1.5 rounded bg-canvas px-1">{`{{${v}}}`}</code>)}</p>
          </Card>
        ))}
        {canEdit && <SubmitButton>Save templates</SubmitButton>}
      </ActionForm>
    </>
  );
}
