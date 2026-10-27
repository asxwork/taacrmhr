import Link from "next/link";
import { format, startOfDay } from "date-fns";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { OUTCOMES, nextTarget, outcome, queueWhere } from "@/lib/calls";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { CallCard } from "@/components/calls/call-card";
import { logCall } from "./actions";

export const metadata = { title: "Dialer" };

/** Calls → Dialer: the agent's next number, the campaign script, and one-click outcomes. */
export default async function DialerPage() {
  const user = await requirePermission("calls", "edit");
  const today = startOfDay(new Date());
  const [target, queued, callbacks, logs, lastLog] = await Promise.all([
    nextTarget(user.id),
    db.callTarget.count({ where: queueWhere(user.id) }),
    db.callTarget.count({ where: { assigneeId: user.id, status: "callback" } }),
    db.callLog.findMany({ where: { agentId: user.id, startedAt: { gte: today } }, select: { outcome: true, durationSec: true } }),
    db.callLog.findFirst({ where: { agentId: user.id, startedAt: { gte: new Date(Date.now() - 90_000) } }, orderBy: { startedAt: "desc" }, include: { target: { select: { name: true, phone: true, leadId: true } } } }),
  ]);
  const reached = logs.filter((l) => outcome(l.outcome)?.reached).length;
  const talk = logs.reduce((s, l) => s + (l.durationSec ?? 0), 0);
  let extra: Record<string, string> = {};
  try { extra = target?.extra ? JSON.parse(target.extra) : {}; } catch {}
  const waText = (target?.campaign.waMessage ?? "").replace(/\{\{\s*name\s*\}\}/g, target?.name ?? "").replace(/\{\{\s*agent\s*\}\}/g, user.name);

  return (
    <>
      <PageHeader title="Dialer" description={`${format(new Date(), "EEEE d MMMM")} · numbers come in order: due callbacks, new numbers, then unanswered ones after a few hours.`} />
      <DrillTiles className="mb-6 lg:grid-cols-4 xl:grid-cols-4" tiles={[
        { key: "q", label: "In my queue now", tone: "navy", value: queued },
        { key: "c", label: "Calls today", tone: "sky", value: logs.length, href: "/calls/history" },
        { key: "r", label: "Reached today", tone: "green", value: reached, sub: logs.length ? `${Math.round((reached / logs.length) * 100)}% of calls` : undefined },
        { key: "cb", label: "My callbacks", tone: "amber", value: callbacks, sub: talk ? `talk time ${Math.round(talk / 60)} min` : undefined, href: "/calls/callbacks" },
      ]} />
      {lastLog && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Saved: <b>{lastLog.target?.name ?? lastLog.phone}</b> · {outcome(lastLog.outcome)?.label}
          {lastLog.target?.leadId && <> · <Link href={`/crm/leads/${lastLog.target.leadId}`} className="font-medium underline">sent to the CRM</Link></>}
        </p>
      )}
      {!target ? (
        <Card><EmptyState title="Your queue is empty" description="No numbers are due right now. Your supervisor can give you a new batch, or check your callbacks." /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="p-6">
            <CallCard key={target.id} target={target} outcomes={OUTCOMES.map((o) => ({ value: o.value, label: o.label, tone: o.tone }))} action={logCall} waText={waText} />
          </Card>
          <div className="space-y-4">
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
