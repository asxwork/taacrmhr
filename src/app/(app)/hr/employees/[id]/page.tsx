import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, differenceInMonths, format } from "date-fns";
import { ArrowLeft, ArrowRightLeft, Check, CheckCircle2, FileText, LogOut, Pencil, RotateCcw, Trash2, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { EMPLOYMENT_TYPES, empStatus, employeeAllows } from "@/lib/hr";
import { fileUrl } from "@/lib/files";
import { cn, fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Drawer, EmptyState, LinkButton } from "@/components/ui";
import { InfoList, StatusPill } from "@/components/crm/bits";
import { PersonAvatar } from "@/components/person-avatar";
import { AssignmentForm, DocumentForm, EmployeeForm, ResignForm } from "../forms";
import { orgOptions } from "../org-data";
import { addEmployeeNote, completeExit, createLoginForEmployee, confirmEmployee, deleteDocument, rehireEmployee, toggleChecklistItem, uploadPhoto } from "../actions";

export const metadata = { title: "Employee" };

type SP = { tab?: string; edit?: string; assign?: string; resign?: string };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const emp = await db.employee.findUnique({
    where: { id },
    include: {
      department: true, designation: true, branch: true, manager: true, user: { select: { email: true, active: true, lastLoginAt: true } },
      reports: { where: { status: { not: "left" } }, select: { id: true, fullName: true } },
      documents: { orderBy: { createdAt: "desc" } },
      events: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      checklist: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!emp || !(can(user, "hr.employees") && (await employeeAllows(user, emp, "view")))) notFound();

  const path = `/hr/employees/${id}`;
  const canEdit = can(user, "hr.employees", "edit") && (await employeeAllows(user, emp, "edit"));
  const tab = ["documents", "history", "checklist"].includes(sp.tab ?? "") ? sp.tab! : "overview";
  const st = empStatus(emp.status);
  const tenure = differenceInMonths(emp.leftAt ?? new Date(), emp.joiningDate);
  const needsOrg = canEdit && (sp.assign || sp.edit);
  const org = needsOrg ? await orgOptions() : null;
  const roles = canEdit && !emp.user ? (await db.role.findMany({ orderBy: { name: "asc" } })).filter((r) => user.isSuperAdmin || r.name === "Employee").sort((a) => (a.name === "Employee" ? -1 : 1)) : [];
  const actors = new Map((await db.user.findMany({ where: { id: { in: [...emp.events.map((e) => e.byId), ...emp.checklist.map((c) => c.doneById)].filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const tabs: [string, string, number?][] = [["overview", "Overview"], ["documents", "Documents", emp.documents.length], ["history", "History", emp.events.length], ["checklist", "Checklists", emp.checklist.filter((c) => !c.doneAt).length || undefined]];

  return (
    <>
      <Link href="/hr/employees" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Employees
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <PersonAvatar name={emp.fullName} photo={emp.photo} className="size-16 text-lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{emp.fullName}</h1>
              <StatusPill name={st.label} colorName={st.color} />
            </div>
            <p className="text-sm text-muted">
              {emp.designation?.name ?? "No designation"}{emp.department ? ` · ${emp.department.name}` : ""}{emp.branch ? ` · ${emp.branch.name}` : ""}
            </p>
            <p className="text-xs text-muted">{emp.code} · {tenure >= 12 ? `${Math.floor(tenure / 12)}y ${tenure % 12}m` : `${tenure}m`} with the company</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`${path}?edit=1`} variant="secondary" scroll={false}><Pencil className="size-4" /> Edit</LinkButton>
            {emp.status !== "left" && <LinkButton href={`${path}?assign=1`} variant="secondary" scroll={false}><ArrowRightLeft className="size-4" /> Role / transfer</LinkButton>}
            {emp.status === "probation" && (
              <form action={confirmEmployee}><input type="hidden" name="id" value={id} /><Button><UserCheck className="size-4" /> Confirm</Button></form>
            )}
            {(emp.status === "probation" || emp.status === "active") && <LinkButton href={`${path}?resign=1`} variant="danger" scroll={false}><LogOut className="size-4" /> Exit…</LinkButton>}
            {emp.status === "notice" && (
              <form action={completeExit}><input type="hidden" name="id" value={id} /><Button variant="danger"><LogOut className="size-4" /> Complete exit</Button></form>
            )}
            {emp.status === "left" && (
              <form action={rehireEmployee}><input type="hidden" name="id" value={id} /><Button variant="secondary"><RotateCcw className="size-4" /> Rehire</Button></form>
            )}
          </div>
        )}
      </div>

      {emp.status === "probation" && emp.probationEnd && (
        <Banner tone="amber">Probation ends {fmtDate(emp.probationEnd)} ({differenceInCalendarDays(emp.probationEnd, new Date())} days).</Banner>
      )}
      {emp.status === "notice" && emp.lastWorkingDay && (
        <Banner tone="violet">Serving notice · last working day {fmtDate(emp.lastWorkingDay)}. Finish the exit checklist, then complete the exit.</Banner>
      )}

      <div className="mb-5 flex gap-1 border-b border-line">
        {tabs.map(([t, label, n]) => (
          <Link key={t} href={t === "overview" ? path : `${path}?tab=${t}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t ? "border-navy-900 font-medium" : "border-transparent text-muted hover:text-ink")}>
            {label}{n ? <span className="ml-1.5 text-xs text-muted">{n}</span> : null}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Job</h2>
            <InfoList rows={[
              ["Employee code", emp.code],
              ["Designation", emp.designation?.name],
              ["Department", emp.department?.name],
              ["Branch", emp.branch?.name],
              ["Reports to", emp.manager ? <Link key="m" href={`/hr/employees/${emp.manager.id}`} className="hover:underline">{emp.manager.fullName}</Link> : null],
              ["Team", emp.reports.length ? `${emp.reports.length} direct report${emp.reports.length === 1 ? "" : "s"}` : null],
              ["Type", EMPLOYMENT_TYPES.find((t) => t.value === emp.employmentType)?.label],
              ["Joined", fmtDate(emp.joiningDate)],
              ["Confirmed", emp.confirmedAt ? fmtDate(emp.confirmedAt) : null],
              ["Login", emp.user ? `${emp.user.email}${emp.user.active ? "" : " (disabled)"}` : "No login"],
            ]} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Personal</h2>
            <InfoList rows={[
              ["Father / husband", emp.fatherName],
              ["Gender", emp.gender && emp.gender[0]!.toUpperCase() + emp.gender.slice(1)],
              ["Date of birth", emp.dob ? fmtDate(emp.dob) : null],
              ["CNIC", emp.cnic ? `${emp.cnic}${emp.cnicExpiry ? ` · exp ${fmtDate(emp.cnicExpiry)}` : ""}` : null],
              ["Marital status", emp.maritalStatus],
              ["Blood group", emp.bloodGroup],
              ["Phone", emp.phone],
              ["Personal email", emp.personalEmail],
              ["Address", [emp.address, emp.city].filter(Boolean).join(", ")],
            ]} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Emergency contact</h2>
            <InfoList rows={[["Name", emp.emergencyName], ["Relation", emp.emergencyRelation], ["Phone", emp.emergencyPhone]]} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Bank</h2>
            <InfoList rows={[["Bank", emp.bankName], ["Account title", emp.accountTitle], ["Account / IBAN", emp.accountNumber]]} />
          </Card>
          {canEdit && !emp.user && emp.status !== "left" && (
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-1 text-sm font-medium">System login</h2>
              <p className="mb-3 text-sm text-muted">{emp.fullName} can’t sign in yet. Create a login so they can check in, apply for leave and see payslips.</p>
              <ActionForm action={createLoginForEmployee} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input type="hidden" name="id" value={id} />
                <input name="email" type="email" required defaultValue={emp.personalEmail ?? ""} placeholder="Login email" className="input" aria-label="Login email" />
                <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Temporary password" className="input" aria-label="Temporary password" />
                <select name="roleId" className="input" aria-label="Role">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                <SubmitButton variant="secondary">Create login</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {canEdit && (
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-2 text-sm font-medium">Photo</h2>
              <ActionForm action={uploadPhoto} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={id} />
                <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
                <SubmitButton variant="secondary" pendingText="Uploading…">Upload photo</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            {emp.documents.length === 0 ? <EmptyState title="No documents yet" /> : (
              <ul className="divide-y divide-line">
                {emp.documents.map((d) => {
                  const days = d.expiresAt ? differenceInCalendarDays(d.expiresAt, new Date()) : null;
                  return (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <FileText className="size-4 text-muted" />
                      <a href={fileUrl(d.path)} target="_blank" rel="noreferrer" className="font-medium hover:underline">{d.title}</a>
                      <span className="text-xs text-muted">{d.type} · {Math.max(1, Math.round(d.size / 1024))} KB · {fmtDate(d.createdAt)}</span>
                      <span className="flex-1" />
                      {!d.verified && <Badge tone="amber">Awaiting HR</Badge>}
                      {days != null && <Badge tone={days < 0 ? "red" : days <= 30 ? "amber" : "neutral"}>{days < 0 ? "Expired" : `Expires ${fmtDate(d.expiresAt)}`}</Badge>}
                      {canEdit && (
                        <form action={deleteDocument}>
                          <input type="hidden" name="id" value={d.id} />
                          <button title="Delete document" aria-label="Delete document" className="rounded p-1 text-muted hover:bg-canvas hover:text-red-600"><Trash2 className="size-3.5" /></button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          {canEdit && <Card className="p-5"><h2 className="mb-3 text-sm font-medium">Add document</h2><DocumentForm employeeId={id} /></Card>}
        </div>
      )}

      {tab === "history" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="p-5">
            <ul className="relative space-y-5 before:absolute before:inset-y-1 before:left-[7px] before:w-px before:bg-line">
              {emp.events.map((e) => (
                <li key={e.id} className="relative pl-7">
                  <span className={cn("absolute left-0 top-1 size-[15px] rounded-full border-2 border-surface", EVENT_DOT[e.type] ?? "bg-slate-400")} />
                  <p className="text-sm font-medium">{e.title}</p>
                  {e.details && <p className="mt-0.5 whitespace-pre-line text-sm text-ink/75">{e.details}</p>}
                  <p className="mt-0.5 text-xs text-muted">{format(e.date, "d MMM yyyy")}{e.byId && actors.get(e.byId) ? ` · ${actors.get(e.byId)}` : ""}</p>
                </li>
              ))}
            </ul>
          </Card>
          {canEdit && (
            <Card className="h-fit p-5">
              <h2 className="mb-2 text-sm font-medium">Add a note</h2>
              <ActionForm action={addEmployeeNote} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <textarea name="note" rows={3} required className="input" placeholder="e.g. Appreciation for Q3 sales" />
                <SubmitButton variant="secondary">Add note</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      )}

      {tab === "checklist" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["onboarding", "offboarding"] as const).map((kind) => {
            const items = emp.checklist.filter((c) => c.kind === kind);
            if (!items.length) return null;
            const doneCount = items.filter((i) => i.doneAt).length;
            return (
              <Card key={kind} className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium">{kind === "onboarding" ? "Onboarding" : "Exit"} checklist</h2>
                  <span className={cn("text-xs", doneCount === items.length ? "text-emerald-700" : "text-muted")}>{doneCount}/{items.length} done</span>
                </div>
                <ul className="space-y-1.5">
                  {items.map((i) => (
                    <li key={i.id}>
                      <form action={toggleChecklistItem} className="flex items-center gap-2.5">
                        <input type="hidden" name="id" value={i.id} />
                        <button disabled={!canEdit} className={cn("flex size-5 shrink-0 items-center justify-center rounded border", i.doneAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-line bg-surface enabled:hover:border-navy-700")} aria-label={i.doneAt ? "Mark not done" : "Mark done"}>
                          {i.doneAt && <Check className="size-3.5" />}
                        </button>
                        <span className={cn("flex-1 text-sm", i.doneAt && "text-muted line-through")}>{i.title}</span>
                        {i.doneAt && <span className="text-xs text-muted">{fmtDate(i.doneAt)}{i.doneById && actors.get(i.doneById) ? ` · ${actors.get(i.doneById)}` : ""}</span>}
                      </form>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {emp.checklist.length === 0 && <Card className="p-6 text-sm text-muted lg:col-span-2"><CheckCircle2 className="mb-2 size-5 text-emerald-600" />No open checklists.</Card>}
        </div>
      )}

      {sp.edit && canEdit && (
        <Drawer title={`Edit ${emp.fullName}`} closeHref={path} width="max-w-2xl">
          <EmployeeForm employee={emp} cancelHref={path} />
        </Drawer>
      )}
      {sp.assign && canEdit && org && (
        <Drawer title="Change role or transfer" closeHref={path}>
          <AssignmentForm employee={emp} org={org} cancelHref={path} />
        </Drawer>
      )}
      {sp.resign && canEdit && (
        <Drawer title="Record exit notice" closeHref={path} width="max-w-md">
          <ResignForm employeeId={id} cancelHref={path} />
        </Drawer>
      )}
    </>
  );
}

const EVENT_DOT: Record<string, string> = {
  joined: "bg-emerald-500", confirmed: "bg-emerald-500", rehired: "bg-emerald-500", promoted: "bg-gold-600",
  transferred: "bg-sky-500", resigned: "bg-violet-500", exited: "bg-red-500", note: "bg-slate-400",
};

function Banner({ tone, children }: { tone: "amber" | "violet"; children: React.ReactNode }) {
  return <p className={cn("mb-5 rounded-lg border px-4 py-2.5 text-sm", tone === "amber" ? "border-amber-100 bg-amber-50 text-amber-800" : "border-violet-100 bg-violet-50 text-violet-800")}>{children}</p>;
}
