import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import { ArrowLeft, ArrowRightLeft, Check, CheckCircle2, FileText, LogOut, RotateCcw, Trash2, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeFor } from "@/lib/permissions";
import { employeeAllows } from "@/lib/hr";
import { loadProfile, profileOptions } from "@/lib/employee-profile";
import { fileUrl } from "@/lib/files";
import { cn, fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Drawer, EmptyState, LinkButton } from "@/components/ui";
import { ProfileView } from "@/components/hr/profile-view";
import { Row, SectionTitle } from "@/components/hr/profile-parts";
import { AssignmentForm, DocumentForm, ResignForm } from "../forms";
import { orgOptions } from "../org-data";
import { addEmployeeNote, completeExit, createLoginForEmployee, confirmEmployee, deleteDocument, rehireEmployee, toggleChecklistItem } from "../actions";

export const metadata = { title: "Employee" };

type SP = { tab?: string; assign?: string; resign?: string };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = await loadProfile(id);
  if (!p || !(can(user, "hr.employees") && (await employeeAllows(user, p.emp, "view")))) notFound();
  const { emp } = p;

  const path = `/hr/employees/${id}`;
  const canEdit = can(user, "hr.employees", "edit") && (await employeeAllows(user, emp, "edit"));
  const canSalary = user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";
  const [options, org, roles, actors] = await Promise.all([
    profileOptions(),
    canEdit && sp.assign ? orgOptions() : null,
    canEdit && !emp.user ? db.role.findMany({ orderBy: { name: "asc" } }).then((rs) => rs.filter((r) => user.isSuperAdmin || r.name === "Employee").sort((a) => (a.name === "Employee" ? -1 : 1))) : [],
    db.user.findMany({ where: { id: { in: [...emp.events.map((e) => e.byId), ...emp.checklist.map((c) => c.doneById)].filter(Boolean) as string[] } }, select: { id: true, name: true } }).then((us) => new Map(us.map((u) => [u.id, u.name]))),
  ]);

  const actions = canEdit && (
    <>
      {emp.status !== "left" && <LinkButton href={`${path}?assign=1`} variant="secondary" scroll={false} className="h-8 text-xs"><ArrowRightLeft className="size-3.5" /> Role / transfer</LinkButton>}
      {emp.status === "probation" && (
        <form action={confirmEmployee}><input type="hidden" name="id" value={id} /><Button className="h-8 text-xs"><UserCheck className="size-3.5" /> Confirm</Button></form>
      )}
      {(emp.status === "probation" || emp.status === "active") && <LinkButton href={`${path}?resign=1`} variant="danger" scroll={false} className="h-8 text-xs"><LogOut className="size-3.5" /> Exit…</LinkButton>}
      {emp.status === "notice" && (
        <form action={completeExit}><input type="hidden" name="id" value={id} /><Button variant="danger" className="h-8 text-xs"><LogOut className="size-3.5" /> Complete exit</Button></form>
      )}
      {emp.status === "left" && (
        <form action={rehireEmployee}><input type="hidden" name="id" value={id} /><Button variant="secondary" className="h-8 text-xs"><RotateCcw className="size-3.5" /> Rehire</Button></form>
      )}
    </>
  );

  const banner = (
    <>
      {emp.status === "probation" && emp.probationEnd && (
        <Banner tone="amber">Probation ends {fmtDate(emp.probationEnd)} ({differenceInCalendarDays(emp.probationEnd, new Date())} days).</Banner>
      )}
      {emp.status === "notice" && emp.lastWorkingDay && (
        <Banner tone="violet">Serving notice · last working day {fmtDate(emp.lastWorkingDay)}. Finish the exit checklist, then complete the exit.</Banner>
      )}
    </>
  );

  const documents = (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {emp.documents.length === 0 ? <EmptyState title="No Records Found!" /> : (
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
  );

  const userTab = (
    <Card className="p-4">
      <SectionTitle>User Account Information</SectionTitle>
      {emp.user ? (
        <>
          <Row label="Email/Username">{emp.user.email}</Row>
          <Row label="Time Zone">{process.env.APP_TIMEZONE ?? "Asia/Karachi"}</Row>
          <Row label="Role">
            {emp.user.roles.map((r) => r.role.name).join(", ") || "—"}
            {can(user, "settings.users", "edit") && <Link href={`/settings/users?u=${emp.user.id}`} className="ml-2 text-xs text-navy-700 hover:underline">Change</Link>}
          </Row>
          <Row label="Account">{emp.user.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</Row>
          <Row label="Last sign-in">{emp.user.lastLoginAt ? format(emp.user.lastLoginAt, "d MMM yyyy, h:mm a") : "Never"}</Row>
        </>
      ) : canEdit && emp.status !== "left" ? (
        <div className="px-3 py-3">
          <p className="mb-3 text-sm text-muted">{emp.fullName} can’t sign in yet. Create a login so they can check in, apply for leave and see payslips.</p>
          <ActionForm action={createLoginForEmployee} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input type="hidden" name="id" value={id} />
            <input name="email" type="email" required defaultValue={emp.officialEmail ?? emp.personalEmail ?? ""} placeholder="Login email" className="input" aria-label="Login email" />
            <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Temporary password" className="input" aria-label="Temporary password" />
            <select name="roleId" className="input" aria-label="Role">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <SubmitButton variant="secondary">Create login</SubmitButton>
          </ActionForm>
        </div>
      ) : <p className="px-3 py-6 text-center text-sm text-muted">No login.</p>}
    </Card>
  );

  const history = (
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
  );

  const checklists = (
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
  );

  return (
    <>
      <Link href="/hr/employees" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Employees
      </Link>

      <ProfileView
        p={p} options={options} canEdit={canEdit} canSalary={canSalary} showSalary={can(user, "hr.payroll")}
        actions={actions || undefined} banner={banner} initialTab={sp.tab ?? "info"} docsTab={documents} userTab={userTab}
        extraTabs={[
          { key: "history", label: "History", count: emp.events.length, content: history },
          { key: "checklist", label: "Checklists", count: emp.checklist.filter((c) => !c.doneAt).length || undefined, content: checklists },
        ]}
      />

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
