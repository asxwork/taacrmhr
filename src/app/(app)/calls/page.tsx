import Link from "@/components/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { can, requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { OUTCOMES, nextTarget, outcome, queueWhere } from "@/lib/calls";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { CallCard } from "@/components/calls/call-card";
import { logCall } from "./actions";
import { agentDay, pkDay } from "@/lib/call-daily";
import { HourChart } from "@/components/calls/day-report";

export const metadata = { title: "Dialer" };

/** Calls → Dialer: the agent's next number, the campaign script, and one-click outcomes. */
export default async function DialerPage({ searchParams }: { searchParams: Promise<{ dial?: string }> }) {
  const viewer = await requirePermission("calls");
  // Calls section landing: people who don't make calls start on Callbacks; Super Admins and supervisors who have no
  // numbers of their own start on Campaigns (to upload numbers and assign them to agents). ?dial=1 opens the dialer anyway.
  if (!can(viewer, "calls", "edit")) redirect("/calls/callbacks");
  if ((viewer.isSuperAdmin || can(viewer, "calls", "assign")) && !(await searchParams).dial) {
    const mine = await db.callTarget.count({ where: { assigneeId: viewer.id } });
    if (!mine) redirect("/calls/campaigns");
  }
  const user = viewer;
  const day = pkDay();
  const [target, queued, callbacks, s, lastLog] = await Promise.all([
    nextTarget(user.id),
    db.callTarget.count({ where: queueWhere(user.id) }),
    db.callTarget.count({ where: { assigneeId: user.id, status: "callback" } }),
    agentDay(user.id, day.start, day.end),
    db.callLog.findFirst({ where: { agentId: user.id, startedAt: { gte: new Date(Date.now() - 90_000) } }, orderBy: { startedAt: "desc" }, include: { target: { select: { name: true, phone: true, leadId: true } } } }),
  ]);
  let extra: Record<string, string> = {};
  try { extra = target?.extra ? JSON.parse(target.extra) : {}; } catch {}
  const waText = (target?.campaign.waMessage ?? "").replace(/\{\{\s*name\s*\}\}/g, target?.name ?? "").replace(/\{\{\s*agent\s*\}\}/g, user.name);

  const todayCard = (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">Today so far</p>
        <Link href={`/calls/reports/daily/live?date=${day.date}`} className="text-xs font-medium hover:underline">Full report</Link>
      </div>
      <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
        {([["Avg call", s.avgSec ? `${Math.floor(s.avgSec / 60)}:${String(s.avgSec % 60).padStart(2, "0")}` : "—"], ["First", s.first ?? "—"], ["Last", s.last ?? "—"]] as const).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-canvas py-2"><dt className="text-[10px] uppercase tracking-wide text-muted">{k}</dt><dd className="text-sm font-semibold tabular-nums">{v}</dd></div>
        ))}
      </dl>
      <HourChart hours={s.hours} />
      {s.outcomes.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{s.outcomes.slice(0, 6).map((o) => <Badge key={o.label} tone="neutral">{o.label} · {o.n}</Badge>)}</div>}
      <p className="mt-3 text-[11px] text-muted">Your end-of-shift report is sent automatically when your shift ends.</p>
    </Card>
  );

  return (
    <>
      <PageHeader title="Dialer" description={`${format(new Date(), "EEEE d MMMM")} · numbers come in order: due callbacks, new numbers, then unanswered ones after a few hours.`} />
      <DrillTiles className="mb-6 lg:grid-cols-4 xl:grid-cols-4" tiles={[
        { key: "q", label: "In my queue now", tone: "navy", value: queued },
        { key: "c", label: "Calls today", tone: "sky", value: s.calls, sub: s.interested ? `${s.interested} interested` : undefined, href: "/calls/history" },
        { key: "r", label: "Reached today", tone: "green", value: s.reached, sub: s.calls ? `${s.reachPct}% of calls` : undefined },
        { key: "cb", label: "My callbacks", tone: "amber", value: callbacks, sub: s.talkMin ? `talk time ${s.talkMin} min` : undefined, href: "/calls/callbacks" },
      ]} />
      {lastLog && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Saved: <b>{lastLog.target?.name ?? lastLog.phone}</b> · {outcome(lastLog.outcome)?.label}
          {lastLog.target?.leadId && <> · <Link href={`/crm/leads/${lastLog.target.leadId}`} className="font-medium underline">sent to the CRM</Link></>}
        </p>
      )}
      {!target ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <Card><EmptyState title="Your queue is empty" description="No numbers are due right now. Your supervisor can give you a new batch, or check your callbacks." /></Card>
          {todayCard}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="p-6">
            <CallCard key={target.id} target={target} outcomes={OUTCOMES.map((o) => ({ value: o.value, label: o.label, tone: o.tone }))} action={logCall} waText={waText} />
          </Card>
          <div className="space-y-4">
            {todayCard}
            <Card className="p-5">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted">Campaign</p>
              <p className="font-medium">{target.campaign.name}</p>
              {Object.keys(extra).length > 0 && (
                <dl className="mt-3 space-y-1 text-sm">{Object.entries(extra).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="capitalize text-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}</dl>
              )}
            </Card>
            {target.campaign.script && (
              <Card className="p-5">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted">Script</p>
                <div className="max-h-72 overflow-y-auto whitespace-pre-line text-sm leading-relaxed">{target.campaign.script.replace(/\{\{\s*name\s*\}\}/g, target.name ?? "sir/madam").replace(/\{\{\s*agent\s*\}\}/g, user.name)}</div>
              </Card>
            )}
            {(target.logs.length > 0 || target.notes) && (
              <Card className="p-5">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted">Earlier</p>
                <ul className="space-y-2 text-sm">
                  {target.logs.map((l) => <li key={l.id} className="flex justify-between gap-2"><Badge tone="neutral">{outcome(l.outcome)?.label ?? l.outcome}</Badge><span className="text-xs text-muted">{format(l.startedAt, "d MMM, h:mm a")}</span></li>)}
                </ul>
                {target.notes && <p className="mt-2 whitespace-pre-line text-xs text-muted">{target.notes}</p>}
              </Card>
            )}
            <p className="text-center text-xs text-muted"><Link href="/calls/callbacks" className="hover:underline">My callbacks</Link> · <Link href="/calls/history" className="hover:underline">History</Link></p>
          </div>
        </div>
      )}
    </>
  );
}
