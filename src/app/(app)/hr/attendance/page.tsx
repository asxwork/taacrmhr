import Link from "next/link";
import { addDays, endOfMonth, format, isSameDay, isSameMonth, parse, startOfDay, startOfMonth, subDays, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { DAY_STATUSES, attendanceEmployeeWhere, fmtMinutes, loadAttendance, summarize } from "@/lib/attendance";
import { color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { StatusPill, hrefWith } from "@/components/crm/bits";
import { PersonAvatar } from "@/components/person-avatar";
import { importDeviceFile, saveDayOverride, saveDeviceIds } from "./actions";

export const metadata = { title: "Attendance" };

type SP = { view?: string; date?: string; month?: string; branch?: string; import?: string; edit?: string };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.attendance");
  const sp = await searchParams;
  const now = new Date();
  const view = sp.view === "month" ? "month" : "day";
  const date = sp.date ? parse(sp.date, "yyyy-MM-dd", now) : startOfDay(now);
  const month = sp.month ? parse(sp.month, "yyyy-MM", now) : now;
  const isAdmin = user.isSuperAdmin || scopeFor(user, "hr.attendance", "edit") === "all";
  const canEdit = can(user, "hr.attendance", "edit");
  const keep = { view: sp.view, date: sp.date, month: sp.month, branch: sp.branch };

  const scope = (await attendanceEmployeeWhere(user))!;
  const [employees, branches] = await Promise.all([
    db.employee.findMany({
      where: { ...scope, status: { not: "left" }, ...(sp.branch && { branchId: sp.branch }) },
      include: { designation: true, branch: true }, orderBy: { fullName: "asc" },
    }),
    scopeFor(user, "hr.attendance") === "all" ? db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const ids = employees.map((e) => e.id);
  const from = view === "day" ? date : startOfMonth(month);
  const to = view === "day" ? date : isSameMonth(month, now) ? now : endOfMonth(month);
  const att = ids.length ? await loadAttendance(ids, from, to) : new Map();

  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg bg-black/5 p-0.5">
        {([["day", "Daily"], ["month", "Monthly register"]] as const).map(([v, label]) => (
          <Link key={v} href={hrefWith("/hr/attendance", { branch: sp.branch }, { view: v === "day" ? undefined : v })} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", view === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{label}</Link>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {view === "day" ? (
          <>
            <Link href={hrefWith("/hr/attendance", keep, { date: format(subDays(date, 1), "yyyy-MM-dd") })} className="rounded-md p-2 text-muted hover:bg-canvas" aria-label="Previous day"><ChevronLeft className="size-4" /></Link>
            <span className="min-w-36 text-center text-sm font-medium">{format(date, "EEE d MMM yyyy")}</span>
            {date < startOfDay(now) && <Link href={hrefWith("/hr/attendance", keep, { date: format(addDays(date, 1), "yyyy-MM-dd") })} className="rounded-md p-2 text-muted hover:bg-canvas" aria-label="Next day"><ChevronRight className="size-4" /></Link>}
          </>
        ) : (
          <>
            <Link href={hrefWith("/hr/attendance", keep, { month: format(subMonths(month, 1), "yyyy-MM") })} className="rounded-md p-2 text-muted hover:bg-canvas" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
            <span className="min-w-28 text-center text-sm font-medium">{format(month, "MMMM yyyy")}</span>
            {!isSameMonth(month, now) && <Link href={hrefWith("/hr/attendance", keep, { month: format(addMonths(month, 1), "yyyy-MM") })} className="rounded-md p-2 text-muted hover:bg-canvas" aria-label="Next month"><ChevronRight className="size-4" /></Link>}
          </>
        )}
      </div>
      {branches.length > 1 && (
        <form className="flex gap-2">
          {sp.view && <input type="hidden" name="view" value={sp.view} />}
          {sp.date && <input type="hidden" name="date" value={sp.date} />}
          {sp.month && <input type="hidden" name="month" value={sp.month} />}
          <select name="branch" defaultValue={sp.branch ?? ""} className="input w-40" aria-label="Branch">
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="h-10 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-canvas">Apply</button>
        </form>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (!employees.length) body = <Card><EmptyState title="No employees in your view" /></Card>;
  else if (view === "day") {
    const rows = employees.map((e) => ({ e, d: (att.get(e.id) ?? [])[0] }));
    const s = summarize(rows.map((r) => r.d).filter(Boolean));
    body = (
      <>
        <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {([["Present", s.present, "green"], ["Late", s.late, "amber"], ["Half day", s.half, "violet"], ["Absent", s.absent, "red"], ["On leave", s.leave, "blue"], ["No check-out", s.missing, "amber"]] as const).map(([label, v, c]) => (
            <Card key={label} className="p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted"><span className={cn("size-2 rounded-full", color(c).dot)} />{label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{v}</p>
            </Card>
          ))}
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line">
                <tr>{["Employee", "Status", "In", "Out", "Worked", "Late", "Overtime"].map((h) => <th key={h} className="th">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ e, d }) => {
                  const st = d ? DAY_STATUSES[d.status as keyof typeof DAY_STATUSES] : null;
                  return (
                    <tr key={e.id} className="hover:bg-canvas/60">
                      <td className="td">
                        <Link href={canEdit ? hrefWith("/hr/attendance", keep, { edit: e.id }) : `/hr/employees/${e.id}`} scroll={false} className="flex items-center gap-3">
                          <PersonAvatar name={e.fullName} photo={e.photo} />
                          <span><span className="block whitespace-nowrap font-medium">{e.fullName}</span><span className="block text-xs text-muted">{e.designation?.name ?? e.code}</span></span>
                        </Link>
                      </td>
                      <td className="td">{st ? <StatusPill name={st.label} colorName={st.color} /> : <span className="text-muted">Not joined</span>}{d?.note && <span className="block text-xs text-muted">{d.note}</span>}</td>
                      <td className="td tabular-nums">{d?.checkIn ? format(d.checkIn, "h:mm a") : "—"}</td>
                      <td className="td tabular-nums">{d?.checkOut ? format(d.checkOut, "h:mm a") : "—"}</td>
                      <td className="td tabular-nums">{fmtMinutes(d?.workedMin ?? 0)}</td>
                      <td className={cn("td tabular-nums", d?.lateMin && "text-amber-700")}>{d?.lateMin ? `${d.lateMin}m` : "—"}</td>
                      <td className="td tabular-nums">{fmtMinutes(d?.overtimeMin ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </>
    );
  } else {
    const days = Array.from({ length: endOfMonth(month).getDate() }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));
    body = (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-line">
                <th className="th sticky left-0 z-[2] min-w-44">Employee</th>
                {days.map((d) => <th key={d.getDate()} className={cn("th px-1 text-center", (d.getDay() === 0) && "text-muted/60")}>{d.getDate()}<span className="block text-[10px] font-normal normal-case">{format(d, "EEEEE")}</span></th>)}
                {["P", "L", "A", "LV", "Hours"].map((h) => <th key={h} className="th px-2 text-center">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {employees.map((e) => {
                const list = att.get(e.id) ?? [];
                const s = summarize(list);
                return (
                  <tr key={e.id}>
                    <td className="sticky left-0 z-[1] whitespace-nowrap bg-surface px-4 py-2 text-sm font-medium"><Link href={`/hr/employees/${e.id}`} className="hover:underline">{e.fullName}</Link></td>
                    {days.map((d) => {
                      const r = list.find((x: { date: Date }) => isSameDay(x.date, d));
                      const st = r ? DAY_STATUSES[r.status as keyof typeof DAY_STATUSES] : null;
                      return (
                        <td key={d.getDate()} className="px-0.5 py-1.5 text-center">
                          {st && st.short ? (
                            canEdit && d <= now ? (
                              <Link href={hrefWith("/hr/attendance", { branch: sp.branch }, { view: undefined, date: format(d, "yyyy-MM-dd"), edit: e.id })} title={`${format(d, "d MMM")}: ${st.label}${r!.checkIn ? ` ${format(r!.checkIn, "HH:mm")}` : ""}${r!.checkOut ? `–${format(r!.checkOut, "HH:mm")}` : ""}`} className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded px-0.5 text-[10px] font-semibold", color(st.color).pill)}>{st.short}</Link>
                            ) : (
                              <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded px-0.5 text-[10px] font-semibold", color(st.color).pill)}>{st.short}</span>
                            )
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="px-2 text-center font-medium tabular-nums">{s.present}</td>
                    <td className="px-2 text-center tabular-nums text-amber-700">{s.late}</td>
                    <td className="px-2 text-center tabular-nums text-red-600">{s.absent}</td>
                    <td className="px-2 text-center tabular-nums">{s.leave}</td>
                    <td className="whitespace-nowrap px-2 text-center tabular-nums">{Math.round(s.workedMin / 60)}h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs text-muted">
          {Object.values(DAY_STATUSES).filter((s) => s.short && s.short !== "–").map((s) => <span key={s.short}><b className="font-semibold text-ink">{s.short}</b> {s.label}</span>)}
        </p>
      </Card>
    );
  }

  // Edit drawer for one employee/day
  const editEmp = sp.edit && canEdit ? employees.find((e) => e.id === sp.edit) : null;
  const editDay = editEmp ? (await loadAttendance([editEmp.id], date, date)).get(editEmp.id)?.[0] : null;
  const punches = editEmp ? await db.attendancePunch.findMany({ where: { employeeId: editEmp.id, at: { gte: date, lt: addDays(date, 1) } }, orderBy: { at: "asc" } }) : [];
  const closeHref = hrefWith("/hr/attendance", keep, {});

  const importData = sp.import && isAdmin ? await db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true, deviceUserId: true }, orderBy: { fullName: "asc" } }) : null;

  return (
    <>
      <PageHeader
        title="Attendance"
        description="From web check-ins, ZKTeco imports and approved corrections."
        actions={isAdmin && <LinkButton href={hrefWith("/hr/attendance", keep, { import: "1" })} variant="secondary" scroll={false}><Upload className="size-4" /> Import from device</LinkButton>}
      />
      {toolbar}
      {body}

      {editEmp && (
        <Drawer title={`${editEmp.fullName} · ${format(date, "EEE d MMM")}`} closeHref={closeHref} width="max-w-md">
          {editDay && <p className="mb-3 text-sm">Now: <StatusPill name={DAY_STATUSES[editDay.status].label} colorName={DAY_STATUSES[editDay.status].color} /> {editDay.overridden && <span className="text-xs text-muted">(set by HR)</span>}</p>}
          <ul className="mb-4 space-y-1 text-sm">
            {punches.length === 0 ? <li className="text-muted">No punches.</li> : punches.map((p) => (
              <li key={p.id} className="flex justify-between"><span className="tabular-nums">{format(p.at, "h:mm a")}</span><span className="text-xs text-muted">{p.source}{p.outside ? " · outside office" : ""}</span></li>
            ))}
          </ul>
          <ActionForm action={saveDayOverride} className="space-y-4">
            <input type="hidden" name="employeeId" value={editEmp.id} />
            <input type="hidden" name="date" value={format(date, "yyyy-MM-dd")} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Add check-in"><input name="addIn" type="time" className="input" /></Field>
              <Field label="Add check-out"><input name="addOut" type="time" className="input" /></Field>
            </div>
            <Field label="Status" hint="“Automatic” works it out from punches, leave and holidays.">
              <select name="status" defaultValue={editDay?.overridden ? editDay.status : "auto"} className="input">
                <option value="auto">Automatic</option>
                {(["present", "half", "absent", "leave", "holiday", "weekend"] as const).map((s) => <option key={s} value={s}>{DAY_STATUSES[s].label}</option>)}
              </select>
            </Field>
            <Field label="Note"><input name="note" defaultValue={editDay?.note ?? ""} className="input" placeholder="e.g. Official duty at client site" /></Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Drawer>
      )}

      {importData && (
        <Drawer title="Import from ZKTeco K40" closeHref={closeHref} width="max-w-xl">
          <div className="space-y-6">
            <section>
              <p className="mb-3 text-sm text-muted">
                On the device: <b className="text-ink">Menu → USB Manager → Download → Attendance</b> — then upload the <code className="rounded bg-canvas px-1">attlog.dat</code> file here. CSV/TXT exports from ZKTime also work. Already-imported punches are skipped, so you can upload the full log every time.
              </p>
              <ActionForm action={importDeviceFile} className="space-y-3">
                <input name="file" type="file" required accept=".dat,.txt,.csv,text/plain,text/csv" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
                <SubmitButton pendingText="Importing…">Import punches</SubmitButton>
              </ActionForm>
            </section>
            <section>
              <h3 className="mb-1 text-sm font-medium">Device IDs</h3>
              <p className="mb-3 text-xs text-muted">The number each person is enrolled as on the device (User ID / AC-No).</p>
              <ActionForm action={saveDeviceIds} className="space-y-2">
                {importData.map((e) => (
                  <label key={e.id} className="flex items-center gap-3 text-sm">
                    <span className="flex-1">{e.fullName} <span className="text-xs text-muted">{e.code}</span></span>
                    <input name={`dev:${e.id}`} defaultValue={e.deviceUserId ?? ""} inputMode="numeric" className="input w-24" aria-label={`Device ID for ${e.fullName}`} />
                  </label>
                ))}
                <SubmitButton variant="secondary">Save device IDs</SubmitButton>
              </ActionForm>
            </section>
          </div>
        </Drawer>
      )}
    </>
  );
}
