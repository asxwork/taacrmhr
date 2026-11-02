import { requirePermission, can } from "@/lib/permissions";
import { saveFeatures } from "./actions";
import { FEATURES, disabledFeatures } from "@/lib/features";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Features" };

/** Settings → Features: switch whole features off for the company (menus and pages disappear; data is kept). */
export default async function FeaturesPage() {
  const user = await requirePermission("settings.company");
  const off = await disabledFeatures();
  const editable = can(user, "settings.company", "edit");
  return (
    <>
      <PageHeader title="Features" description="Switch off what your company doesn’t use. It disappears from everyone’s menus; the data is kept and returns when you switch it back on." />
      <ActionForm action={saveFeatures} className="space-y-6">
        <fieldset disabled={!editable} className="min-w-0 space-y-6">
          {(["CRM", "HR"] as const).map((group) => (
            <Card key={group} className="divide-y divide-line">
              <p className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted">{group}</p>
              {FEATURES.filter((f) => f.group === group).map((f) => (
                <label key={f.key} className="flex cursor-pointer items-center gap-4 px-5 py-3.5 hover:bg-canvas/50">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{f.label}</span>
                    <span className="block text-xs text-muted">{f.about}</span>
                  </span>
                  <input type="checkbox" name={`on:${f.key}`} defaultChecked={!off.has(f.key)} className="peer sr-only" />
                  <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full bg-line transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-emerald-600 peer-checked:after:translate-x-5" />
                </label>
              ))}
            </Card>
          ))}
          {editable && <SubmitButton>Save features</SubmitButton>}
        </fieldset>
      </ActionForm>
    </>
  );
}
