import { redirect } from "next/navigation";
import Link from "@/components/link";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeFor } from "@/lib/permissions";
import { getSetting, nextEmployeeCode } from "@/lib/hr";
import type { Step } from "@/lib/approvals";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, Field, PageHeader } from "@/components/ui";
import { deleteOrgUnit, saveDepartment, saveDesignation, saveFlow, saveHrGeneral } from "./actions";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { AttendanceSettings } from "./attendance-settings";

export const metadata = { title: "HR Settings" };

const TABS = [
  ["general", "General", "Employee codes, probation and checklists"],
  ["org", "Departments & designations", "Your company structure"],
  ["shifts", "Check-in location", "Office location for web check-in"],
  ["leave", "Leave & holidays", "Leave types and public holidays"],
  ["approvals", "Approvals", "Who approves each request"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function HrSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const sp = await searchParams;
  const want = sp.tab;
  const tab: Tab = (TABS.find(([t]) => t === want)?.[0] ?? "general") as Tab;
  const user = await requireUser();
  if (!user.isSuperAdmin && scopeFor(user, "hr.employees", "edit") !== "all") redirect("/no-access");

  const [departments, designations, employees, flows, users, prefix, probation, onboarding, offboarding] = await Promise.all([
    db.department.findMany({ include: { _count: { select: { employees: { where: { status: { not: "left" } } } } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.designation.findMany({ include: { _count: { select: { employees: { where: { status: { not: "left" } } } } } }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.approvalFlow.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getSetting("hr.codePrefix", "TAA-"),
    getSetting("hr.probationMonths", "3"),
    getSetting("hr.onboarding"),
    getSetting("hr.offboarding"),
  ]);

  const nextCode = await nextEmployeeCode();
  const [editKind, editId] = (sp.edit ?? "").split(":") as ["department" | "designation" | "", string | undefined];
  const editDept = editKind === "department" && editId !== "new" ? departments.find((d) => d.id === editId) : undefined;
  const editDesig = editKind === "designation" && editId !== "new" ? designations.find((d) => d.id === editId) : undefined;
  return (
    <>
      <PageHeader title="HR Settings" description="Pick a topic. Each one is a short page with only what it needs." />
      <nav aria-label="HR settings" className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TABS.map(([t, label, sub]) => (
          <Link key={t} href={t === "general" ? "/settings/hr" : `/settings/hr?tab=${t}`}
            className={cn("rounded-xl border px-3.5 py-3 transition hover:-translate-y-0.5 hover:shadow-sm", tab === t ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface")}>
            <span className="block text-sm font-medium">{label}</span>
            <span className={cn("mt-0.5 block text-xs", tab === t ? "text-white/70" : "text-muted")}>{sub}</span>
          </Link>
        ))}
      </nav>
      <div className="space-y-8">
        {tab === "org" && (() => {
          const people = (n: number) => <span className={n ? "font-medium tabular-nums" : "text-muted"}>{n} {n === 1 ? "person" : "people"}</span>;
          const status = (on: boolean) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{on ? "Active" : "Hidden"}</span>;
          const rowActions = (kind: "department" | "designation", id: string, name: string, n: number) => (
            <span className="flex items-start justify-end gap-1">
              <Link href={`/settings/hr?tab=org&edit=${kind}:${id}`} scroll={false} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-navy-900 hover:bg-canvas">Edit</Link>
              <ActionForm action={deleteOrgUnit} className="flex max-w-[14rem] flex-col items-end text-right text-xs">
                <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
                <ConfirmButton message={`Delete ${name}? This can't be undone.`} title={n ? "Move its people first" : "Delete"} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="size-3.5" /> Delete</ConfirmButton>
              </ActionForm>
            </span>
          );
          const head = (title: string, n: number, kind: string, label: string) => (
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="font-semibold">{title}</h2>
              <span className="rounded-full bg-black/5 px-2 text-xs tabular-nums">{n}</span>
              <Link href={`/settings/hr?tab=org&edit=${kind}:new`} scroll={false} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800"><Plus className="size-4" /> {label}</Link>
            </div>
          );
          return (
            <div className="space-y-6">
              <Card id="departments" className="overflow-hidden">
                {head("Departments", departments.length, "department", "Add department")}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Department</th><th className="px-4 py-2.5">Head</th><th className="px-4 py-2.5">People</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr></thead>
                    <tbody className="divide-y divide-line">
                      {departments.map((d) => (
                        <tr key={d.id} className="align-top hover:bg-canvas/50">
                          <td className="px-4 py-3"><span className="rounded-md bg-canvas px-2 py-0.5 font-mono text-xs text-muted">{d.code || "—"}</span></td>
                          <td className="px-4 py-3 font-medium">{d.name}</td>
                          <td className="px-4 py-3">{d.headId ? employees.find((e) => e.id === d.headId)?.fullName ?? "—" : <span className="text-amber-700">Not set</span>}</td>
                          <td className="px-4 py-3"><Link href={`/hr/employees?dept=${d.id}`} className="hover:underline">{people(d._count.employees)}</Link></td>
                          <td className="px-4 py-3">{status(d.active)}</td>
                          <td className="px-4 py-2">{rowActions("department", d.id, d.name, d._count.employees)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card id="designations" className="overflow-hidden">
                {head("Designations", designations.length, "designation", "Add designation")}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Designation</th><th className="px-4 py-2.5">Grade</th><th className="px-4 py-2.5">People</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr></thead>
                    <tbody className="divide-y divide-line">
                      {designations.map((d) => (
                        <tr key={d.id} className="align-top hover:bg-canvas/50">
                          <td className="px-4 py-3 font-medium">{d.name}</td>
                          <td className="px-4 py-3">{d.grade ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800">{d.grade}</span> : <span className="text-muted">—</span>}</td>
                          <td className="px-4 py-3"><Link href={`/hr/employees?desig=${d.id}`} className="hover:underline">{people(d._count.employees)}</Link></td>
                          <td className="px-4 py-3">{status(d.active)}</td>
                          <td className="px-4 py-2">{rowActions("designation", d.id, d.name, d._count.employees)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="text-xs text-muted">People counts are current staff. A department or designation can be deleted once nobody is in it; to keep it but stop it being picked, edit it and untick Active.</p>
            </div>
          );
        })()}

        {tab === "general" && <Section id="checklists" title="Employee defaults & checklists" hint="One checklist item per line. New hires get the onboarding list; recording a resignation creates the exit list.">
          <Card className="p-5">
            <ActionForm action={saveHrGeneral} className="space-y-4" successMessage="Saved.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Employee code prefix" hint={user.isSuperAdmin ? `Next new employee gets ${nextCode}; numbers carry on from the highest code.` : `Super Admin only. Next new employee: ${nextCode}`}><input name="codePrefix" defaultValue={prefix} readOnly={!user.isSuperAdmin} className="input read-only:bg-canvas read-only:text-muted" /></Field>
                <Field label="Probation (months)"><input name="probationMonths" type="number" min={0} max={24} defaultValue={probation} className="input" /></Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Onboarding checklist"><textarea name="onboarding" rows={7} defaultValue={onboarding} className="input" /></Field>
                <Field label="Exit checklist"><textarea name="offboarding" rows={7} defaultValue={offboarding} className="input" /></Field>
              </div>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
        </Section>}

        {(tab === "shifts" || tab === "leave") && <AttendanceSettings show={tab === "shifts" ? ["geofence"] : ["leave-types", "holidays"]} />}
        {tab === "shifts" && <p className="text-sm text-muted">Shifts and custom schedules have their own page: <Link href="/hr/attendance/shifts" className="font-medium text-navy-900 underline">Attendance → Shifts</Link>.</p>}

        {tab === "approvals" && <Section id="approvals" title="Approval chains" hint="Who approves each kind of request, in order. “Manager” is the employee’s reporting manager (falls back to HR if they have none).">
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
        </Section>}
      </div>
      {tab === "org" && editKind && (
        <Drawer title={editKind === "department" ? (editDept ? `Edit ${editDept.name}` : "Add department") : editDesig ? `Edit ${editDesig.name}` : "Add designation"} closeHref="/settings/hr?tab=org" width="max-w-md">
          {editKind === "department" ? (
            <ActionForm action={saveDepartment} className="space-y-4">
              {editDept && <input type="hidden" name="id" value={editDept.id} />}
              <Field label="Department name"><input name="name" required defaultValue={editDept?.name} className="input" autoFocus /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code" hint="e.g. SAL"><input name="code" defaultValue={editDept?.code ?? ""} className="input uppercase" /></Field>
                <Field label="Order in lists"><input name="sortOrder" type="number" defaultValue={editDept?.sortOrder ?? 0} className="input" /></Field>
              </div>
              <Field label="Head of department"><select name="headId" defaultValue={editDept?.headId ?? ""} className="input"><option value="">Not set</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}</select></Field>
              {editDept && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editDept.active} className="accent-navy-900" /> Active (can be picked for employees)</label>}
              <SubmitButton>{editDept ? "Save" : "Add department"}</SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={saveDesignation} className="space-y-4">
              {editDesig && <input type="hidden" name="id" value={editDesig.id} />}
              <Field label="Designation"><input name="name" required defaultValue={editDesig?.name} className="input" autoFocus /></Field>
              <Field label="Grade" hint="Optional, e.g. M2, S1"><input name="grade" defaultValue={editDesig?.grade ?? ""} className="input" /></Field>
              {editDesig && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editDesig.active} className="accent-navy-900" /> Active (can be picked for employees)</label>}
              <SubmitButton>{editDesig ? "Save" : "Add designation"}</SubmitButton>
            </ActionForm>
          )}
        </Drawer>
      )}
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
