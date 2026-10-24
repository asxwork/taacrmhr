import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { createCycle } from "./actions";

export const metadata = { title: "Performance" };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requirePermission("hr.performance");
  const sp = await searchParams;
  const canCreate = can(user, "hr.performance", "create");
  const [cycles, departments] = await Promise.all([
    db.appraisalCycle.findMany({ include: { appraisals: { select: { status: true, managerRating: true } } }, orderBy: { from: "desc" } }),
    db.department.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const now = new Date();
  const half = now.getMonth() < 6;

  return (
    <>
      <PageHeader
        title="Performance"
        description="Review cycles: each employee rates themselves, then their line manager completes the review."
        actions={canCreate && <LinkButton href="/hr/performance?new=1" scroll={false}><Plus className="size-4" /> New review cycle</LinkButton>}
      />
      {cycles.length === 0 ? <Card><EmptyState title="No review cycles yet" description="Open a cycle to start appraisals for your team." /></Card> : (
        <div className="stagger grid gap-4 md:grid-cols-2">
          {cycles.map((c) => {
            const done = c.appraisals.filter((a) => a.status === "done");
            const avg = done.length ? done.reduce((s, a) => s + (a.managerRating ?? 0), 0) / done.length : null;
            return (
              <Link key={c.id} href={`/hr/performance/${c.id}`}>
                <Card className="h-full p-5 transition hover:border-navy-900/20">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted">{format(c.from, "d MMM yyyy")} – {format(c.to, "d MMM yyyy")}</p>
                    </div>
                    <Badge tone={c.status === "open" ? "green" : "neutral"}>{c.status}</Badge>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-navy-900" style={{ width: `${c.appraisals.length ? (done.length / c.appraisals.length) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {done.length} of {c.appraisals.length} completed · {c.appraisals.filter((a) => a.status === "self").length} awaiting self review
                    {avg !== null && ` · average ${avg.toFixed(1)}/5`}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {sp.new && canCreate && (
        <Drawer title="New review cycle" closeHref="/hr/performance">
          <ActionForm action={createCycle} className="space-y-4">
            <Field label="Name"><input name="name" required className="input" defaultValue={`${now.getFullYear()} ${half ? "H1" : "H2"} review`} autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Period from"><input name="from" type="date" required className="input" defaultValue={format(new Date(now.getFullYear(), half ? 0 : 6, 1), "yyyy-MM-dd")} /></Field>
              <Field label="to"><input name="to" type="date" required className="input" defaultValue={format(new Date(now.getFullYear(), half ? 5 : 11, half ? 30 : 31), "yyyy-MM-dd")} /></Field>
            </div>
            <Field label="Department" hint="Leave blank to include every current employee you manage.">
              <select name="departmentId" className="input"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </Field>
            <Field label="Common goals" hint="Optional. Managers can add individual goals afterwards."><textarea name="goals" rows={4} className="input" placeholder="e.g. Close 3 deals per quarter; follow up every lead within 24 hours" /></Field>
            <p className="text-sm text-muted">Each employee is notified to complete a self review; it then goes to their line manager (or HR when they have none).</p>
            <SubmitButton>Open cycle</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
