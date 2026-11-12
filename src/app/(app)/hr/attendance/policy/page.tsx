import Link from "@/components/link";
import { AlarmClock, CalendarX2, Clock3, Hourglass, LogOut, Palmtree, TimerReset, UserX } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { attendancePolicy } from "@/lib/attendance-policy";
import { payrollSettings } from "@/lib/payroll";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { saveAttendanceRule } from "./actions";

export const metadata = { title: "Attendance Policy" };

const TABS = [
  ["absent", "Absent", UserX], ["missing", "Missing", CalendarX2], ["late", "Late arrival", AlarmClock], ["early", "Early left", LogOut],
  ["short", "Short duration", Hourglass], ["overtime", "Overtime", Clock3], ["leave", "Leave", Palmtree],
] as const;
type Tab = (typeof TABS)[number][0];

/**
 * Compliance → Attendance Policy: the rules that turn punches into Present / Late / Half day / Absent, one tab per
 * rule. Times per shift (start, end, grace, half day) live on the Shifts page.
 */
export default async function AttendancePolicyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("hr.attendance");
  const want = (await searchParams).tab;
  const tab: Tab = (TABS.find(([t]) => t === want)?.[0] ?? "absent") as Tab;
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all";
  const [policy, pay, shifts, leaveTypes] = await Promise.all([
    attendancePolicy(), payrollSettings(),
    db.shift.findMany({ select: { id: true, name: true, start: true, end: true, graceMin: true, halfDayMin: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    db.leaveType.findMany({ where: { active: true }, select: { id: true, name: true, quota: true, paid: true }, orderBy: { sortOrder: "asc" } }).catch(() => [] as { id: string; name: string; quota: number; paid: boolean }[]),
  ]);

  const Rule = ({ title, children, how }: { title: string; how: React.ReactNode; children?: React.ReactNode }) => (
    <Card className="p-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-2 space-y-1 text-sm text-muted">{how}</div>
      {children && <div className="mt-5 border-t border-line pt-5">{children}</div>}
    </Card>
  );
  const form = (topic: string, fields: React.ReactNode) => (
    <ActionForm action={saveAttendanceRule} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="topic" value={topic} />
      <fieldset disabled={!canEdit} className="contents">{fields}</fieldset>
      {canEdit && <SubmitButton>Save rule</SubmitButton>}
    </ActionForm>
  );
  const shiftTable = (cols: [string, (s: (typeof shifts)[number]) => string][]) => (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Shift</th>{cols.map(([h]) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{shifts.map((s) => <tr key={s.id}><td className="px-3 py-2 font-medium">{s.name.replace("Custom · ", "")}</td>{cols.map(([h, f]) => <td key={h} className="px-3 py-2 tabular-nums">{f(s)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  const add = (t: string, m: number) => { const [h, mm] = t.split(":").map(Number); const x = h! * 60 + mm! + m; return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

  let body: React.ReactNode;
  if (tab === "absent") body = (
    <Rule title="Absent policy" how={<><p>A working day with <b>no punches and no approved leave</b> is <b>Absent</b>.</p><p>You can also count a day as absent when someone worked too little, even though they punched in and out.</p></>}>
      {form("absent", <Field label="Worked less than (hours) = absent" hint="0 = off"><input name="absentUnderHours" type="number" step="0.5" min={0} max={12} defaultValue={policy.absentUnderMin / 60} className="input w-40" /></Field>)}
    </Rule>
  );
  else if (tab === "missing") body = (
    <Rule title="Missing policy" how={<p>A day with a <b>check-in but no check-out</b> (forgot to punch out). Choose how it counts until HR corrects it or the employee requests a correction.</p>}>
      {form("missing", <Field label="A missing check-out counts as"><select name="missingAs" defaultValue={policy.missingAs} className="input w-56"><option value="present">Present (just flag it)</option><option value="half">Half day</option><option value="absent">Absent</option></select></Field>)}
    </Rule>
  );
  else if (tab === "late") body = (
    <Rule title="Late arrival policy" how={<><p>Checking in after the shift start <b>plus the grace minutes</b> is <b>Late</b>. Grace is set per shift on the <Link href="/hr/attendance/shifts" className="font-medium text-navy-900 underline">Shifts</Link> page.</p><p>Payroll can deduct one day for every so many lates in a month.</p></>}>
      <div className="space-y-4">
        {shiftTable([["Starts", (s) => s.start], ["Grace", (s) => `${s.graceMin} min`], ["Late after", (s) => add(s.start, s.graceMin)]])}
        {form("late", <Field label="Lates that cost 1 day's pay" hint="0 = never deduct"><input name="latesPerDay" type="number" min={0} max={31} defaultValue={pay.latesPerDay} className="input w-40" /></Field>)}
      </div>
    </Rule>
  );
  else if (tab === "early") body = (
    <Rule title="Early left policy" how={<><p>Checking out <b>before the shift end</b> is shown as <b>Early left</b> with the minutes, on the Time Sheet and reports.</p><p>If they leave so early that they worked less than the shift&apos;s half-day hours, the day counts as a <b>Half day</b> (see Short duration).</p></>}>
      {shiftTable([["Ends", (s) => s.end], ["Half day if worked under", (s) => `${s.halfDayMin / 60}h`]])}
    </Rule>
  );
  else if (tab === "short") body = (
    <Rule title="Short duration policy" how={<><p>Worked less than the shift&apos;s <b>half-day hours</b> = <b>Half day</b>. Worked less than the Absent rule&apos;s hours = <b>Absent</b>.</p><p>Change half-day hours per shift on <Link href="/hr/attendance/shifts" className="font-medium text-navy-900 underline">Shifts</Link>.</p></>}>
      {shiftTable([["Hours", (s) => `${s.start}–${s.end}`], ["Half day under", (s) => `${s.halfDayMin / 60}h`], ["Absent under", () => (policy.absentUnderMin ? `${policy.absentUnderMin / 60}h` : "off")]])}
    </Rule>
  );
  else if (tab === "overtime") body = (
    <Rule title="Overtime policy" how={<p>Time worked <b>after the shift end</b> counts as overtime once it passes the minutes below. Work on a day off counts fully. Payroll pays it at the rate below (× hourly pay); 0 = don&apos;t pay overtime.</p>}>
      {form("overtime", <>
        <Field label="Overtime starts after (minutes)"><input name="overtimeAfterMin" type="number" min={0} max={600} defaultValue={policy.overtimeAfterMin} className="input w-40" /></Field>
        <Field label="Pay rate (× hourly)"><input name="overtimeRate" type="number" step="0.25" min={0} max={5} defaultValue={pay.overtimeRate} className="input w-40" /></Field>
      </>)}
    </Rule>
  );
  else body = (
    <Rule title="Leave policy" how={<p>An <b>approved leave</b> day counts as <b>Leave</b>, not absent. Paid leave keeps full pay; unpaid leave is deducted in payroll. Quotas and types are set in <Link href="/settings/hr?tab=leave" className="font-medium text-navy-900 underline">Leave &amp; holidays</Link>.</p>}>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Leave type</th><th className="px-3 py-2">Days / year</th><th className="px-3 py-2">Pay</th></tr></thead>
          <tbody className="divide-y divide-line">{leaveTypes.map((l) => <tr key={l.id}><td className="px-3 py-2 font-medium">{l.name}</td><td className="px-3 py-2 tabular-nums">{l.quota || "Unlimited"}</td><td className="px-3 py-2">{l.paid ? "Paid" : "Unpaid"}</td></tr>)}</tbody>
        </table>
      </div>
    </Rule>
  );

  return (
    <>
      <PageHeader title="Attendance Policy" description="How punches become Present, Late, Half day or Absent. These rules apply to the Time Sheet, reports and payroll." />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-black/5 p-1">
        {TABS.map(([t, label, Icon]) => (
          <Link key={t} href={t === "absent" ? "/hr/attendance/policy" : `/hr/attendance/policy?tab=${t}`} className={cn("flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </div>
      {body}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><TimerReset className="size-3.5" /> Shift times, grace and half-day hours are per shift: <Link href="/hr/attendance/shifts" className="underline">Attendance → Shifts</Link>.</p>
    </>
  );
}
