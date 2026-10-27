import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { CANDIDATE_STAGES } from "@/lib/hr-shared";
import { color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { saveOpening } from "./actions";

export const metadata = { title: "Recruitment" };
const STATUS_TONE = { open: "green", on_hold: "amber", closed: "neutral" } as const;

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ new?: string; all?: string }> }) {
  const user = await requirePermission("hr.recruitment");
  const sp = await searchParams;
  const [openings, departments, branches] = await Promise.all([
    db.jobOpening.findMany({ where: sp.all ? {} : { status: { not: "closed" } }, include: { candidates: { select: { stage: true } } }, orderBy: { createdAt: "desc" } }),
    db.department.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Recruitment"
        description="Job openings and their candidate pipelines."
        actions={can(user, "hr.recruitment", "create") && <LinkButton href="/hr/recruitment?new=1" scroll={false}><Plus className="size-4" /> New opening</LinkButton>}
      />
      <div className="mb-3 text-sm">
        <Link href={sp.all ? "/hr/recruitment" : "/hr/recruitment?all=1"} className="text-muted hover:text-ink hover:underline">{sp.all ? "Hide closed openings" : "Show closed openings"}</Link>
      </div>
      {openings.length === 0 ? <Card><EmptyState title="No open positions" description="Create an opening to start collecting candidates." /></Card> : (
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2">
          {openings.map((o) => (
            <Link key={o.id} href={`/hr/recruitment/${o.id}`}>
              <Card className="h-full p-5 transition hover:border-navy-900/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{o.title}</p>
                    <p className="text-sm text-muted">
                      {[departments.find((d) => d.id === o.departmentId)?.name, branches.find((b) => b.id === o.branchId)?.name].filter(Boolean).join(" · ") || "—"}
                      {` · ${o.positions} position${o.positions === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[o.status as keyof typeof STATUS_TONE] ?? "neutral"}>{o.status.replace("_", " ")}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {CANDIDATE_STAGES.map((s) => {
                    const count = o.candidates.filter((c) => c.stage === s.value).length;
                    return count ? <span key={s.value} className="flex items-center gap-1"><span className={cn("size-2 rounded-full", color(s.color).dot)} />{s.label} {count}</span> : null;
                  })}
                  {!o.candidates.length && <span>No candidates yet</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {sp.new && can(user, "hr.recruitment", "create") && (
        <Drawer title="New job opening" closeHref="/hr/recruitment">
          <ActionForm action={saveOpening} className="space-y-4">
            <Field label="Job title"><input name="title" required className="input" placeholder="e.g. Property Consultant" autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department"><select name="departmentId" className="input"><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Branch"><select name="branchId" className="input"><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Positions"><input name="positions" type="number" min={1} defaultValue={1} className="input" /></Field>
              <Field label="Salary range"><input name="salaryRange" className="input" placeholder="e.g. 60k – 90k + commission" /></Field>
            </div>
            <Field label="Description"><textarea name="description" rows={5} className="input" /></Field>
            <SubmitButton>Create opening</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
