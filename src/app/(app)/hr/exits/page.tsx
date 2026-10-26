import Link from "next/link";
import { differenceInCalendarDays, format, subMonths } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";

export const metadata = { title: "End of employment" };

const EXIT_LABEL: Record<string, string> = { resigned: "Resigned", terminated: "Terminated", other: "Other" };

/** People serving notice and recent leavers, with their exit checklist progress. Exits are recorded on the employee's page. */
export default async function ExitsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("hr.employees");
  const tab = (await searchParams).tab === "left" ? "left" : "notice";
  const scope = (await employeeWhere(user))!;
  const where = tab === "notice" ? { ...scope, status: "notice" } : { ...scope, status: "left", leftAt: { gte: subMonths(new Date(), 12) } };
  const [people, noticeCount, leftCount] = await Promise.all([
    db.employee.findMany({
      where,
      include: { designation: { select: { name: true } }, department: { select: { name: true } }, checklist: { where: { kind: "offboarding" }, select: { doneAt: true } } },
      orderBy: tab === "notice" ? { lastWorkingDay: "asc" } : { leftAt: "desc" },
    }),
    db.employee.count({ where: { ...scope, status: "notice" } }),
    db.employee.count({ where: { ...scope, status: "left", leftAt: { gte: subMonths(new Date(), 12) } } }),
  ]);
  const today = new Date();

  return (
    <>
      <PageHeader title="End of employment" description="Resignations and terminations: who is serving notice, their last day and exit checklist, and who left in the last 12 months. Record an exit from the employee's page." />
      <div className="mb-4 flex rounded-lg bg-black/5 p-0.5 sm:w-fit">
        {([["notice", `Serving notice (${noticeCount})`], ["left", `Left · last 12 months (${leftCount})`]] as const).map(([t, label]) => (
          <Link key={t} href={t === "notice" ? "/hr/exits" : "/hr/exits?tab=left"} className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{label}</Link>
        ))}
      </div>
      <Card className="overflow-hidden">
        {people.length === 0 ? <EmptyState title={tab === "notice" ? "No one is serving notice" : "No leavers in the last 12 months"} /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas/60">
                <tr>{["Employee", "Exit", "Notice given", tab === "notice" ? "Last working day" : "Left on", "Exit checklist", "Reason"].map((h) => <th key={h} className="th">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((e) => {
                  const done = e.checklist.filter((c) => c.doneAt).length;
                  const daysLeft = e.lastWorkingDay ? differenceInCalendarDays(e.lastWorkingDay, today) : null;
                  return (
                    <tr key={e.id} className="align-top hover:bg-canvas/60">
                      <td className="td">
                        <Link href={`/hr/employees/${e.id}?tab=checklist`} className="flex items-center gap-3">
                          <PersonAvatar name={e.fullName} photo={e.photo} />
                          <span><span className="block whitespace-nowrap font-medium hover:underline">{e.fullName}</span><span className="block text-xs text-muted">{[e.designation?.name, e.department?.name].filter(Boolean).join(" · ") || e.code}</span></span>
                        </Link>
                      </td>
                      <td className="td"><Badge tone={e.exitType === "terminated" ? "red" : "amber"}>{EXIT_LABEL[e.exitType ?? ""] ?? "—"}</Badge></td>
                      <td className="td whitespace-nowrap text-sm">{e.noticeDate ? format(e.noticeDate, "d MMM yyyy") : "—"}</td>
                      <td className="td whitespace-nowrap text-sm">
                        {tab === "notice"
                          ? e.lastWorkingDay ? <>{format(e.lastWorkingDay, "d MMM yyyy")}{daysLeft != null && <span className={cn("block text-xs", daysLeft < 0 ? "text-red-600" : "text-muted")}>{daysLeft < 0 ? `${-daysLeft} day(s) overdue` : daysLeft === 0 ? "today" : `in ${daysLeft} day(s)`}</span>}</> : "—"
                          : e.leftAt ? format(e.leftAt, "d MMM yyyy") : "—"}
                      </td>
                      <td className="td text-sm">
                        {e.checklist.length ? (
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-black/[0.07]"><span className="block h-full bg-emerald-500" style={{ width: `${(done / e.checklist.length) * 100}%` }} /></span>
                            <span className="tabular-nums text-muted">{done}/{e.checklist.length}</span>
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="td max-w-64 text-sm text-muted">{e.exitReason ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
