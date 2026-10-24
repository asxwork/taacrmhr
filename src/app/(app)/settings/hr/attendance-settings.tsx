import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { WEEKDAYS, geofenceMode } from "@/lib/attendance";
import { COLOR_NAMES } from "@/lib/crm-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field } from "@/components/ui";
import { deleteHoliday, saveGeofence, saveHoliday, saveLeaveType, saveShift } from "./actions";

/** Attendance & leave configuration blocks for the HR settings page. */
export async function AttendanceSettings() {
  const year = new Date().getFullYear();
  const [shifts, holidays, branches, mode, types] = await Promise.all([
    db.shift.findMany({ include: { _count: { select: { employees: true } } }, orderBy: { name: "asc" } }),
    db.holiday.findMany({ where: { date: { gte: new Date(year, 0, 1) } }, orderBy: { date: "asc" } }),
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    geofenceMode(),
    db.leaveType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <>
      <Block title="Shifts" hint="Late after start + grace. Fewer worked hours than the half-day threshold counts as a half day.">
        <Card className="divide-y divide-line">
          {[...shifts, null].map((s) => (
            <ActionForm key={s?.id ?? "new"} action={saveShift} className={`grid gap-3 p-4 sm:grid-cols-[1.4fr_repeat(4,1fr)] ${s ? "" : "bg-canvas/50"}`}>
              {s && <input type="hidden" name="id" value={s.id} />}
              <Field label={s ? "Shift" : "New shift"}><input name="name" defaultValue={s?.name} required className="input" /></Field>
              <Field label="Start"><input name="start" type="time" defaultValue={s?.start ?? "09:00"} required className="input" /></Field>
              <Field label="End"><input name="end" type="time" defaultValue={s?.end ?? "18:00"} required className="input" /></Field>
              <Field label="Grace (min)"><input name="graceMin" type="number" min={0} max={120} defaultValue={s?.graceMin ?? 15} className="input" /></Field>
              <Field label="Half day under (h)"><input name="halfDayHours" type="number" step="0.5" min={0.5} max={12} defaultValue={(s?.halfDayMin ?? 240) / 60} className="input" /></Field>
              <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-4">
                <legend className="sr-only">Working days</legend>
                {WEEKDAYS.map((d) => (
                  <label key={d.value} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="workDays" value={d.value} defaultChecked={(s?.workDays ?? "1,2,3,4,5,6").split(",").includes(String(d.value))} className="accent-navy-900" /> {d.label}
                  </label>
                ))}
                <label className="ml-2 flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" name="isDefault" defaultChecked={s?.isDefault} className="accent-navy-900" /> Default</label>
                {s && <Badge>{s._count.employees} people</Badge>}
              </fieldset>
              <div className="flex items-end justify-end"><SubmitButton variant={s ? "secondary" : "primary"}>{s ? "Save" : "Add shift"}</SubmitButton></div>
            </ActionForm>
          ))}
        </Card>
      </Block>

      <Block title={`Public holidays ${year}`} hint="Islamic holidays move each year — check them against the official notification.">
        <Card className="divide-y divide-line">
          {holidays.map((h) => (
            <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-28 tabular-nums text-muted">{format(h.date, "EEE d MMM")}</span>
              <span className="flex-1">{h.name}</span>
              {h.branchId && <Badge>{branches.find((b) => b.id === h.branchId)?.name ?? "Branch"} only</Badge>}
              <form action={deleteHoliday}>
                <input type="hidden" name="id" value={h.id} />
                <button aria-label={`Remove ${h.name}`} title="Remove" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-red-600"><Trash2 className="size-4" /></button>
              </form>
            </div>
          ))}
          <ActionForm action={saveHoliday} className="flex flex-wrap items-end gap-2 bg-canvas/50 p-3">
            <Field label="Date"><input name="date" type="date" required className="input w-44" /></Field>
            <Field label="Name" className="min-w-48 flex-1"><input name="name" required className="input" /></Field>
            <Field label="Applies to">
              <select name="branchId" className="input w-40"><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </Field>
            <SubmitButton>Add holiday</SubmitButton>
          </ActionForm>
        </Card>
      </Block>

      <Block title="Check-in location (geo-fence)" hint="Web check-ins are compared with the branch location. Get coordinates by right-clicking the office in Google Maps.">
        <Card className="p-5">
          <ActionForm action={saveGeofence} className="space-y-4" successMessage="Saved.">
            <Field label="Mode" className="max-w-sm">
              <select name="mode" defaultValue={mode} className="input">
                <option value="off">Off — location not checked</option>
                <option value="warn">Warn — allow, but flag check-ins outside the office</option>
                <option value="enforce">Enforce — block check-ins outside the office</option>
              </select>
            </Field>
            <div className="space-y-2">
              {branches.map((b) => (
                <div key={b.id} className="grid items-end gap-2 sm:grid-cols-[140px_1fr_1fr_120px]">
                  <span className="pb-2.5 text-sm font-medium">{b.name}</span>
                  <Field label="Latitude"><input name={`lat:${b.id}`} defaultValue={b.lat ?? ""} inputMode="decimal" className="input" /></Field>
                  <Field label="Longitude"><input name={`lng:${b.id}`} defaultValue={b.lng ?? ""} inputMode="decimal" className="input" /></Field>
                  <Field label="Radius (m)"><input name={`r:${b.id}`} type="number" min={30} max={5000} defaultValue={b.radiusM} className="input" /></Field>
                </div>
              ))}
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
      </Block>

      <Block title="Leave types" hint="Quota is days per year. Unpaid with quota 0 = unlimited. Annual = granted up-front (pro-rated for new joiners); monthly = earned each month.">
        <Card className="divide-y divide-line">
          {[...types, null].map((t) => (
            <ActionForm key={t?.id ?? "new"} action={saveLeaveType} className={`grid gap-3 p-4 sm:grid-cols-6 ${t ? "" : "bg-canvas/50"}`}>
              {t && <input type="hidden" name="id" value={t.id} />}
              <Field label={t ? "Name" : "New leave type"} className="sm:col-span-2"><input name="name" defaultValue={t?.name} required className="input" /></Field>
              <Field label="Code"><input name="code" defaultValue={t?.code} required maxLength={4} className="input uppercase" /></Field>
              <Field label="Days / year"><input name="quota" type="number" step="0.5" min={0} defaultValue={t?.quota ?? 0} className="input" /></Field>
              <Field label="Carry forward max"><input name="carryMax" type="number" step="0.5" min={0} defaultValue={t?.carryMax ?? 0} className="input" /></Field>
              <Field label="Colour">
                <select name="color" defaultValue={t?.color ?? "blue"} className="input">{COLOR_NAMES.map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
              <Field label="Granted">
                <select name="accrual" defaultValue={t?.accrual ?? "annual"} className="input"><option value="annual">Yearly</option><option value="monthly">Monthly</option></select>
              </Field>
              <Field label="Only for">
                <select name="gender" defaultValue={t?.gender ?? ""} className="input"><option value="">Everyone</option><option value="female">Women</option><option value="male">Men</option></select>
              </Field>
              <Field label="After (months)"><input name="minServiceMonths" type="number" min={0} defaultValue={t?.minServiceMonths ?? 0} className="input" /></Field>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:col-span-2">
                <label className="flex items-center gap-1.5"><input type="checkbox" name="paid" defaultChecked={t?.paid ?? true} className="accent-navy-900" /> Paid</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="halfDay" defaultChecked={t?.halfDay ?? true} className="accent-navy-900" /> Half days</label>
                {t && <label className="flex items-center gap-1.5"><input type="checkbox" name="active" defaultChecked={t.active} className="accent-navy-900" /> Active</label>}
              </div>
              <div className="flex items-end justify-end"><SubmitButton variant={t ? "secondary" : "primary"}>{t ? "Save" : "Add"}</SubmitButton></div>
            </ActionForm>
          ))}
        </Card>
      </Block>
    </>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-medium">{title}</h2>
      {hint ? <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}
