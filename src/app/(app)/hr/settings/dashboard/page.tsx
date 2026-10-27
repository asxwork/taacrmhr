import { can, requirePermission } from "@/lib/permissions";
import { DASHBOARD_WIDGETS, hiddenWidgets } from "@/lib/hr-dashboard-widgets";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { saveDashboardWidgets } from "../actions";

export const metadata = { title: "Dashboard Settings" };

/** System Settings → Customization → Dashboard: which widgets the HR dashboard shows. */
export default async function DashboardSettings() {
  const user = await requirePermission("settings.company");
  const hidden = await hiddenWidgets();
  const canEdit = user.isSuperAdmin || can(user, "settings.company", "edit");
  return (
    <>
      <PageHeader title="Dashboard" description="Choose what the HR dashboard shows for everyone." />
      <Card className="max-w-xl p-6">
        <ActionForm action={saveDashboardWidgets} className="space-y-3">
          {DASHBOARD_WIDGETS.map((w) => (
            <label key={w.key} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 text-sm">
              {w.label}
              <span className="flex items-center gap-2 text-xs text-muted">Show <input type="checkbox" name="show" value={w.key} defaultChecked={!hidden.has(w.key)} disabled={!canEdit} /></span>
            </label>
          ))}
          {canEdit && <SubmitButton>Save</SubmitButton>}
        </ActionForm>
      </Card>
    </>
  );
}
