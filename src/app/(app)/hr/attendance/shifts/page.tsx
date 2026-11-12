import Link from "@/components/link";
import { Clock, Trash2, UserCog, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { WEEKDAYS } from "@/lib/attendance-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { saveShift } from "@/app/(app)/settings/hr/actions";
import { assignShift, deleteShift, saveCustomSchedule } from "./actions";

export const metadata = { title: "Shifts" };

const hours = (start: string, end: string) => {
  const [a, b] = start.split(":").map(Number); const [c, d] = end.split(":").map(Number);
  const m = c! * 60 + d! - (a! * 60 + b!);
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
};
const days = (w: string) => WEEKDAYS.filter((d) => w.split(",").includes(String(d.value))).map((d) => d.label.slice(0, 3)).join(" ");

/** Shifts (attendance policy): the company shifts, who is on each, and custom hours for one employee. */
export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePermission("hr.attendance");
  const sp = await searchParams;
  const admin = user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all";
  const [shifts, staff] = await Promise.all([
    db.shift.findMany({ include: { employees: { where: { status: { not: "left" } }, select: { id: true, fullName: true, photo: true }, orderBy: { fullName: "asc" } } }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true, shiftId: true }, orderBy: { fullName: "asc" } }),
  ]);
  const regular = shifts.filter((s) => !s.name.startsWith("Custom · "));
  const custom = shifts.filter((s) => s.name.startsWith("Custom · "));
  const noShift = staff.filter((e) => !e.shiftId).length;
  const editing = sp.edit ? shifts.find((s) => s.id === sp.edit) : sp.edit === "new" ? null : undefined;

  const shiftForm = (s: (typeof shifts)[number] | null) => (
    <ActionForm action={saveShift} className="grid gap-3 sm:grid-cols-4">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field label="Name" className="sm:col-span-4"><input name="name" defaultValue={s?.name} required className="input" placeholder="e.g. Morning 10–7" /></Field>
      <Field label="Start"><input name="start" type="time" defaultValue={s?.start ?? "10:00"} required className="input" /></Field>
      <Field label="End"><input name="end" type="time" defaultValue={s?.end ?? "19:00"} required className="input" /></Field>
      <Field label="Late after (min)"><input name="graceMin" type="number" min={0} max={120} defaultValue={s?.graceMin ?? 15} className="input" /></Field>
      <Field label="Half day under (h)"><input name="halfDayHours" type="number" step="0.5" min={0.5} max={12} defaultValue={(s?.halfDayMin ?? 240) / 60} className="input" /></Field>
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1 sm:col-span-4">
        <legend className="mb-1 text-sm font-medium">Working days</legend>
        {WEEKDAYS.map((d) => <label key={d.value} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="workDays" value={d.value} defaultChecked={(s?.workDays ?? "1,2,3,4,5,6").split(",").includes(String(d.value))} className="accent-navy-900" /> {d.label}</label>)}
        <label className="ml-auto flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" name="isDefault" defaultChecked={s?.isDefault} className="accent-navy-900" /> Default for new staff</label>
      </fieldset>
      <div className="flex gap-2 sm:col-span-4"><SubmitButton>{s ? "Save shift" : "Add shift"}</SubmitButton><Link href="/hr/attendance/shifts" className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-canvas">Close</Link></div>
    </ActionForm>
  );

  const ShiftCard = ({ s }: { s: (typeof shifts)[number] }) => (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", s.isDefault ? "bg-navy-900 text-white" : "bg-canvas text-navy-900")}><Clock className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{s.name.replace("Custom · ", "")}</p>
          <p className="text-sm tabular-nums text-muted">{s.start} – {s.end} · {hours(s.start, s.end)}</p>
        </div>
        {s.isDefault && <Badge tone="navy">Default</Badge>}
      </div>
      <p className="mt-3 text-xs text-muted">{days(s.workDays)} · late after {s.graceMin} min · half day under {s.halfDayMin / 60}h</p>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <div className="flex items-center -space-x-2">
          {s.employees.slice(0, 6).map((e) => <span key={e.id} title={e.fullName} className="rounded-full ring-2 ring-surface"><PersonAvatar name={e.fullName} photo={e.photo} className="size-7 text-[10px]" /></span>)}
          {s.employees.length > 6 && <span className="flex size-7 items-center justify-center rounded-full bg-canvas text-[10px] ring-2 ring-surface">+{s.employees.length - 6}</span>}
          {!s.employees.length && <span className="text-xs text-muted">Nobody on it</span>}
        </div>
        {admin && (
          <div className="flex items-center gap-1">
            <Link href={`/hr/attendance/shifts?edit=${s.id}`} scroll={false} className="rounded-md px-2 py-1 text-xs font-medium text-navy-900 hover:bg-canvas">Edit</Link>
            {!s.employees.length && !s.isDefault && <form action={deleteShift}><input type="hidden" name="id" value={s.id} /><button aria-label={`Delete ${s.name}`} title="Delete" className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="size-3.5" /></button></form>}
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <>
      <PageHeader title="Shifts" description={`${regular.length} shift(s) · ${custom.length} custom schedule(s)${noShift ? ` · ${noShift} people on the default shift` : ""}`}
        actions={admin && <Link href="/hr/attendance/shifts?edit=new" scroll={false} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">+ Add shift</Link>} />

      {admin && editing !== undefined && <Card className="mb-6 border-navy-900/20 p-5"><p className="mb-3 font-medium">{editing ? `Edit ${editing.name.replace("Custom · ", "")}` : "New shift"}</p>{shiftForm(editing)}</Card>}

      <h2 className="mb-3 flex items-center gap-2 font-medium"><Users className="size-4 text-muted" /> Company shifts</h2>
      {regular.length ? <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{regular.map((s) => <ShiftCard key={s.id} s={s} />)}</div> : <Card className="mb-8"><EmptyState title="No shifts yet" description="Add your first shift, e.g. 10:00–19:00 Monday to Saturday." /></Card>}

      {admin && (
        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <p className="font-medium">Move people to a shift</p>
            <p className="mb-3 text-sm text-muted">Pick a shift and the people who work it.</p>
            <ActionForm action={assignShift} className="space-y-3">
              <select name="shiftId" required className="input" defaultValue=""><option value="" disabled>Choose shift…</option>{regular.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}</select>
              <select name="employeeIds" multiple required aria-label="People" className="input h-36 py-1">{staff.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code})</option>)}</select>
              <p className="text-xs text-muted">Hold Ctrl (⌘ on Mac) to pick several.</p>
              <SubmitButton>Move to shift</SubmitButton>
            </ActionForm>
          </Card>
          <Card className="p-5">
            <p className="flex items-center gap-2 font-medium"><UserCog className="size-4" /> Custom attendance for one employee</p>
            <p className="mb-3 text-sm text-muted">Their own hours and days, e.g. a part-timer or someone with fixed late timings. Saving again updates it.</p>
            <ActionForm action={saveCustomSchedule} className="grid gap-3 sm:grid-cols-2">
              <Field label="Employee" className="sm:col-span-2"><select name="employeeId" required className="input" defaultValue=""><option value="" disabled>Choose…</option>{staff.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code})</option>)}</select></Field>
              <Field label="Start"><input name="start" type="time" defaultValue="11:00" required className="input" /></Field>
              <Field label="End"><input name="end" type="time" defaultValue="19:00" required className="input" /></Field>
              <Field label="Late after (min)"><input name="graceMin" type="number" min={0} max={120} defaultValue={15} className="input" /></Field>
              <Field label="Half day under (h)"><input name="halfDayHours" type="number" step="0.5" min={0.5} max={12} defaultValue={4} className="input" /></Field>
              <fieldset className="flex flex-wrap gap-x-3 gap-y-1 sm:col-span-2">
                <legend className="mb-1 text-sm font-medium">Working days</legend>
                {WEEKDAYS.map((d) => <label key={d.value} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="workDays" value={d.value} defaultChecked={d.value <= 6} className="accent-navy-900" /> {d.label}</label>)}
              </fieldset>
              <div className="sm:col-span-2"><SubmitButton>Save custom schedule</SubmitButton></div>
            </ActionForm>
          </Card>
        </div>
      )}

      {custom.length > 0 && (
        <>
          <h2 className="mb-3 flex items-center gap-2 font-medium"><UserCog className="size-4 text-muted" /> Custom schedules</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{custom.map((s) => <ShiftCard key={s.id} s={s} />)}</div>
        </>
      )}
    </>
  );
}
