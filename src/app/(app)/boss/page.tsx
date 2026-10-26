import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, format, formatDistanceToNowStrict, startOfDay, subDays } from "date-fns";
import { CheckCircle2, CircleAlert, CircleX } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtPKR } from "@/lib/crm-shared";
import { PERIODS, crmReport, resolvePeriod } from "@/lib/reports";
import { hrReport } from "@/lib/reports-hr";
import { agentPerformance } from "@/lib/agent-reports";
import { loadAttendance } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { BarList } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Boss dashboard" };

/** The owner's one-page view of the business: deals closed, which agents are working, and today's HR picture. */
export default async function BossPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  if (!user.isBoss && !user.isSuperAdmin) redirect("/no-access");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.period, sp.from, sp.to);
  const today = startOfDay(new Date());

  const active = await db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, photo: true } });
  const [crm, hr, agents, lastActs, wonDeals, att, pending, pendingCount, leaveSoon] = await Promise.all([
    crmReport(user, { from, to }),
    hrReport(user, { from, to }),
    agentPerformance(from, to),
    db.activity.groupBy({ by: ["ownerId"], where: { ownerId: { not: null }, type: { not: "system" }, doneAt: { not: null } }, _max: { doneAt: true } }),
    db.deal.findMany({ where: { closedAt: { gte: from, lte: to }, stage: { kind: "won" } }, include: { owner: { select: { name: true } }, contact: { select: { name: true } } }, orderBy: { closedAt: "desc" }, take: 12 }),
    loadAttendance(active.map((e) => e.id), today, today),
    db.approvalRequest.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 5 }),
    db.approvalRequest.count({ where: { status: "pending" } }),
    db.leaveRequest.findMany({ where: { status: "approved", from: { lte: addDays(today, 7) }, to: { gte: today } }, include: { employee: { select: { fullName: true } }, type: { select: { name: true } } }, orderBy: { from: "asc" }, take: 8 }),
  ]);
  const lastBy = new Map(lastActs.map((a) => [a.ownerId!, a._max.doneAt]));

  // Today, per person.
  const todayStatus = active.map((e) => ({ ...e, status: att.get(e.id)?.[0]?.status ?? "upcoming" }));
  const count = (...s: string[]) => todayStatus.filter((t) => s.includes(t.status)).length;
  const absentNames = todayStatus.filter((t) => t.status === "absent").map((t) => t.fullName);
  const lateNames = todayStatus.filter((t) => t.status === "late").map((t) => t.fullName);

  // Agent verdicts: working / needs attention / not working.
  const verdict = (a: (typeof agents)[number]) => {
    const last = lastBy.get(a.id);
    if (!last || last < subDays(new Date(), 3)) return { tone: "red", label: "Not working", icon: CircleX } as const;
    if (a.overdueNow > 0 || a.neverContacted > 0) return { tone: "amber", label: "Behind", icon: CircleAlert } as const;
    return { tone: "green", label: "Working", icon: CheckCircle2 } as const;
  };
  const tone = { green: "text-emerald-700 bg-emerald-50", amber: "text-amber-700 bg-amber-50", red: "text-red-700 bg-red-50" };

  const tiles: [string, string, string?][] = [
    ["Deals closed", `${crm?.kpis.won ?? 0}`, crm ? fmtPKR(crm.kpis.wonValue) : undefined],
    ["Open pipeline", crm ? fmtPKR(crm.kpis.openValue) : "—", crm ? `${crm.kpis.openCount} open deals` : undefined],
    ["New leads", `${crm?.kpis.newLeads ?? 0}`, crm?.kpis.conversionRate != null ? `${Math.round(crm.kpis.conversionRate * 100)}% became deals` : undefined],
    ["In office today", `${count("present", "late", "half")} / ${active.length}`, `${count("absent")} absent · ${count("leave")} on leave`],
  ];

  return (
    <>
      <PageHeader title="Boss dashboard" description={`${format(from, "d MMM")} – ${format(to, "d MMM yyyy")} · the whole business on one page`} />
      <AutoFilterForm className="mb-6 flex flex-wrap items-end gap-2">
        <select name="period" defaultValue={sp.period ?? "month"} className="input w-40">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.period === "custom" ? sp.from : ""} className="input w-40" aria-label="From (custom)" />
        <input type="date" name="to" defaultValue={sp.period === "custom" ? sp.to : ""} className="input w-40" aria-label="To (custom)" />
      </AutoFilterForm>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <Card key={label} className="p-5">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </Card>
        ))}
      </div>

      <h2 className="mb-3 font-display text-xl font-semibold">Sales</h2>
      <div className="mb-8 grid items-start gap-4 xl:grid-cols-[3fr_2fr]">
        <Card className="overflow-hidden">
          <h3 className="border-b border-line px-5 py-3 text-sm font-medium">Agents — who is working</h3>
          <ul className="divide-y divide-line">
            {agents.map((a) => {
              const v = verdict(a);
              const last = lastBy.get(a.id);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Avatar name={a.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{a.name}</span>
                    <span className="block text-xs text-muted">
                      {a.open} open leads · {a.calls} calls · last activity {last ? formatDistanceToNowStrict(last, { addSuffix: true }) : "never"}
                      {a.overdueNow ? ` · ${a.overdueNow} overdue` : ""}{a.neverContacted ? ` · ${a.neverContacted} never called` : ""}
                    </span>
                  </span>
                  <span className="text-right text-xs"><span className="block font-medium">{a.converted} won</span></span>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", tone[v.tone])}><v.icon className="size-3.5" />{v.label}</span>
                </li>
              );
            })}
            {agents.length === 0 && <li className="px-5 py-4 text-sm text-muted">No agents with leads yet.</li>}
          </ul>
          {user.isSuperAdmin && <Link href="/reports/agents" className="block border-t border-line px-5 py-2.5 text-xs font-medium text-navy-900 hover:underline">Full agent performance →</Link>}
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <h3 className="border-b border-line px-5 py-3 text-sm font-medium">Deals closed</h3>
            {wonDeals.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No deals closed in this period.</p> : (
              <ul className="divide-y divide-line">
                {wonDeals.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <Link href={`/crm/deals/${d.id}`} className="block truncate font-medium hover:underline">{d.title}</Link>
                      <span className="block truncate text-xs text-muted">{[d.contact?.name, d.owner?.name, d.closedAt && format(d.closedAt, "d MMM")].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="font-medium tabular-nums">{fmtPKR(d.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-medium">Where leads come from</h3>
            <BarList rows={(crm?.bySource ?? []).map((s) => ({ name: s.name, value: s.leads, display: String(s.leads), sub: s.leads ? `${Math.round((s.converted / s.leads) * 100)}% conv.` : undefined }))} />
          </Card>
        </div>
      </div>

      <h2 className="mb-3 font-display text-xl font-semibold">People</h2>
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-medium">Today</h3>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {([["Present", count("present", "half")], ["Late", count("late")], ["Absent", count("absent")], ["On leave", count("leave")], ["No check-out", count("missing")], ["Not in yet", count("upcoming")]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-canvas px-2 py-3"><dd className="text-xl font-semibold tabular-nums">{v}</dd><dt className="text-xs text-muted">{k}</dt></div>
            ))}
          </dl>
          {absentNames.length > 0 && <p className="mt-3 text-xs"><span className="font-medium text-red-700">Absent:</span> {absentNames.join(", ")}</p>}
          {lateNames.length > 0 && <p className="mt-1 text-xs"><span className="font-medium text-amber-700">Late:</span> {lateNames.join(", ")}</p>}
          <Link href="/hr/attendance" className="mt-3 block text-xs font-medium text-navy-900 hover:underline">Attendance →</Link>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-medium">Team & payroll</h3>
          <dl className="space-y-2 text-sm">
            {hr && ([
              ["Headcount", `${hr.kpis.headcount}${hr.kpis.probation ? ` (${hr.kpis.probation} on probation)` : ""}`],
              ["Joined / left", `${hr.kpis.joiners} / ${hr.kpis.leavers}`],
              ["Attendance rate", hr.kpis.attendanceRate != null ? `${Math.round(hr.kpis.attendanceRate * 100)}%` : "—"],
              ["Leave taken", `${hr.kpis.leaveDays} day(s)`],
              ["Payroll (gross)", fmtPKR(hr.kpis.payroll)],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
          <Link href="/reports/hr" className="mt-3 block text-xs font-medium text-navy-900 hover:underline">HR report →</Link>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-medium">Waiting for approval <span className="text-muted">{pendingCount}</span></h3>
          {pending.length === 0 ? <p className="text-sm text-muted">Nothing pending.</p> : (
            <ul className="space-y-2 text-sm">{pending.map((p) => <li key={p.id} className="truncate">{p.title}<span className="block text-xs text-muted">{formatDistanceToNowStrict(p.createdAt, { addSuffix: true })}</span></li>)}</ul>
          )}
          <h3 className="mb-2 mt-5 text-sm font-medium">On leave this week</h3>
          {leaveSoon.length === 0 ? <p className="text-sm text-muted">Nobody.</p> : (
            <ul className="space-y-1.5 text-sm">{leaveSoon.map((l) => <li key={l.id}>{l.employee.fullName} <span className="text-xs text-muted">· {l.type.name} · {format(l.from, "d MMM")}{+l.to !== +l.from ? `–${format(l.to, "d MMM")}` : ""}</span></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
