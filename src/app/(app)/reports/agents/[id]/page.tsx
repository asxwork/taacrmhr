import Link from "@/components/link";
import { ListLink } from "@/components/list-memory";
import { notFound, redirect } from "next/navigation";
import { eachDayOfInterval, endOfDay, format, isSameDay, min } from "date-fns";
import { ArrowLeft, CalendarCheck, CircleDot, MapPin, MessageSquare, Phone, StickyNote, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { color as stageColor } from "@/lib/crm-shared";
import { PERIODS, resolvePeriod } from "@/lib/reports";
import { agentPerformance, followUpLists } from "@/lib/agent-reports";
import { cn, fmtDateTime } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { ColumnChart } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { FollowUpLists } from "@/components/crm/follow-up-lists";
import { fieldAccess } from "@/lib/field-rules";

export const metadata = { title: "Agent detail" };
const ICON: Record<string, React.ComponentType<{ className?: string }>> = { note: StickyNote, call: Phone, meeting: Users, visit: MapPin, task: CalendarCheck, email: MessageSquare, system: CircleDot };

/** Super Admin: one agent's numbers, daily calls, the leads behind every problem, and their recent activity. */
export default async function AgentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const agent = await db.user.findUnique({ where: { id }, include: { branch: true } });
  if (!agent) notFound();
  const { from, to } = resolvePeriod(sp.period, sp.from, sp.to);

  const [row, lists, calls, recent] = await Promise.all([
    agentPerformance(from, to).then((rows) => rows.find((r) => r.id === id)),
    followUpLists({ ownerId: id }, from),
    db.activity.findMany({ where: { ownerId: id, type: "call", doneAt: { gte: from, lte: to } }, select: { doneAt: true } }),
    db.activity.findMany({ where: { OR: [{ ownerId: id }, { createdById: id }], type: { not: "system" } }, include: { lead: { select: { id: true, name: true } }, deal: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  // Their leads by stage: all they own now, the ones that came in during the period, and leads they moved into each stage.
  const [stages, nowBy, newBy, moves] = await Promise.all([
    db.leadStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
    db.lead.groupBy({ by: ["statusId"], where: { ownerId: id }, _count: true }),
    db.lead.groupBy({ by: ["statusId"], where: { ownerId: id, createdAt: { gte: from, lte: to } }, _count: true }),
    db.activity.findMany({ where: { type: "system", createdById: id, subject: { startsWith: "Status:" }, createdAt: { gte: from, lte: to } }, select: { subject: true } }),
  ]);
  const movedTo = new Map<string, number>();
  for (const m of moves) { const to = m.subject.split("→").pop()?.trim(); if (to) movedTo.set(to, (movedTo.get(to) ?? 0) + 1); }
  const stageRows = stages.map((st) => ({ ...st, now: nowBy.find((r) => r.statusId === st.id)?._count ?? 0, came: newBy.find((r) => r.statusId === st.id)?._count ?? 0, moved: movedTo.get(st.name) ?? 0 }));
  const maxNow = Math.max(1, ...stageRows.map((r) => r.now));
  const created = `&created=custom&cfrom=${format(from, "yyyy-MM-dd")}&cto=${format(to, "yyyy-MM-dd")}`;
  const days = eachDayOfInterval({ start: from, end: min([to, endOfDay(new Date())]) });
  const perDay = days.map((d) => ({ label: format(d, "EEE d MMM"), short: format(d, days.length > 14 ? "d" : "EEE d"), value: calls.filter((c) => isSameDay(c.doneAt!, d)).length }));

  const tiles: [string, string | number, boolean][] = row ? [
    ["Open leads", row.open, false],
    ["Never contacted", row.neverContacted, row.neverContacted > 0],
    ["Calls in period", `${row.calls} (${row.callsWithNotes} with notes)`, row.calls === 0 && row.open > 0],
    ["Follow-ups on time", row.followUpsDue ? `${row.onTime} of ${row.followUpsDue}` : "—", row.followUpsDue > 0 && row.onTime / row.followUpsDue < 0.8],
    ["Overdue now", row.overdueNow, row.overdueNow > 0],
    ["Closed without contact", row.closedNoContact, row.closedNoContact > 0],
  ] : [];

  return (
    <>
      <ListLink href={`/reports/agents${sp.period ? `?period=${sp.period}` : ""}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Agent performance</ListLink>
      <PageHeader title={agent.name} eyebrow="Agent detail" description={[agent.title, agent.branch?.name, `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`].filter(Boolean).join(" · ")} />

      <AutoFilterForm className="mb-6 flex flex-wrap items-end gap-2">
        <select name="period" defaultValue={sp.period ?? "month"} className="input w-40">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {sp.period === "custom" && (<>
        <input type="date" name="from" defaultValue={sp.period === "custom" ? sp.from : ""} className="input w-40" aria-label="From (custom)" />
        <input type="date" name="to" defaultValue={sp.period === "custom" ? sp.to : ""} className="input w-40" aria-label="To (custom)" />
        </>)}
      </AutoFilterForm>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, value, bad]) => (
          <Card key={label} className={cn("p-4", bad && "border-red-200")}>
            <p className="text-xs text-muted">{label}</p>
            <p className={cn("mt-1 text-lg font-semibold", bad && "text-red-600")}>{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-medium">Calls logged per day</h2>
            <ColumnChart data={perDay} unit="calls" />
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b border-line px-5 py-3"><h2 className="text-sm font-medium">Leads by stage</h2><p className="text-xs text-muted">Click a number to open those leads.</p></div>
            <table className="w-full text-sm">
              <thead className="bg-canvas/60 text-left text-xs text-muted"><tr><th className="px-5 py-2 font-medium">Stage</th><th className="px-3 py-2 text-right font-medium">Their leads now</th><th className="px-3 py-2 text-right font-medium" title="Leads that came in during the period, by the stage they're in now">Came in this period</th><th className="px-5 py-2 text-right font-medium" title="Times they moved a lead into this stage during the period">Moved here in period</th></tr></thead>
              <tbody className="divide-y divide-line">
                {stageRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2"><span className="inline-flex items-center gap-2"><span className={`size-2.5 rounded-full ${stageColor(r.color ?? "slate").dot}`} />{r.name}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-2"><span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-canvas sm:block"><span className={`block h-full rounded-full ${stageColor(r.color ?? "slate").bar}`} style={{ width: `${(r.now / maxNow) * 100}%` }} /></span>
                      {r.now ? <ListLink href={`/crm/leads?owner=${id}&stage=${r.id}`} className="w-10 font-medium hover:underline">{r.now}</ListLink> : <span className="w-10 text-muted/50">·</span>}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.came ? <ListLink href={`/crm/leads?owner=${id}&stage=${r.id}${created}`} className="hover:underline">{r.came}</ListLink> : <span className="text-muted/50">·</span>}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{r.moved || <span className="text-muted/50">·</span>}</td>
                  </tr>
                ))}
                <tr className="bg-canvas/60 font-semibold"><td className="px-5 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{stageRows.reduce((a, r) => a + r.now, 0)}</td><td className="px-3 py-2 text-right tabular-nums">{stageRows.reduce((a, r) => a + r.came, 0)}</td><td className="px-5 py-2 text-right tabular-nums">{stageRows.reduce((a, r) => a + r.moved, 0)}</td></tr>
              </tbody>
            </table>
          </Card>
          <FollowUpLists lists={lists} showOwner={false} phoneMode={(await fieldAccess(user))["lead.phone"]} />
        </div>
        <Card className="overflow-hidden xl:sticky xl:top-6">
          <h2 className="border-b border-line px-5 py-3 text-sm font-medium">Recent activity</h2>
          {recent.length === 0 ? <p className="px-5 py-4 text-sm text-muted">Nothing logged yet.</p> : (
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
              {recent.map((a) => {
                const Icon = ICON[a.type] ?? CircleDot;
                const planned = a.dueAt && !a.doneAt;
                return (
                  <li key={a.id} className="flex gap-3 px-5 py-2.5 text-sm">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", planned ? "text-gold-600" : "text-navy-900")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.subject}</span>
                      <span className="block truncate text-xs text-muted">
                        {planned ? `Planned for ${fmtDateTime(a.dueAt)}` : fmtDateTime(a.doneAt ?? a.createdAt)}
                        {a.lead && <> · <Link href={`/crm/leads/${a.lead.id}`} className="hover:underline">{a.lead.name}</Link></>}
                        {a.deal && <> · <Link href={`/crm/deals/${a.deal.id}`} className="hover:underline">{a.deal.title}</Link></>}
                      </span>
                      {a.type === "call" && !a.dueAt && (a.body ?? "").trim().length < 10 && <span className="text-xs text-amber-700">No call notes</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
