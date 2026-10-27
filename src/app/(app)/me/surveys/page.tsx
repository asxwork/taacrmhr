import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { RATING_FACES, parseQuestions, respondentKey } from "@/lib/engagement";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { submitSurvey } from "../../hr/engagement/actions";

export const metadata = { title: "Surveys" };

/** My Space → Surveys: answer open engagement surveys (once each). */
export default async function MySurveys() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!emp) return (<><PageHeader title="Surveys" /><Card><EmptyState title="No employee record" /></Card></>);
  const surveys = await db.engagementSurvey.findMany({ where: { status: "open", OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }] }, orderBy: { createdAt: "desc" } });
  const done = new Set((await db.engagementResponse.findMany({ where: { surveyId: { in: surveys.map((s) => s.id) }, respondentKey: { in: surveys.map((s) => respondentKey(s.id, emp.id)) } }, select: { surveyId: true } })).map((r) => r.surveyId));

  return (
    <>
      <PageHeader title="Surveys" description="Tell us how things are going. Anonymous surveys never record who answered." />
      {surveys.length === 0 ? <Card><EmptyState title="No open surveys right now" /></Card> : (
        <div className="space-y-4">
          {surveys.map((s) => (
            <Card key={s.id} className="p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2"><h2 className="flex-1 text-lg font-semibold">{s.title}</h2>{s.anonymous && <Badge tone="navy">anonymous</Badge>}</div>
              {s.description && <p className="mb-4 text-sm text-muted">{s.description}</p>}
              {done.has(s.id) ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" /> Thanks, you’ve answered this one.</p> : (
                <ActionForm action={submitSurvey} className="space-y-5">
                  <input type="hidden" name="surveyId" value={s.id} />
                  {parseQuestions(s.questions).map((q, i) => q.kind === "rating" ? (
                    <fieldset key={i} className="min-w-0">
                      <legend className="mb-2 text-sm font-medium">{q.text}</legend>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <label key={n} className="cursor-pointer">
                            <input type="radio" name={`q${i}`} value={n} required className="peer sr-only" />
                            <span className="flex size-12 flex-col items-center justify-center rounded-lg border border-line text-xl transition peer-checked:border-navy-900 peer-checked:bg-navy-900/10 hover:bg-canvas">{RATING_FACES[n - 1]}<span className="text-[10px] text-muted">{n}</span></span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
                    <Field key={i} label={q.text}><textarea name={`q${i}`} rows={3} className="input" /></Field>
                  ))}
                  <SubmitButton>Send answers</SubmitButton>
                </ActionForm>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
