import Link from "@/components/link";
import { addDays, format, parse, startOfDay, subDays } from "date-fns";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Drawer, Field } from "@/components/ui";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { attendanceEmployeeWhere } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { hrefWith } from "@/components/crm/bits";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteAttendanceLog, deletePunch, editPunch } from "../actions";

export const metadata = { title: "Attendance logs" };

const LIMIT = 300;
const SOURCES = [["device", "Machine"], ["web", "Web check-in"], ["manual", "Manual / correction"], ["hr_edit", "Edited by HR"]] as const;
const KINDS = [["checkin", "Check-in", "green"], ["import", "Machine import", "navy"], ["hr_edit", "HR edit", "amber"], ["correction", "Correction", "gold"], ["delete", "Deleted", "red"]] as const;
type SP = { editPunch?: string; tab?: string; from?: string; to?: string; employee?: string; source?: string; kind?: string };

const day = (v: string | undefined, fallback: Date) => {
  const d = v ? parse(v, "yyyy-MM-dd", new Date()) : fallback;
  return Number.isNaN(d.getTime()) ? fallback : startOfDay(d);
};

/** Every punch (machine, web, manual) and every change to attendance. Read-only; only a Super Admin can delete. */
export default async function AttendanceLogsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.attendance");
  const sp = await searchParams;
  const tab = sp.tab === "changes" ? "changes" : "machine";
  const to = day(sp.to, startOfDay(new Date()));
  const from = day(sp.from, subDays(to, 6));
  const range = { gte: from, lt: addDays(to, 1) };
  const keep = { tab: sp.tab, from: sp.from, to: sp.to, employee: sp.employee, source: sp.source, kind: sp.kind };

  const scope = (await attendanceEmployeeWhere(user))!;
  const employees = await db.employee.findMany({ where: scope, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
  const ids = sp.employee && employees.some((e) => e.id === sp.employee) ? [sp.employee] : employees.map((e) => e.id);
  const companyWide = scopeFor(user, "hr.attendance") === "all";

  const punchWhere: Prisma.AttendancePunchWhereInput = { employeeId: { in: ids }, at: range, ...(sp.source && { source: sp.source }) };
  const logWhere: Prisma.AttendanceLogWhereInput = {
    createdAt: range,
    ...(sp.kind && { kind: sp.kind }),
    // Import summaries cover everyone, so only company-wide HR sees them (unless filtered to one person).
    OR: [{ employeeId: { in: ids } }, ...(companyWide && !sp.employee ? [{ employeeId: null }] : [])],
  };
  const [punches, punchCount, logs, logCount] = await Promise.all([
    tab === "machine" ? db.attendancePunch.findMany({ where: punchWhere, include: { employee: { select: { fullName: true } } }, orderBy: { at: "desc" }, take: LIMIT }) : [],
    db.attendancePunch.count({ where: punchWhere }),
    tab === "changes" ? db.attendanceLog.findMany({ where: logWhere, include: { employee: { select: { fullName: true } } }, orderBy: { createdAt: "desc" }, take: LIMIT }) : [],
    db.attendanceLog.count({ where: logWhere }),
  ]);
  const canEdit = can(user, "hr.attendance", "edit");
  // Super Admin only: what the machine originally recorded for punches HR edited.
  const originals = user.isSuperAdmin ? await db.punchOriginal.findMany({ where: { punchId: { in: punches.filter((p) => p.source === "hr_edit").map((p) => p.id) } }, orderBy: { editedAt: "asc" } }) : [];
  const editing = sp.editPunch ? await db.attendancePunch.findUnique({ where: { id: sp.editPunch }, include: { employee: { select: { fullName: true } } } }) : null;
  const adders = new Map((await db.user.findMany({ where: { id: { in: [...new Set(punches.map((p) => p.createdById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const tabLink = (t: "machine" | "changes", label: string, n: number) => (
    <Link href={hrefWith("/hr/attendance/logs", { ...keep, tab: t === "machine" ? undefined : t, source: undefined, kind: undefined }, {})}
      className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
      {label} <span className="rounded-full bg-black/5 px-1.5 text-xs tabular-nums">{n}</span>
    </Link>
  );

  return (
    <>
      <PageHeader title="Attendance logs" description="Every machine punch and web check-in, and every change to attendance: who did it, when, and what it was before. Entries can't be edited; only a Super Admin can delete one, and that is recorded too." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-black/5 p-0.5">
          {tabLink("machine", "Machine & check-ins", punchCount)}
          {tabLink("changes", "Change log", logCount)}
        </div>
        <AutoFilterForm className="flex flex-wrap items-center gap-2">
          {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
          <input type="date" name="from" defaultValue={format(from, "yyyy-MM-dd")} className="input h-9 w-40" aria-label="From" />
          <input type="date" name="to" defaultValue={format(to, "yyyy-MM-dd")} className="input h-9 w-40" aria-label="To" />
          <select name="employee" defaultValue={sp.employee ?? ""} className="input h-9 w-44" aria-label="Employee">
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>
          {tab === "machine" ? (
            <select name="source" defaultValue={sp.source ?? ""} className="input h-9 w-44" aria-label="Source">
              <option value="">All sources</option>
              {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ) : (
            <select name="kind" defaultValue={sp.kind ?? ""} className="input h-9 w-44" aria-label="Type of change">
              <option value="">All changes</option>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
        </AutoFilterForm>
      </div>

      <Card className="overflow-hidden">
        {tab === "machine" ? (
          punches.length === 0 ? <EmptyState title="No punches in this period" /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line bg-canvas/60">
                  <tr>{["Employee", "Punch time", "Source", "Location", "Added by", "Recorded", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {punches.map((p) => (
                    <tr key={p.id} className="hover:bg-canvas/60">
                      <td className="td font-medium">{p.employee.fullName}</td>
                      <td className="td whitespace-nowrap tabular-nums">
                        {format(p.at, "EEE d MMM yyyy, h:mm a")}
                        {user.isSuperAdmin && originals.filter((o) => o.punchId === p.id).slice(0, 1).map((o) => <span key={o.id} className="block text-[11px] text-muted" title={o.note ?? undefined}>machine: {format(o.at, "h:mm a, d MMM")}</span>)}
                      </td>
                      <td className="td"><Badge tone={p.source === "device" ? "navy" : p.source === "web" ? "green" : "amber"}>{SOURCES.find(([v]) => v === p.source)?.[1] ?? p.source}</Badge></td>
                      <td className="td text-sm">
                        {p.source === "web" ? (
                          <span className={cn("inline-flex items-center gap-1", p.outside && "text-red-600")}>
                            <MapPin className="size-3.5" />{p.distanceM != null ? `${p.distanceM} m from office` : p.lat != null ? "Located" : "No location"}{p.outside && " · outside"}
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="td text-sm">{p.createdById ? adders.get(p.createdById) ?? "—" : "—"}</td>
                      <td className="td whitespace-nowrap text-xs text-muted">{format(p.createdAt, "d MMM, h:mm a")}</td>
                      <td className="td text-right">
                        <span className="inline-flex items-center gap-1">
                        {canEdit && <Link href={hrefWith("/hr/attendance/logs", keep, { editPunch: p.id })} scroll={false} title="Edit time" aria-label="Edit punch time" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-ink"><Pencil className="size-4" /></Link>}
                        {user.isSuperAdmin && (
                          <form action={deletePunch}>
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmButton message={`Delete ${p.employee.fullName}'s punch at ${format(p.at, "h:mm a, d MMM")}? It stays in the change log.`} title="Delete punch (Super Admin)" className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="size-4" />
                            </ConfirmButton>
                          </form>
                        )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : logs.length === 0 ? <EmptyState title="No changes in this period" /> : (
          <ul className="divide-y divide-line">
            {logs.map((l) => {
              const kind = KINDS.find(([v]) => v === l.kind);
              return (
                <li key={l.id} className="flex gap-3 px-4 py-3 text-sm">
                  <div className="w-36 shrink-0 text-xs text-muted">
                    <p className="tabular-nums">{format(l.createdAt, "d MMM yyyy, h:mm a")}</p>
                    <p className="mt-1"><Badge tone={kind?.[2] ?? "neutral"}>{kind?.[1] ?? l.kind}</Badge></p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p><b className="font-medium">{l.employee?.fullName ?? "All employees"}</b>{l.employeeId && <span className="text-muted"> · {format(l.date, "EEE d MMM")}</span>}</p>
                    <p className="text-ink/85">{l.summary}</p>
                    {(l.before || l.after) && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted hover:text-ink">Before / after</summary>
                        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {l.before && <pre className="whitespace-pre-wrap rounded-md bg-red-500/5 p-2 font-sans">{`Before\n${l.before}`}</pre>}
                          {l.after && <pre className="whitespace-pre-wrap rounded-md bg-emerald-500/5 p-2 font-sans">{`After\n${l.after}`}</pre>}
                        </div>
                      </details>
                    )}
                    <p className="mt-0.5 text-xs text-muted">By {l.byName ?? "—"}</p>
                  </div>
                  {user.isSuperAdmin && (
                    <form action={deleteAttendanceLog}>
                      <input type="hidden" name="id" value={l.id} />
                      <ConfirmButton message="Delete this log entry? The deletion is recorded in the audit log." title="Delete entry (Super Admin)" className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="size-4" />
                      </ConfirmButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {(tab === "machine" ? punchCount : logCount) > LIMIT && <p className="border-t border-line px-4 py-3 text-xs text-muted">Showing the latest {LIMIT}. Narrow the dates or pick an employee to see the rest.</p>}
      </Card>
      {editing && canEdit && (
        <Drawer title={`Edit punch · ${editing.employee.fullName}`} closeHref={hrefWith("/hr/attendance/logs", keep, {})} width="max-w-md">
          <p className="mb-4 text-sm text-muted">Now: <b className="text-ink">{format(editing.at, "EEE d MMM yyyy, h:mm a")}</b>. The machine&apos;s original record is kept safely and never deleted; attendance uses the corrected time.</p>
          <ActionForm action={editPunch} className="space-y-4">
            <input type="hidden" name="id" value={editing.id} />
            <Field label="Corrected date & time"><input name="at" type="datetime-local" required defaultValue={format(editing.at, "yyyy-MM-dd'T'HH:mm")} className="input" /></Field>
            <Field label="Why"><textarea name="note" rows={3} required className="input" placeholder="e.g. Machine was 1 hour fast that morning" /></Field>
            <SubmitButton>Save corrected time</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
