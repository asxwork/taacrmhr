import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestTypeBySlug } from "@/lib/request-types";
import { requestableEmployees } from "@/lib/requests";
import { flowSteps } from "@/lib/approvals";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { sendRequest } from "../../actions";

export const metadata = { title: "New request" };

export default async function NewRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const t = requestTypeBySlug((await params).slug);
  if (!t) notFound();
  const sources = new Set(t.fields.map((f) => f.source).filter(Boolean));
  const [employees, branches, departments, designations, shifts, steps] = await Promise.all([
    requestableEmployees(user, t),
    sources.has("branches") ? db.branch.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    sources.has("departments") ? db.department.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    sources.has("designations") ? db.designation.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    sources.has("shifts") ? db.shift.findMany({ select: { id: true, name: true, start: true, end: true }, orderBy: { name: "asc" } }) : [],
    flowSteps(t.type),
  ]);
  const list = { branches, departments, designations, shifts: shifts.map((s) => ({ id: s.id, name: `${s.name} (${s.start}–${s.end})` })) };
  const chain = steps.map((s) => (s.kind === "manager" ? "your manager" : s.kind === "hr" ? "HR" : "a named approver")).join(" → ");

  return (
    <>
      <PageHeader title={t.label} description={t.description} actions={<LinkButton href="/hr/requests" variant="secondary">All request types</LinkButton>} />
      <Card className="max-w-2xl p-6">
        {employees.length === 0 ? (
          <EmptyState title="No employee record" description="Your login isn't linked to an employee record yet. Ask HR to link it." />
        ) : (
          <ActionForm action={sendRequest} className="space-y-4">
            <input type="hidden" name="slug" value={t.slug} />
            {t.forOthers && (
              <Field label="Employee">
                <select name="employeeId" required defaultValue={employees.length === 1 ? employees[0]!.id : ""} className="input">
                  <option value="" disabled>Choose…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {t.fields.map((f) => (
                <Field key={f.name} label={`${f.label}${f.required ? "" : " (optional)"}`} hint={f.hint} className={f.kind === "textarea" ? "sm:col-span-2" : undefined}>
                  {f.kind === "textarea" ? <textarea name={f.name} rows={3} required={f.required} className="input" />
                    : f.kind === "select" ? (
                      <select name={f.name} required={f.required} defaultValue="" className="input">
                        <option value="">—</option>
                        {(f.options ?? (f.source ? list[f.source] : []).map((o) => [o.id, o.name] as const)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    )
                    : <input name={f.name} type={f.kind} required={f.required} min={f.kind === "number" ? 0 : undefined} step={f.kind === "number" ? "any" : undefined} className="input" />}
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted">Goes to {chain} for approval.</p>
            <SubmitButton pendingText="Sending…">Send request</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
