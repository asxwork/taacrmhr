import { requirePermission, can } from "@/lib/permissions";
import { APP_SWITCHES, FEATURES, disabledFeatures } from "@/lib/features";
import { PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveFeatures } from "./actions";
import { AppCard } from "./app-card";

export const metadata = { title: "Apps & features" };

/** Settings → Apps & features: per app, one switch for the whole app and a dropdown with each of its features. */
export default async function FeaturesPage() {
  const user = await requirePermission("settings.company");
  const off = [...(await disabledFeatures())];
  const editable = can(user, "settings.company", "edit");
  return (
    <>
      <PageHeader title="Apps & features" description="Each app has one switch to turn the whole app off, and a dropdown with every feature inside it. What you switch off disappears from everyone’s menus; the data is kept and comes back when you switch it on." />
      <ActionForm action={saveFeatures} className="space-y-3">
        {APP_SWITCHES.map((a) => (
          <AppCard key={a.app} appKey={a.app} label={a.label} about={a.about} master={`app-${a.app}`} off={off} disabled={!editable}
            features={FEATURES.filter((f) => f.app === a.app && !f.key.startsWith("app-")).map((f) => ({ key: f.key, label: f.label, about: f.about }))} />
        ))}
        <p className="text-xs text-muted">My Space, Tutorials and Settings are always on.</p>
        {editable && <div className="sticky bottom-4 z-10"><SubmitButton className="shadow-lg">Save</SubmitButton></div>}
      </ActionForm>
    </>
  );
}
