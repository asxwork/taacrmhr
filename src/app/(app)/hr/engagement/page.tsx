import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { RATING_FACES, parseQuestions } from "@/lib/engagement";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { createSurvey, setSurveyStatus } from "./actions";

export const metadata = { title: "Employee Engagement" };

/** Settings → Employee Engagement: pulse surveys, anonymous by default, with live results. */
export default async function EngagementPage({ searchParams }: { searchParams: Promise<{ id?: string; new?: string }> }) {
  const user = await requirePermission("hr.employees");
  const sp = await searchParams;
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all";
  const [surveys, headcount] = await Promise.all([
    db.engagementSurvey.findMany({ include: { _count: { select: { responses: true } } }, orderBy: { createdAt: "desc" } }),
    db.employee.count({ where: { status: { not: "left" }, userId: { not: null } } }),
  ]);
  const open = sp.id ? surveys.find((s) => s.id === sp.id) : surveys[0];
  const responses = open ? await db.engagementResponse.findMany({ where: { surveyId: open.id }, include: { survey: false } }) : [];
  const names = open && !open.anonymous ? new Map((await db.employee.findMany({ where: { id: { in: responses.map((r) => r.employeeId).filter(Boolean) as string[] } }, select: { id: true, fullName: true } })).map((e) => [e.id, e.fullName])) : new Map<string, string>();
  const qs = open ? parseQuestions(open.questions) : [];
  const answers = responses.map((r) => { try { return JSON.parse(r.answers) as (number | string | null)[]; } catch { return []; } });

  return (
    <>
      <PageHeader title="Employee Engagement" description="Short pulse surveys to hear how people feel. Everyone with a login is notified; they answer in My Space → Surveys."
        actions={canEdit && <LinkButton href="/hr/engagement?new=1" scroll={false}><Plus className="size-4" /> New survey</LinkButton>} />
      {surveys.length === 0 ? <Card><EmptyState title="No surveys yet" description="Start with an eNPS-style pulse: how happy are you at work, would you recommend us, what should we change?" /></Card> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          <Card className="h-fit overflow-hidden">
            <ul className="divide-y divide-line">
              {surveys.map((s) => (
                <li key={s.id}>
                  <Link href={`/hr/engagement?id=${s.id}`} className={cn("block px-4 py-3 hover:bg-canvas/60", open?.id === s.id && "bg-canvas")}>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted">{format(s.createdAt, "d MMM yyyy")} · {s._count.responses}/{headcount} answered · {s.status}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {open && (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-center gap-3 p-5">
                <div className="flex-1">
                  <h2 className="font-semibold">{open.title}</h2>
                  <p className="text-sm text-muted">{open.description ?? ""} {open.anonymous ? <Badge tone="navy">anonymous</Badge> : <Badge tone="neutral">named</Badge>} {open.closesAt && <span className="text-xs">closes {format(open.closesAt, "d MMM")}</span>}</p>
                </div>
                <div className="text-right"><p className="text-2xl font-semibold tabular-nums">{headcount ? Math.round((responses.length / headcount) * 100) : 0}%</p><p className="text-xs text-muted">response rate</p></div>
                {canEdit && <form action={setSurveyStatus}><input type="hidden" name="id" value={open.id} /><input type="hidden" name="status" value={open.status === "open" ? "closed" : "open"} /><Button variant="secondary">{open.status === "open" ? "Close survey" : "Reopen"}</Button></form>}
              </Card>
              {qs.map((q, i) => {
                const vals = answers.map((a) => a[i]);
                if (q.kind === "rating") {
                  const nums = vals.filter((v): v is number => typeof v === "number");
                  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                  return (
                    <Card key={i} className="p-5">
                      <div className="mb-3 flex items-start justify-between gap-3"><p className="font-medium">{q.text}</p><span className="shrink-0 text-lg font-semibold tabular-nums">{nums.length ? `${avg.toFixed(1)}/5` : "—"}</span></div>
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((n) => {
                          const c = nums.filter((v) => v === n).length;
                          return (
                            <div key={n} className="text-center">
                              <div className="mx-auto flex h-20 w-full items-end overflow-hidden rounded-md bg-canvas"><div className="w-full bg-[var(--chart)]" style={{ height: `${nums.length ? (c / nums.length) * 100 : 0}%` }} /></div>
                              <p className="mt-1 text-lg">{RATING_FACES[n - 1]}</p><p className="text-xs text-muted">{c}</p>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  );
                }
                const texts = vals.map((v, j) => ({ v, who: responses[j]?.employeeId })).filter((x): x is { v: string; who: string | null } => typeof x.v === "string" && !!x.v);
                return (
                  <Card key={i} className="p-5">
                    <p className="mb-3 font-medium">{q.text}</p>
                    {texts.length === 0 ? <p className="text-sm text-muted">No answers yet.</p> : (
                      <ul className="space-y-2">{texts.map((t, j) => <li key={j} className="rounded-md bg-canvas/60 px-3 py-2 text-sm">{t.v}{t.who && names.get(t.who) && <span className="ml-2 text-xs text-muted">— {names.get(t.who)}</span>}</li>)}</ul>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
      {canEdit && sp.new && (
        <Drawer title="New survey" closeHref="/hr/engagement" width="max-w-xl">
          <ActionForm action={createSurvey} className="space-y-4">
            <Field label="Title"><input name="title" required className="input" placeholder="e.g. October pulse" /></Field>
            <Field label="Intro (optional)"><input name="description" className="input" placeholder="Two minutes, completely anonymous." /></Field>
            <Field label="Rating questions (1–5), one per line">
              <textarea name="ratings" rows={5} className="input" defaultValue={"How happy are you at work?\nHow likely are you to recommend us as a place to work?\nDo you have what you need to do your job well?"} />
            </Field>
            <Field label="Open questions, one per line"><textarea name="open" rows={3} className="input" defaultValue={"What is one thing we should change?"} /></Field>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="anonymous" defaultChecked /> Anonymous</label>
              <Field label="Closes on (optional)"><input name="closesAt" type="date" className="input" /></Field>
            </div>
            <SubmitButton>Send survey</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
