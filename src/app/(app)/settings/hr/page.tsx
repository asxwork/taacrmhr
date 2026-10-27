import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeFor } from "@/lib/permissions";
import { getSetting } from "@/lib/hr";
import type { Step } from "@/lib/approvals";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { saveDepartment, saveDesignation, saveFlow, saveHrGeneral } from "./actions";
import { AttendanceSettings } from "./attendance-settings";

export const metadata = { title: "HR Settings" };

export default async function HrSettingsPage() {
  const user = await requireUser();
  if (!user.isSuperAdmin && scopeFor(user, "hr.employees", "edit") !== "all") redirect("/no-access");

  const [departments, designations, employees, flows, users, prefix, probation, onboarding, offboarding] = await Promise.all([
    db.department.findMany({ include: { _count: { select: { employees: true } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.designation.findMany({ include: { _count: { select: { employees: true } } }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.approvalFlow.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getSetting("hr.codePrefix", "EMP-"),
    getSetting("hr.probationMonths", "3"),
    getSetting("hr.onboarding"),
    getSetting("hr.offboarding"),
  ]);

  return (
    <>
      <PageHeader title="HR Settings" description="Organisation, shifts, holidays, leave types, checklists and approval chains." />
      <div className="space-y-8">
        <Section id="departments" title="Departments">
          <Card className="divide-y divide-line">
            {departments.map((d) => (
              <ActionForm key={d.id} action={saveDepartment} className="flex flex-wrap items-center gap-2 p-3">
                <input type="hidden" name="id" value={d.id} />
                <input name="name" defaultValue={d.name} required className="input w-44" aria-label="Name" />
                <input name="code" defaultValue={d.code ?? ""} placeholder="Code" className="input w-20" aria-label="Code" />
                <select name="headId" defaultValue={d.headId ?? ""} className="input w-44" aria-label="Head of department">
                  <option value="">Head: —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
                <input name="sortOrder" type="number" defaultValue={d.sortOrder} className="input w-16" aria-label="Order" />
                <label className="flex items-center gap-1.5 px-1 text-sm text-muted"><input type="checkbox" name="active" defaultChecked={d.active} className="accent-navy-900" /> Active</label>
                <span className="flex-1" />
                <Badge>{d._count.employees} people</Badge>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
            ))}
            <ActionForm action={saveDepartment} className="flex flex-wrap items-center gap-2 bg-canvas/50 p-3">
              <input name="name" required placeholder="New department" className="input w-44" />
              <input name="code" placeholder="Code" className="input w-20" />
              <SubmitButton>Add</SubmitButton>
            </ActionForm>
          </Card>
        </Section>

        <Section id="designations" title="Designations">
          <Card className="divide-y divide-line">
            {designations.map((d) => (
              <ActionForm key={d.id} action={saveDesignation} className="flex flex-wrap items-center gap-2 p-3">
                <input type="hidden" name="id" value={d.id} />
                <input name="name" defaultValue={d.name} required className="input w-56" aria-label="Designation" />
                <input name="grade" defaultValue={d.grade ?? ""} placeholder="Grade" className="input w-20" aria-label="Grade" />
                <label className="flex items-center gap-1.5 px-1 text-sm text-muted"><input type="checkbox" name="active" defaultChecked={d.active} className="accent-navy-900" /> Active</label>
                <span className="flex-1" />
                <Badge>{d._count.employees} people</Badge>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
            ))}
            <ActionForm action={saveDesignation} className="flex flex-wrap items-center gap-2 bg-canvas/50 p-3">
              <input name="name" required placeholder="New designation" className="input w-56" />
              <input name="grade" placeholder="Grade" className="input w-20" />
              <SubmitButton>Add</SubmitButton>
            </ActionForm>
          </Card>
        </Section>

        <Section id="checklists" title="Employee defaults & checklists" hint="One checklist item per line. New hires get the onboarding list; recording a resignation creates the exit list.">
          <Card className="p-5">
            <ActionForm action={saveHrGeneral} className="space-y-4" successMessage="Saved.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Employee code prefix" hint="Codes look like TAA-0007"><input name="codePrefix" defaultValue={prefix} className="input" /></Field>
                <Field label="Probation (months)"><input name="probationMonths" type="number" min={0} max={24} defaultValue={probation} className="input" /></Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Onboarding checklist"><textarea name="onboarding" rows={7} defaultValue={onboarding} className="input" /></Field>
                <Field label="Exit checklist"><textarea name="offboarding" rows={7} defaultValue={offboarding} className="input" /></Field>
              </div>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
        </Section>

        <AttendanceSettings />

        <Section id="approvals" title="Approval chains" hint="Who approves each kind of request, in order. “Manager” is the employee’s reporting manager (falls back to HR if they have none).">
          <Card className="divide-y divide-line">
            {flows.map((f) => {
              let steps: Step[] = [];
              try { steps = JSON.parse(f.steps); } catch {}
              return (
                <ActionForm key={f.id} action={saveFlow} className="flex flex-wrap items-center gap-2 p-3">
                  <input type="hidden" name="type" value={f.type} />
                  <span className="w-44 text-sm font-medium">{f.name}</span>
                  {[0, 1, 2].map((i) => {
                    const s = steps[i];
                    const v = s ? (s.kind === "user" ? `user:${s.userId}` : s.kind) : "";
                    return (
                      <span key={i} className="flex items-center gap-2">
                        {i > 0 && <span className="text-muted">→</span>}
                        <select name={`step${i}`} defaultValue={v} className="input w-40" aria-label={`Step ${i + 1}`}>
                          <option value="">{i === 0 ? "Choose…" : "— none —"}</option>
                          <option value="manager">Manager</option>
                          <option value="hr">HR</option>
                          <optgroup label="Specific person">
                            {users.map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
                          </optgroup>
                        </select>
                      </span>
                    );
                  })}
                  <span className="flex-1" />
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </ActionForm>
              );
            })}
          </Card>
        </Section>
      </div>
    </>
  );
}

/** `id` is the anchor the HR menu links to (e.g. /settings/hr#approvals). */
function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-medium">{title}</h2>
      {hint ? <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}
