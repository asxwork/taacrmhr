import { EXIT_RATINGS, EXIT_REASONS } from "@/lib/exit-interview";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { saveExitInterview } from "@/app/(app)/me/exit-interview/actions";

type Saved = { reasons: string | null; ratings: string | null; liked: string | null; improve: string | null; wouldRejoin: boolean | null } | null;

/** The exit interview questions (used in My Space and by HR on someone's behalf). */
export function ExitInterviewForm({ saved, employeeId }: { saved: Saved; employeeId?: string }) {
  let r: Record<string, number | null> = {};
  try { r = saved?.ratings ? JSON.parse(saved.ratings) : {}; } catch {}
  const chosen = new Set((saved?.reasons ?? "").split(", ").filter(Boolean));
  return (
    <ActionForm action={saveExitInterview} className="space-y-5">
      {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
      <Field label="Why are you leaving? (pick any)">
        <div className="flex flex-wrap gap-2">{EXIT_REASONS.map((x) => (
          <label key={x} className="cursor-pointer"><input type="checkbox" name="reasons" value={x} defaultChecked={chosen.has(x)} className="peer sr-only" />
            <span className="block rounded-full border border-line px-3 py-1.5 text-sm peer-checked:border-navy-900 peer-checked:bg-navy-900 peer-checked:text-white">{x}</span></label>
        ))}</div>
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">How would you rate… (1 = poor, 5 = excellent)</p>
        {EXIT_RATINGS.map(([k, label]) => (
          <div key={k} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-44">{label}</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer"><input type="radio" name={`r_${k}`} value={n} defaultChecked={r[k] === n} className="peer sr-only" />
                <span className="flex size-8 items-center justify-center rounded-full border border-line peer-checked:border-navy-900 peer-checked:bg-navy-900 peer-checked:text-white">{n}</span></label>
            ))}
          </div>
        ))}
      </div>
      <Field label="What did you like most?"><textarea name="liked" rows={3} defaultValue={saved?.liked ?? ""} className="input" /></Field>
      <Field label="What should we improve?"><textarea name="improve" rows={3} defaultValue={saved?.improve ?? ""} className="input" /></Field>
      <Field label="Would you work here again?">
        <select name="wouldRejoin" defaultValue={saved?.wouldRejoin == null ? "" : saved.wouldRejoin ? "yes" : "no"} className="input w-48"><option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option></select>
      </Field>
      <SubmitButton>Send</SubmitButton>
    </ActionForm>
  );
}
