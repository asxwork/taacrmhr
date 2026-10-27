import Link from "next/link";
import { addDays, addWeeks, format, isSameDay, isToday, parse, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { attendanceEmployeeWhere, defaultShift, isWorkDay } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { saveRoster } from "./actions";

export const metadata = { title: "Scheduling" };

/** Attendance → Scheduling: a weekly roster. Each cell is the usual shift, another shift or a day off; attendance follows it. */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; branch?: string }> }) {
  const user = await requirePermission("hr.attendance");
  const sp = await searchParams;
  const picked = sp.week ? parse(sp.week, "yyyy-MM-dd", new Date()) : new Date();
  const monday = startOfWeek(Number.isNaN(picked.getTime()) ? new Date() : picked, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const canEdit = user.isSuperAdmin || ["all", "branch"].includes(scopeFor(user, "hr.attendance", "edit"));
  const scope = (await attendanceEmployeeWhere(user))!;
  const [employees, shifts, roster, holidays, defShift, branches] = await Promise.all([
    db.employee.findMany({ where: { ...scope, status: { not: "left" }, ...(sp.branch && { branchId: sp.branch }) }, select: { id: true, fullName: true, code: true, branchId: true, shift: true }, orderBy: { fullName: "asc" } }),
    db.shift.findMany({ orderBy: { name: "asc" } }),
    db.rosterDay.findMany({ where: { date: { gte: monday, lt: addDays(monday, 7) } } }),
    db.holiday.findMany({ where: { date: { gte: monday, lt: addDays(monday, 7) } } }),
    defaultShift(),
    scopeFor(user, "hr.attendance") === "all" ? db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const wk = (d: Date) => `/hr/attendance/schedule?week=${format(d, "yyyy-MM-dd")}${sp.branch ? `&branch=${sp.branch}` : ""}`;
  const short = (s: { name: string; start: string; end: string }) => `${s.name} ${s.start}–${s.end}`;

  return (
    <>
      <PageHeader title="Scheduling" description="Plan who works which shift each day. Days off and shift changes here are what attendance is judged against; approved shift-adjustment requests appear automatically." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link href={wk(addWeeks(monday, -1))} aria-label="Previous week" className="rounded-md border border-line p-2 hover:bg-surface"><ChevronLeft className="size-4" /></Link>
          <span className="min-w-56 text-center text-sm font-medium">{format(monday, "d MMM")} – {format(addDays(monday, 6), "d MMM yyyy")}</span>
          <Link href={wk(addWeeks(monday, 1))} aria-label="Next week" className="rounded-md border border-line p-2 hover:bg-surface"><ChevronRight className="size-4" /></Link>
          <Link href={wk(new Date())} className="ml-1 rounded-md px-2 py-1.5 text-sm text-navy-700 hover:bg-surface">This week</Link>
        </div>
        {branches.length > 1 && (
          <AutoFilterForm>
            <input type="hidden" name="week" value={format(monday, "yyyy-MM-dd")} />
            <select name="branch" defaultValue={sp.branch ?? ""} className="input h-9 w-44" aria-label="Branch">
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </AutoFilterForm>
        )}
      </div>
      <Card className="p-4">
        {employees.length === 0 ? <EmptyState title="Nobody to schedule" /> : (
          <ActionForm action={saveRoster}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-2 py-2">Employee</th>
                    {days.map((d) => {
                      const hol = holidays.find((h) => isSameDay(h.date, d));
                      return <th key={d.toISOString()} className={cn("px-1 py-2 text-center", isToday(d) && "text-navy-900")}>{format(d, "EEE d")}{hol && <span className="block font-normal text-teal-600">{hol.name}</span>}</th>;
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {employees.map((e) => {
                    const usual = e.shift ?? defShift;
                    return (
                      <tr key={e.id}>
                        <td className="px-2 py-1.5"><Link href={`/hr/employees/${e.id}?tab=policies`} className="font-medium hover:underline">{e.fullName}</Link><span className="block text-xs text-muted">{usual ? short(usual) : "no shift"}</span></td>
                        {days.map((d) => {
                          const ymd = format(d, "yyyy-MM-dd");
                          const r = roster.find((x) => x.employeeId === e.id && isSameDay(x.date, d));
                          const value = r ? (r.off ? "off" : r.shiftId ?? "") : "";
                          const usualOff = usual ? !isWorkDay(usual, d) : false;
                          return (
                            <td key={ymd} className="px-1 py-1.5">
                              <input type="hidden" name={`was:${e.id}:${ymd}`} value={value} />
                              <select name={`c:${e.id}:${ymd}`} defaultValue={value} disabled={!canEdit} aria-label={`${e.fullName} ${format(d, "EEE d MMM")}`}
                                className={cn("input h-8 w-full px-1.5 text-xs", value === "off" ? "bg-slate-500/10" : value ? "bg-sky-500/10" : usualOff && "text-muted")}>
                                <option value="">{usualOff ? "Usual (off)" : "Usual"}</option>
                                <option value="off">Day off</option>
                                {shifts.map((s) => <option key={s.id} value={s.id}>{short(s)}</option>)}
                              </select>
                              {r?.note === "Approved shift adjustment" && <span className="block text-center text-[10px] text-sky-600">request</span>}
                              {r && !r.shiftId && !r.off && r.start && <span className="block text-center text-[10px] text-sky-600">{r.start}–{r.end}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {canEdit && <div className="mt-4"><SubmitButton>Save schedule</SubmitButton></div>}
          </ActionForm>
        )}
      </Card>
    </>
  );
}
