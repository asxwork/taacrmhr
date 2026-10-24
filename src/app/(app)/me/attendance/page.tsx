import Link from "next/link";
import { addMonths, endOfMonth, format, isSameMonth, parse, startOfDay, startOfMonth, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DAY_STATUSES, fmtMinutes, geofenceMode, loadAttendance, summarize } from "@/lib/attendance";
import { color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { AttendanceCalendar } from "@/components/attendance-calendar";
import { CheckInButton } from "./check-in-button";
import { requestCorrection } from "./actions";

export const metadata = { title: "My Attendance" };

export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<{ month?: string; correct?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const emp = await db.employee.findUnique({ where: { userId: user.id }, include: { shift: true, branch: true } });
  if (!emp) {
    return (<><PageHeader title="My Attendance" /><Card><EmptyState title="No employee record" description="Ask HR to link your login to your employee profile." /></Card></>);
  }

  const now = new Date();
  const month = sp.month ? parse(sp.month, "yyyy-MM", now) : now;
  const to = isSameMonth(month, now) ? now : endOfMonth(month);
  const [att, todayPunches, mode] = await Promise.all([
    loadAttendance([emp.id], startOfMonth(month), to),
    db.attendancePunch.findMany({ where: { employeeId: emp.id, at: { gte: startOfDay(now) } }, orderBy: { at: "asc" } }),
    geofenceMode(),
  ]);
  const days = att.get(emp.id) ?? [];
  const sum = summarize(days.filter((d) => d.date <= now));
  const today = days.find((d) => d.date.getTime() === startOfDay(now).getTime());
  const base = `/me/attendance${sp.month ? `?month=${sp.month}` : ""}`;
  const correctDay = sp.correct ? parse(sp.correct, "yyyy-MM-dd", now) : null;
  const correctRec = correctDay ? days.find((d) => d.date.getTime() === correctDay.getTime()) : null;

  return (
    <>
      <PageHeader eyebrow={format(now, "EEEE d MMMM")} title="My Attendance" description={`${emp.shift?.name ?? "Default shift"}${emp.branch ? ` · ${emp.branch.name}` : ""}`} />

      <div className="mb-6 grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Today</p>
          <div className="mb-4 mt-1 flex items-baseline justify-between">
            <span className="font-display text-3xl font-semibold">{format(now, "h:mm a")}</span>
            {today && today.status !== "upcoming" && (
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", color(DAY_STATUSES[today.status].color).pill)}>{DAY_STATUSES[today.status].label}</span>
            )}
          </div>
          <CheckInButton checkedIn={todayPunches.length % 2 === 1} needsLocation={mode !== "off" && emp.branch?.lat != null} />
          {todayPunches.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
              {todayPunches.map((p, i) => (
                <li key={p.id} className="flex justify-between">
                  <span className="text-muted">{i % 2 === 0 ? "In" : "Out"}</span>
                  <span className="tabular-nums">{format(p.at, "h:mm a")}{p.outside && <span className="ml-1.5 text-xs text-amber-700">outside office</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([
            ["Present", sum.present, "green"], ["Late", sum.late, "amber"], ["Absent", sum.absent, "red"],
            ["Half days", sum.half, "violet"], ["Leave", sum.leave, "blue"], ["Hours worked", fmtMinutes(sum.workedMin), "slate"],
          ] as const).map(([label, value, c]) => (
            <Card key={label} className="p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted"><span className={cn("size-2 rounded-full", color(c).dot)} />{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
            </Card>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <Link href={`/me/attendance?month=${format(subMonths(month, 1), "yyyy-MM")}`} className="rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
          <span className="font-medium">{format(month, "MMMM yyyy")}</span>
          {isSameMonth(month, now) ? <span className="size-7" /> : (
            <Link href={`/me/attendance?month=${format(addMonths(month, 1), "yyyy-MM")}`} className="rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Next month"><ChevronRight className="size-4" /></Link>
          )}
        </div>
        <AttendanceCalendar month={month} days={days} dayHref={(d) => `/me/attendance?${sp.month ? `month=${sp.month}&` : ""}correct=${format(d, "yyyy-MM-dd")}`} />
        <p className="px-4 py-3 text-xs text-muted">Tap a past day to request a correction (forgot to punch, device down…).</p>
      </Card>

      {correctDay && (
        <Drawer title={`Correct ${format(correctDay, "EEE d MMM")}`} closeHref={base} width="max-w-md">
          {correctRec && (
            <p className="mb-4 text-sm text-muted">
              Currently: <b className="font-medium text-ink">{DAY_STATUSES[correctRec.status].label}</b>
              {correctRec.checkIn && ` · in ${format(correctRec.checkIn, "HH:mm")}`}{correctRec.checkOut && ` · out ${format(correctRec.checkOut, "HH:mm")}`}
            </p>
          )}
          <ActionForm action={requestCorrection} className="space-y-4">
            <input type="hidden" name="date" value={format(correctDay, "yyyy-MM-dd")} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check-in"><input name="checkIn" type="time" defaultValue={correctRec?.checkIn ? format(correctRec.checkIn, "HH:mm") : ""} className="input" /></Field>
              <Field label="Check-out"><input name="checkOut" type="time" defaultValue={correctRec?.checkOut ? format(correctRec.checkOut, "HH:mm") : ""} className="input" /></Field>
            </div>
            <Field label="Reason"><textarea name="reason" rows={3} required className="input" placeholder="e.g. Forgot to check out after the site visit" /></Field>
            <div className="flex gap-2">
              <SubmitButton>Send for approval</SubmitButton>
              <LinkButton href={base} variant="ghost" scroll={false}>Cancel</LinkButton>
            </div>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
