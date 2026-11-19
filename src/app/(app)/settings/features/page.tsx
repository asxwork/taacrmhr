import { requirePermission, can } from "@/lib/permissions";
import { APP_SWITCHES, FEATURES, disabledFeatures, hrAccess } from "@/lib/features";
import { PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveFeatures } from "./actions";
import { AppCards } from "./app-card";

export const metadata = { title: "Apps & features" };

/** Settings → Apps & features: per app, one switch for the whole app and a dropdown with each of its features. */
export default async function FeaturesPage() {
  const user = await requirePermission("settings.company");
  const [offSet, hrMode] = await Promise.all([disabledFeatures(), hrAccess()]);
  const off = [...offSet];
  const editable = can(user, "settings.company", "edit");
  return (
    <>
      <PageHeader title="Apps & features" description="Each app has one switch to turn the whole app off, and a dropdown with every feature inside it. What you switch off disappears from everyone’s menus; the data is kept and comes back when you switch it on." />
      <ActionForm action={saveFeatures} className="space-y-3">
        <AppCards off={off} disabled={!editable} apps={APP_SWITCHES.map((a) => ({ appKey: a.app, label: a.label, about: a.about, master: `app-${a.app}`,
          features: FEATURES.filter((f) => f.app === a.app && !f.key.startsWith("app-")).map((f) => ({ key: f.key, label: f.label, about: f.about })) }))} />
        <fieldset className="rounded-xl border border-line bg-surface p-4" disabled={!editable}>
          <legend className="px-1 text-sm font-semibold">HR app or My Space</legend>
          <p className="mb-3 text-xs text-muted">Employees always do their own things (attendance, leave and other requests, payslips, documents, profile) in My Space and never see the HR app. Choose who else works in the HR app.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["hr", "HR staff only (recommended)", "Only people with company-wide HR access (HR Manager, Administrator, Super Admin) get the HR app. Managers see their team in My Space → My team."],
              ["managers", "HR staff and managers", "Managers get the HR app for their team’s attendance, leave and approvals."],
            ] as const).map(([v, l, d]) => (
              <label key={v} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-[:checked]:border-navy-900 has-[:checked]:bg-canvas">
                <input type="radio" name="hrAccess" value={v} defaultChecked={hrMode === v} className="mt-1" />
                <span><span className="block text-sm font-medium">{l}</span><span className="block text-xs text-muted">{d}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-muted">My Space, Tutorials and Settings are always on.</p>
        {editable && <div className="sticky bottom-4 z-10"><SubmitButton className="shadow-lg">Save</SubmitButton></div>}
      </ActionForm>
    </>
  );
}
