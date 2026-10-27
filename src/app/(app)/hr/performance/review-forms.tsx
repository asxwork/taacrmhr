import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { RATINGS } from "@/lib/hr-shared";
import { fmtDate } from "@/lib/utils";
import { submitManagerReview, submitSelfReview } from "./actions";

type Appraisal = {
  id: string; status: string; goals: string | null;
  selfRating: number | null; selfComments: string | null; submittedAt: Date | null;
  managerRating: number | null; managerComments: string | null; recommendation: string | null; completedAt: Date | null;
};

export const ratingLabel = (n: number | null) => (n ? `${n}/5 · ${RATINGS.find((r) => r.value === n)?.label}` : "—");

function RatingPicker({ name, value }: { name: string; value?: number | null }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium">Rating</legend>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
        {RATINGS.map((r) => (
          <label key={r.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-navy-900 has-[:checked]:bg-navy-900/5 sm:flex-col sm:gap-0.5 sm:text-center">
            <input type="radio" name={name} value={r.value} defaultChecked={value === r.value} required className="accent-navy-900 sm:sr-only" />
            <span className="font-semibold tabular-nums">{r.value}</span>
            <span className="text-xs text-muted">{r.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-1 whitespace-pre-wrap text-sm">{children}</div>
    </div>
  );
}

/** Read-only view of what has been written so far. */
export function AppraisalSummary({ a, hideManager }: { a: Appraisal; hideManager?: boolean }) {
  return (
    <div className="space-y-4">
      {a.goals && <Block title="Goals & expectations">{a.goals}</Block>}
      {a.submittedAt && (
        <Block title={`Self review · ${fmtDate(a.submittedAt)}`}>
          <span className="font-medium">{ratingLabel(a.selfRating)}</span>
          {a.selfComments && <p className="mt-1 text-muted">{a.selfComments}</p>}
        </Block>
      )}
      {!hideManager && a.completedAt && (
        <Block title={`Manager review · ${fmtDate(a.completedAt)}`}>
          <span className="font-medium">{ratingLabel(a.managerRating)}</span>
          {a.managerComments && <p className="mt-1 text-muted">{a.managerComments}</p>}
          {a.recommendation && <p className="mt-1"><span className="text-muted">Recommendation:</span> {a.recommendation}</p>}
        </Block>
      )}
    </div>
  );
}

export function SelfReviewForm({ a }: { a: Appraisal }) {
  return (
    <ActionForm action={submitSelfReview} className="space-y-4">
      <input type="hidden" name="id" value={a.id} />
      {a.goals && <Block title="Goals & expectations">{a.goals}</Block>}
      <RatingPicker name="selfRating" value={a.selfRating} />
      <Field label="Your comments" hint="What went well, what was hard, what you want to work on next.">
        <textarea name="selfComments" rows={6} defaultValue={a.selfComments ?? ""} className="input" />
      </Field>
      <SubmitButton>Submit self review</SubmitButton>
    </ActionForm>
  );
}

export function ManagerReviewForm({ a }: { a: Appraisal }) {
  return (
    <div className="space-y-5">
      {a.submittedAt ? <AppraisalSummary a={{ ...a, goals: null }} hideManager /> : <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">The employee hasn’t submitted their self review yet. You can still set goals now, or complete the review without it.</p>}
      <ActionForm action={submitManagerReview} className="space-y-3">
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="intent" value="goals" />
        <Field label="Goals & expectations" hint="Visible to the employee.">
          <textarea name="goals" rows={3} defaultValue={a.goals ?? ""} className="input" />
        </Field>
        <SubmitButton variant="secondary">Save goals</SubmitButton>
      </ActionForm>
      <ActionForm action={submitManagerReview} className="space-y-4 border-t border-line pt-5">
        <input type="hidden" name="id" value={a.id} />
        <RatingPicker name="managerRating" value={a.managerRating} />
        <Field label="Manager comments"><textarea name="managerComments" rows={5} defaultValue={a.managerComments ?? ""} className="input" /></Field>
        <Field label="Recommendation" hint="Optional, e.g. “10% increment”, “Promote to Senior Consultant”, “Extend probation”."><input name="recommendation" defaultValue={a.recommendation ?? ""} className="input" /></Field>
        <SubmitButton>Complete review</SubmitButton>
      </ActionForm>
    </div>
  );
}
