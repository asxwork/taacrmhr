import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field } from "@/components/ui";
import { perfSettings } from "@/lib/performance-settings";
import { savePerfSettings } from "@/app/(app)/hr/probation/actions";

/** Assessment settings: "general" (appraisal defaults) or "probation" (criteria and reminders). */
export async function PerfSettingsForm({ part, canEdit }: { part: "general" | "probation"; canEdit: boolean }) {
  const s = await perfSettings();
  return (
    <Card className="max-w-2xl p-6">
      <ActionForm action={savePerfSettings} className="space-y-5">
        <input type="hidden" name={`form:${part}`} value="1" />
        {part === "general" ? (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="selfReview" defaultChecked={s.selfReview} disabled={!canEdit} className="mt-1" />
              <span><b className="font-medium">Self review first</b><span className="block text-muted">Employees rate themselves before their manager. Off: reviews go straight to the manager.</span></span>
            </label>
            <Field label="Default goals for new review cycles" hint="Filled into each appraisal when a cycle opens (can be changed per cycle).">
              <textarea name="goalsTemplate" rows={8} defaultValue={s.goalsTemplate} disabled={!canEdit} className="input" placeholder={"e.g.\n1. Close 4 deals per month\n2. Log every client visit in the CRM\n3. Follow up every lead within 24 hours"} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Probation evaluation criteria" hint="One per line; each is rated 1–5 on the probation review.">
              <textarea name="probationCriteria" rows={7} defaultValue={s.probationCriteria.join("\n")} disabled={!canEdit} className="input" />
            </Field>
            <Field label="Highlight probations ending within (days)">
              <input name="probationReminderDays" type="number" min={1} max={60} defaultValue={s.probationReminderDays} disabled={!canEdit} className="input w-32" />
            </Field>
          </>
        )}
        {canEdit && <SubmitButton>Save</SubmitButton>}
      </ActionForm>
    </Card>
  );
}
