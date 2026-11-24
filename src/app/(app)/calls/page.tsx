import Link from "@/components/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { can, requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { OUTCOMES, nextTarget, outcome, queueWhere } from "@/lib/calls";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { CallCard } from "@/components/calls/call-card";
import { logCall, saveCallFeedback, setCallMode } from "./actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { agentDay, pkDay } from "@/lib/call-daily";
import { HourChart } from "@/components/calls/day-report";

export const metadata = { title: "Dialer" };

/** Calls → Dialer: the agent's next number, the campaign script, and one-click outcomes. */
export default async function DialerPage({ searchParams }: { searchParams: Promise<{ dial?: string }> }) {
  const viewer = await requirePermission("calls");
  // Calls section landing: people who don't make calls start on Callbacks; Super Admins and supervisors who have no
  // numbers of their own start on Campaigns (to upload numbers and assign them to agents). ?dial=1 opens the dialer anyway.
  if (!can(viewer, "calls", "edit")) redirect("/calls/callbacks");
  if (!(await searchParams).dial) {
    // Super Admins manage calling (campaigns, assigning agents), they don't work a queue.
    if (viewer.isSuperAdmin) redirect("/calls/campaigns");
    if (can(viewer, "calls", "assign") && !(await db.callTarget.count({ where: { assigneeId: viewer.id } }))) redirect("/calls/campaigns");
  }
  const user = viewer;
  const day = pkDay();
  const [target, queued, callbacks, s, lastLog, note, modeRow] = await Promise.all([
    nextTarget(user.id),
    db.callTarget.count({ where: queueWhere(user.id) }),
    db.callTarget.count({ where: { assigneeId: user.id, status: "callback" } }),
    agentDay(user.id, day.start, day.end),
    db.callLog.findFirst({ where: { agentId: user.id, startedAt: { gte: new Date(Date.now() - 90_000) } }, orderBy: { startedAt: "desc" }, include: { target: { select: { name: true, phone: true, leadId: true } } } }),
    db.callDayNote.findUnique({ where: { agentId_date: { agentId: user.id, date: day.date } } }),
    db.setting.findUnique({ where: { key: `calls.mode.${user.id}` } }),
  ]);
  const mode = modeRow?.value === "landline" ? "landline" : "system";
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
      <ActionForm action={saveCallFeedback} className="mt-4 space-y-2 border-t border-line pt-3">
        <label className="block text-xs font-medium text-muted" htmlFor="call-feedback">Feedback for today&apos;s report</label>
        <textarea id="call-feedback" name="feedback" rows={3} defaultValue={note?.feedback ?? ""} placeholder="e.g. Most calls unanswered; those who answered aren't planning to buy or sell right now." className="input text-sm" />
        <SubmitButton className="h-9" variant="secondary">{note ? "Update feedback" : "Save feedback"}</SubmitButton>
      </ActionForm>
      <p className="mt-3 text-[11px] text-muted">Your report (calls, connected, no answer, qualified, feedback) is sent automatically when your shift ends.</p>
    </Card>
  );

  return (
    <>
      <PageHeader title="Dialer" description={`${format(new Date(), "EEEE d MMMM")} · numbers come in order: due callbacks, new numbers, then unanswered ones after a few hours.`} actions={
        // Two ways of calling: through AMS (click Call, e.g. international numbers) or by hand on a landline.
        <form action={setCallMode} className="flex rounded-lg border border-line bg-surface p-0.5 text-sm" aria-label="How I call">
          {([["system", "Click to call"], ["landline", "Landline (dial by hand)"]] as const).map(([k, l]) => (
            <button key={k} name="mode" value={k} className={`rounded-md px-3 py-1.5 font-medium transition ${mode === k ? "bg-navy-900 text-white" : "text-muted hover:text-ink"}`}>{l}</button>
          ))}
        </form>
      } />
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
            <CallCard key={target.id} target={target} mode={mode} dialPrefix={target.campaign.dialPrefix} details={Object.entries(extra).filter(([, v]) => String(v).trim())} outcomes={OUTCOMES.map((o) => ({ value: o.value, label: o.label, tone: o.tone }))} action={logCall} waText={waText} />
          </Card>
          <div className="space-y-4">
            {todayCard}
            <Card className="p-5">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted">Campaign</p>
              <p className="font-medium">{target.campaign.name}</p>
              {target.campaign.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{target.campaign.description}</p>}
              {target.campaign.sourceName && <p className="mt-2 text-xs text-muted">Source: <b className="font-medium text-ink">{target.campaign.sourceName}</b></p>}
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
