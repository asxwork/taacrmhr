import Link from "next/link";
import { AlarmClock, CircleSlash, Hourglass, TimerReset } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { attendancePolicy } from "@/lib/attendance-policy";
import { payrollSettings } from "@/lib/payroll";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { savePolicyPlanner } from "./actions";

export const metadata = { title: "Policy Planner" };

/** Compliance → Policy Planner: absent, missing, short-duration and overtime rules in one place. */
export default async function PolicyPlanner() {
  const user = await requirePermission("hr.employees");
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all";
  const [policy, pay, shifts] = await Promise.all([attendancePolicy(), payrollSettings(), db.shift.findMany({ orderBy: { name: "asc" } })]);

  return (
    <>
      <PageHeader title="Policy Planner" description="How attendance is counted. These rules apply everywhere at once: daily attendance, the HR dashboard, reports and payroll deductions." />
      <ActionForm action={savePolicyPlanner} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section icon={<CircleSlash className="size-5 text-red-500" />} title="Absent Policy" text="A work day with no check-in, no leave and no holiday is absent and deducted at one day's pay (gross ÷ 30).">
          <Field label="Count a day as absent if worked less than (hours)" hint="0 = off. Otherwise shorter days are absent rather than half days.">
            <input name="absentUnderHours" type="number" step="0.5" min={0} max={12} defaultValue={policy.absentUnderMin / 60} disabled={!canEdit} className="input w-32" />
          </Field>
        </Section>
        <Section icon={<TimerReset className="size-5 text-orange-500" />} title="Missing Policy" text="Someone checked in but never checked out (and didn't get a correction approved).">
          <Field label="Count it as">
            <select name="missingAs" defaultValue={policy.missingAs} disabled={!canEdit} className="input w-56">
              <option value="present">Present (just flag it)</option>
              <option value="half">Half day</option>
              <option value="absent">Absent</option>
            </select>
          </Field>
        </Section>
        <Section icon={<Hourglass className="size-5 text-amber-500" />} title="Short Duration Policy" text="Late arrivals beyond the shift's grace time, and days shorter than the shift's half-day limit.">
          <Field label="Late arrivals that make one day's deduction" hint="0 = never deduct for lateness.">
            <input name="latesPerDay" type="number" min={0} max={31} defaultValue={pay.latesPerDay} disabled={!canEdit} className="input w-32" />
          </Field>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {shifts.map((s) => <li key={s.id}>{s.name}: late after {s.graceMin} min · half day under {Math.round(s.halfDayMin / 6) / 10} h</li>)}
          </ul>
          <Link href="/settings/hr#shifts" className="mt-1 inline-block text-xs text-navy-700 hover:underline">Edit shifts</Link>
        </Section>
        <Section icon={<AlarmClock className="size-5 text-emerald-600" />} title="Overtime Policy" text="Time after the shift end, and all hours on off days and holidays.">
          <div className="flex flex-wrap gap-4">
            <Field label="Starts after (minutes past shift end)"><input name="overtimeAfterMin" type="number" min={0} max={600} defaultValue={policy.overtimeAfterMin} disabled={!canEdit} className="input w-32" /></Field>
            <Field label="Paid at (× hourly rate)" hint="0 = not paid"><input name="overtimeRate" type="number" step="0.25" min={0} max={5} defaultValue={pay.overtimeRate} disabled={!canEdit} className="input w-32" /></Field>
          </div>
        </Section>
        {canEdit && <div className="lg:col-span-2"><SubmitButton>Save policies</SubmitButton></div>}
      </ActionForm>
    </>
  );
}


function Section({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start gap-3">{icon}<div><h2 className="font-semibold">{title}</h2><p className="text-sm text-muted">{text}</p></div></div>
      {children}
    </Card>
  );
}
