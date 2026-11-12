import Link from "@/components/link";
import type { Prisma } from "@prisma/client";
import { differenceInCalendarDays, format } from "date-fns";
import { ListChecks, MessageSquareQuote, Search, Trash2, UserMinus } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { exitReasons, reasonOf } from "@/lib/exit-reasons";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { saveExitReason } from "./actions";

export const metadata = { title: "End of employment" };

const EXIT_LABEL: Record<string, string> = { resigned: "Resigned", terminated: "Terminated", other: "Other" };
type Tab = "all" | "pending" | "completed" | "reasons";

/** End of employment: everyone leaving (Pending = serving notice) or gone (Completed), and the reasons list. */
export default async function ExitsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requirePermission("hr.employees");
  const sp = await searchParams;
  const tab: Tab = (["pending", "completed", "reasons"] as const).find((t) => t === sp.tab) ?? (sp.tab === "left" ? "completed" : "all");
  const scope = (await employeeWhere(user))!;
  const q = sp.q?.trim();
  const leaving: Prisma.EmployeeWhereInput = { ...scope, OR: [{ status: "notice" }, { status: "left" }] };
  const where: Prisma.EmployeeWhereInput = {
    ...leaving,
    ...(tab === "pending" && { status: "notice", OR: undefined }),
    ...(tab === "completed" && { status: "left", OR: undefined }),
    ...(q && { AND: [{ OR: [{ fullName: { contains: q } }, { code: { contains: q } }] }] }),
  };
  const [people, pending, completed, reasons, reasonRows] = await Promise.all([
    tab === "reasons" ? [] : db.employee.findMany({
      where,
      include: { designation: { select: { name: true } }, department: { select: { name: true } }, branch: { select: { name: true } }, checklist: { where: { kind: "offboarding" }, select: { doneAt: true } } },
      orderBy: [{ status: "asc" }, { lastWorkingDay: "desc" }], take: 300,
    }),
    db.employee.count({ where: { ...scope, status: "notice" } }),
    db.employee.count({ where: { ...scope, status: "left" } }),
    exitReasons(),
    db.employee.findMany({ where: leaving, select: { exitReason: true } }),
  ]);
  const today = new Date();
  const canEdit = can(user, "hr.employees", "edit");
  const used = (r: string) => reasonRows.filter((x) => reasonOf(x.exitReason).toLowerCase() === r.toLowerCase()).length;
  const tabs = [["all", "All", pending + completed], ["pending", "Pending", pending], ["completed", "Completed", completed], ["reasons", "Reasons", reasons.length]] as const;

  return (
    <>
      <PageHeader title="End of employment" description="Everyone resigning, terminated or gone: notice, last day, exit checklist and reason. Record an exit from the employee's page (Actions → Resign / exit)." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-black/5 p-1">
          {tabs.map(([t, label, n]) => (
            <Link key={t} href={t === "all" ? "/hr/exits" : `/hr/exits?tab=${t}`} className={cn("flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
              {label} <span className={cn("rounded-md px-1.5 text-xs tabular-nums", t === "pending" && n ? "bg-amber-100 text-amber-800" : t === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-black/5")}>{n}</span>
            </Link>
          ))}
        </div>
        {tab !== "reasons" && (
          <AutoFilterForm className="ml-auto">
            {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
            <label className="relative block w-60"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input name="q" defaultValue={q} placeholder="Search name or code" aria-label="Search" className="input pl-9" /></label>
          </AutoFilterForm>
        )}
        <Link href="/hr/exits/interviews" className="flex items-center gap-1.5 text-sm font-medium text-navy-900 hover:underline"><MessageSquareQuote className="size-4" /> Exit interviews</Link>
      </div>

      {tab === "reasons" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Reason</th><th className="px-4 py-2.5">Used</th>{canEdit && <th className="w-10" />}</tr></thead>
              <tbody className="divide-y divide-line">
                {reasons.map((r) => {
                  const n = used(r);
                  return (
                    <tr key={r} className="hover:bg-canvas/60">
                      <td className="px-4 py-3 font-medium">{r}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/5"><div className="h-full bg-navy-900/60" style={{ width: `${Math.min(100, (n / Math.max(1, reasonRows.length)) * 100)}%` }} /></div><span className="tabular-nums text-muted">{n}</span></div></td>
                      {canEdit && <td className="px-2"><ActionForm action={saveExitReason}><input type="hidden" name="op" value="remove" /><input type="hidden" name="old" value={r} /><button aria-label={`Remove ${r}`} title="Remove" className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></ActionForm></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          {canEdit && (
            <Card className="h-fit p-4">
              <p className="mb-1 font-medium">Add a reason</p>
              <p className="mb-3 text-xs text-muted">These show in the Reason list when recording an exit.</p>
              <ActionForm action={saveExitReason} className="space-y-3"><input name="name" required placeholder="e.g. Higher studies" className="input" /><SubmitButton>Add reason</SubmitButton></ActionForm>
            </Card>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden">
          {people.length === 0 ? <EmptyState title={q ? "Nothing matches" : tab === "pending" ? "No one is serving notice" : "No exits yet"} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>{["Employee", "Branch", "Department", "Designation", "Type", "Notice given", "Last day", "Checklist", "Reason", "Status"].map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {people.map((e) => {
                    const done = e.checklist.filter((c) => c.doneAt).length;
                    const left = e.status === "left";
                    const daysLeft = e.lastWorkingDay ? differenceInCalendarDays(e.lastWorkingDay, today) : null;
                    return (
                      <tr key={e.id} className="align-top hover:bg-canvas/60">
                        <td className="px-4 py-3">
                          <Link href={`/hr/employees/${e.id}?tab=checklist`} className="flex items-center gap-3">
                            <PersonAvatar name={e.fullName} photo={e.photo} className="size-9" />
                            <span><span className="block whitespace-nowrap font-medium hover:underline">{e.fullName}</span><span className="block text-xs text-muted">{e.code}</span></span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted">{e.branch?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted">{e.department?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted">{e.designation?.name ?? "—"}</td>
                        <td className="px-4 py-3"><Badge tone={e.exitType === "terminated" ? "red" : "neutral"}>{EXIT_LABEL[e.exitType ?? ""] ?? "—"}</Badge></td>
                        <td className="whitespace-nowrap px-4 py-3">{e.noticeDate ? format(e.noticeDate, "d MMM yyyy") : "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {e.lastWorkingDay ? format(e.lastWorkingDay, "d MMM yyyy") : e.leftAt ? format(e.leftAt, "d MMM yyyy") : "—"}
                          {!left && daysLeft != null && <span className={cn("block text-xs", daysLeft < 0 ? "text-red-600" : "text-muted")}>{daysLeft < 0 ? `${-daysLeft} day(s) overdue` : daysLeft === 0 ? "today" : `in ${daysLeft} day(s)`}</span>}
                        </td>
                        <td className="px-4 py-3">
                          {e.checklist.length ? (
                            <span className="flex items-center gap-2"><ListChecks className="size-3.5 text-muted" /><span className="h-1.5 w-14 overflow-hidden rounded-full bg-black/[0.07]"><span className="block h-full bg-emerald-500" style={{ width: `${(done / e.checklist.length) * 100}%` }} /></span><span className="tabular-nums text-muted">{done}/{e.checklist.length}</span></span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td className="max-w-52 px-4 py-3 text-muted" title={e.exitReason ?? undefined}><span className="line-clamp-2">{e.exitReason ?? "—"}</span></td>
                        <td className="px-4 py-3"><Badge tone={left ? "green" : "amber"}>{left ? "Completed" : "Pending"}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {tab !== "reasons" && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><UserMinus className="size-3.5" /> Pending = serving notice. Completed = has left (their login is switched off).</p>}
    </>
  );
}
