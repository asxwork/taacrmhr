import Link from "next/link";
import { differenceInCalendarDays, format } from "date-fns";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { perfSettings } from "@/lib/performance-settings";
import { RATINGS } from "@/lib/hr-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { decideProbationAction, submitProbationReview } from "./actions";

export const metadata = { title: "Probation Evaluation" };
const REC = { confirm: { label: "Confirm", tone: "green" }, extend: { label: "Extend", tone: "amber" }, terminate: { label: "End employment", tone: "red" } } as const;

/** Assessment → Probations → Probation Evaluation: managers rate probationers; HR confirms, extends or ends. */
export default async function ProbationPage({ searchParams }: { searchParams: Promise<{ emp?: string }> }) {
  const user = await requirePermission("hr.performance");
  const sp = await searchParams;
  const isHr = user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all";
  const scope = (await employeeWhere(user)) ?? {};
  const [people, settings] = await Promise.all([
    db.employee.findMany({
      // (An empty scope means everyone; Prisma treats {} inside OR as matching nothing, so leave the OR out then.)
      where: { status: "probation", ...(Object.keys(scope).length && { OR: [scope, { manager: { userId: user.id } }] }) },
      include: { designation: { select: { name: true } }, manager: { select: { fullName: true, userId: true } }, probationReviews: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { probationEnd: "asc" },
    }),
    perfSettings(),
  ]);
  const reviewers = new Map((await db.user.findMany({ where: { id: { in: people.flatMap((p) => p.probationReviews.map((r) => r.reviewerId)).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const picked = sp.emp ? people.find((p) => p.id === sp.emp) : null;
  const canReview = (p: (typeof people)[number]) => p.manager?.userId === user.id || isHr || can(user, "hr.performance", "edit");

  return (
    <>
      <PageHeader title="Probation Evaluation" description="Line managers rate each probationer before their probation ends; HR then confirms, extends or ends their employment. Criteria are set in Assessment → Settings → Performance." />
      <Card className="overflow-x-auto">
        {people.length === 0 ? <EmptyState title="Nobody is on probation" /> : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Line manager</th><th className="px-4 py-2.5">Probation ends</th><th className="px-4 py-2.5">Review</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {people.map((p) => {
                const r = p.probationReviews[0];
                const days = p.probationEnd ? differenceInCalendarDays(p.probationEnd, new Date()) : null;
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-3"><PersonAvatar name={p.fullName} photo={p.photo} /><div><Link href={`/hr/employees/${p.id}`} className="font-medium hover:underline">{p.fullName}</Link><span className="block text-xs text-muted">{p.designation?.name}</span></div></div></td>
                    <td className="px-4 py-2.5">{p.manager?.fullName ?? "—"}</td>
                    <td className={cn("px-4 py-2.5", days != null && days <= settings.probationReminderDays && "font-medium text-amber-700", days != null && days < 0 && "text-red-600")}>{p.probationEnd ? `${format(p.probationEnd, "d MMM yyyy")} (${days! < 0 ? `${-days!} days overdue` : `${days} days`})` : "—"}</td>
                    <td className="px-4 py-2.5">
                      {r ? (
                        <div>
                          <span className="tabular-nums">{r.overall.toFixed(1)}/5</span> <Badge tone={REC[r.recommendation as keyof typeof REC]?.tone ?? "neutral"}>{REC[r.recommendation as keyof typeof REC]?.label ?? r.recommendation}</Badge>
                          <span className="block text-xs text-muted">{r.reviewerId ? reviewers.get(r.reviewerId) : ""} · {format(r.createdAt, "d MMM")}{r.status === "decided" ? ` · decided: ${r.decision}` : ""}</span>
                        </div>
                      ) : <span className="text-muted">not reviewed</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {canReview(p) && <Link href={`/hr/probation?emp=${p.id}`} scroll={false} className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-canvas">{r ? "New review" : "Evaluate"}</Link>}
                        {isHr && r?.status === "submitted" && (
                          <>
                            <Decide id={r.id} decision="confirm" label="Confirm" />
                            <Decide id={r.id} decision="extend" label={`Extend ${r.extendMonths ?? 3}m`} extend={r.extendMonths ?? 3} />
                            <Decide id={r.id} decision="terminate" label="End" danger />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {picked && canReview(picked) && (
        <Drawer title={`Probation review · ${picked.fullName}`} closeHref="/hr/probation">
          <ActionForm action={submitProbationReview} className="space-y-4">
            <input type="hidden" name="employeeId" value={picked.id} />
            {settings.probationCriteria.map((c, i) => (
              <Field key={c} label={c}>
                <select name={`r${i}`} required defaultValue="" className="input">
                  <option value="" disabled>Rate…</option>
                  {RATINGS.map((r) => <option key={r.value} value={r.value}>{r.value} · {r.label}</option>)}
                </select>
              </Field>
            ))}
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label="Recommendation">
                <select name="recommendation" required defaultValue="" className="input">
                  <option value="" disabled>Choose…</option>
                  <option value="confirm">Confirm</option><option value="extend">Extend probation</option><option value="terminate">End employment</option>
                </select>
              </Field>
              <Field label="Extend by (months)"><input name="extendMonths" type="number" min={1} max={6} defaultValue={3} className="input" /></Field>
            </div>
            <Field label="Comments" hint="Required for extend or end."><textarea name="comments" rows={4} className="input" /></Field>
            <SubmitButton>Submit to HR</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}

function Decide({ id, decision, label, extend, danger }: { id: string; decision: string; label: string; extend?: number; danger?: boolean }) {
  return (
    <form action={decideProbationAction}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value={decision} />
      {extend && <input type="hidden" name="extendMonths" value={extend} />}
      <Button variant={danger ? "danger" : decision === "confirm" ? "primary" : "secondary"} className="h-7 px-2.5 text-xs">{label}</Button>
    </form>
  );
}
