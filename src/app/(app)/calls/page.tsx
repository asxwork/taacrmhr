import Link from "@/components/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { can, requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { OUTCOMES, isCsrAgent, nextTarget, outcome, queueWhere } from "@/lib/calls";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { CallCard } from "@/components/calls/call-card";
import { endCallingDay, completeMyNumbers, createCallListing, editCallRemarks, logCall, saveCallFeedback, setCallMode, setDialCampaign } from "./actions";
import { ListingButton } from "@/components/calls/listing-button";
import { CampaignSwitch } from "@/components/calls/campaign-switch";
import { disabledFeatures } from "@/lib/features";
import { LastCalls } from "@/components/calls/last-calls";
import { fmtPhone } from "@/lib/crm-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { agentDay, callReportText, pkDay } from "@/lib/call-daily";
import { CopyText } from "@/components/calls/copy-text";
import { MessageCircle } from "lucide-react";
import { HourChart } from "@/components/calls/day-report";

const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

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
  // The campaign picked at the top (empty = all my campaigns); forgotten when it's no longer in my queue.
  const [pickRow, queueByCamp] = await Promise.all([
    db.setting.findUnique({ where: { key: `calls.camp.${user.id}` } }),
    db.callTarget.groupBy({ by: ["campaignId"], where: queueWhere(user.id), _count: true }),
  ]);
  const picked = pickRow?.value && queueByCamp.some((r) => r.campaignId === pickRow.value) ? pickRow.value : null;
  const [target, queued, callbacks, s, lastLog, note, modeRow, myCounts, myBatches, lastCalls] = await Promise.all([
    disabledFeatures().then((off) => nextTarget(user.id, picked, { bestTime: !off.has("calls-besttime") })),
    db.callTarget.count({ where: queueWhere(user.id, new Date(), picked) }),
    db.callTarget.count({ where: { assigneeId: user.id, status: "callback" } }),
    agentDay(user.id, day.start, day.end),
    db.callLog.findFirst({ where: { agentId: user.id, startedAt: { gte: new Date(Date.now() - 90_000) } }, orderBy: { startedAt: "desc" }, include: { target: { select: { name: true, phone: true, leadId: true } } } }),
    db.callDayNote.findUnique({ where: { agentId_date: { agentId: user.id, date: day.date } } }),
    db.setting.findUnique({ where: { key: `calls.mode.${user.id}` } }),
    db.callTarget.groupBy({ by: ["campaignId", "status"], where: { assigneeId: user.id }, _count: true }),
    db.callBatch.findMany({ where: { assigneeId: user.id }, select: { campaignId: true, completedAt: true } }),
    db.callLog.findMany({ where: { agentId: user.id }, orderBy: { startedAt: "desc" }, take: 3, include: { target: { select: { name: true } } } }),
  ]);
  // My share of each campaign: how many numbers, how many still never called, and whether I marked it completed.
  const campIds = [...new Set(myCounts.map((r) => r.campaignId))];
  const campNames = new Map((await db.callCampaign.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true, status: true } })).map((c) => [c.id, c]));
  const mine = campIds.map((id) => {
    const n = (...st: string[]) => myCounts.filter((r) => r.campaignId === id && st.includes(r.status)).reduce((a, r) => a + r._count, 0);
    const batches = myBatches.filter((b) => b.campaignId === id);
    return { id, name: campNames.get(id)?.name ?? "Campaign", total: n("new", "retry", "callback", "done", "dnc"), fresh: n("new"), retry: n("retry"), callback: n("callback"),
      completed: batches.length > 0 && batches.every((b) => b.completedAt) };
  }).filter((c) => c.total > 0 && !(c.completed && !c.fresh && !c.retry && !c.callback && campNames.get(c.id)?.status === "done"));
  const mode = modeRow?.value === "landline" ? "landline" : "system";
  const givenBy = target?.givenById ? (await db.user.findUnique({ where: { id: target.givenById }, select: { name: true, isSuperAdmin: true } })) : null;
  let extra: Record<string, string> = {};
  try { extra = target?.extra ? JSON.parse(target.extra) : {}; } catch {}
  // Details the supervisor chose to keep hidden from agents (Campaign → What agents see).
  try { for (const k of JSON.parse(target?.campaign.hiddenFields ?? "[]") as string[]) delete extra[k]; } catch {}
  // Today's report in the team's WhatsApp format, ready to copy or send to the group.
  const report = callReportText(s, [note?.feedback, note?.endReason && `Reason: ${note.endReason}${note.endNote ? ` — ${note.endNote}` : ""}`].filter(Boolean).join("\n") || null, undefined, { title: mode === "landline" ? "LANDLINE CALLING REPORT" : "INTERNATIONAL CALLING REPORT", totals: true });
  const fill = (t: string) => t.replace(/\{\{\s*name\s*\}\}/g, target?.name ?? "").replace(/\{\{\s*agent\s*\}\}/g, user.name);
  const off = await disabledFeatures();
  const templates = off.has("calls-templates") ? [] : (await db.callTemplate.findMany({
    where: { AND: [{ OR: [{ ownerId: user.id }, { shared: true }] }, { OR: [{ campaignId: null }, ...(target ? [{ campaignId: target.campaignId }] : [])] }] },
    orderBy: [{ shared: "asc" }, { name: "asc" }], select: { id: true, name: true, body: true, campaignId: true },
  })).sort((a, b) => Number(!a.campaignId) - Number(!b.campaignId)).map((t) => ({ id: t.id, name: t.name, text: fill(t.body), forCampaign: !!t.campaignId }));
  // My daily target (Calls → Targets), with today's progress.
  const { GOAL_METRICS, dailyCounts, goalLabel, goalState, goalsFor } = await import("@/lib/call-goals");
  const myGoals = off.has("calls-targets") ? {} : (await goalsFor([user.id])).get(user.id) ?? {};
  const myToday = (await dailyCounts([user.id], [day.date])).get(`${user.id}|${day.date}`) ?? { calls: 0, connected: 0, interested: 0 };
  const goalRows = GOAL_METRICS.filter(([m]) => myGoals[m]).map(([m, l]) => ({ m, l, goal: myGoals[m]!, n: myToday[m], st: goalState(myToday[m], myGoals[m]!) }));
  // End of the calling day: a reason is needed when no lead was made or a target was missed.
  const { END_REASONS } = await import("@/lib/call-goals");
  const endMissed = goalRows.filter((g) => g.st === "below").map((g) => `${g.l} ${g.n} of ${g.goal.min}`);
  const endChk = off.has("calls-endday") ? null : { missed: endMissed, noLead: s.leads === 0 && s.interested === 0, needsReason: endMissed.length > 0 || (s.leads === 0 && s.interested === 0) };
  const queueCamps = queueByCamp.map((r) => ({ id: r.campaignId, n: r._count, name: campNames.get(r.campaignId)?.name ?? "Campaign" }));
  const waText = (target?.campaign.waMessage ?? "").replace(/\{\{\s*name\s*\}\}/g, target?.name ?? "").replace(/\{\{\s*agent\s*\}\}/g, user.name);

  const myCampaigns = mine.length > 0 && (
    <Card className="p-5">
      <p className="mb-3 text-xs uppercase tracking-wide text-muted">My campaigns</p>
      <ul className="space-y-3">
        {mine.map((c) => {
          const called = c.total - c.fresh;
          return (
            <li key={c.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm"><span className="min-w-0 truncate font-medium">{c.name}</span><span className="shrink-0 tabular-nums text-xs text-muted">{called} / {c.total} called</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((called / Math.max(1, c.total)) * 100)}%` }} /></div>
              {c.completed ? <p className="mt-1.5 text-xs font-medium text-emerald-700">Completed ✓{c.callback ? ` · ${c.callback} callback(s) still planned` : ""}</p>
                : c.fresh === 0 ? (
                  <form action={completeMyNumbers} className="mt-2">
                    <input type="hidden" name="campaignId" value={c.id} />
                    <button className="h-8 w-full rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700">Mark as completed{c.retry ? ` (${c.retry} not reached won't come back)` : ""}</button>
                  </form>
                ) : <p className="mt-1.5 text-xs text-muted">{c.fresh} not called yet</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );

  // My last 3 calls, with an Edit for wrong remarks.
  const lastCallsCard = lastCalls.length > 0 && (
    <Card className="p-5">
      <p className="mb-3 text-xs uppercase tracking-wide text-muted">My last calls</p>
      <LastCalls action={editCallRemarks} rows={lastCalls.map((l) => ({ id: l.id, who: l.target?.name ?? fmtPhone(l.phone), outcome: outcome(l.outcome)?.label ?? l.outcome, notes: l.notes, when: format(l.startedAt, "h:mm a") }))} />
      <p className="mt-3 text-[11px] text-muted">You can fix the remarks of your last 3 calls.</p>
    </Card>
  );

  const endCard = endChk && (
    <Card className={note?.endedAt ? "border-emerald-200 p-5" : "p-5"}>
      <p className="mb-2 text-xs uppercase tracking-wide text-muted">End my calling day</p>
      {note?.endedAt ? (
        <div className="text-sm">
          <p className="font-medium text-emerald-700">✓ Day ended at {format(note.endedAt, "h:mm a")}</p>
          {note.endReason && <p className="mt-1 text-muted">Reason: {note.endReason}{note.endNote ? ` — ${note.endNote}` : ""}</p>}
          <p className="mt-2 text-xs text-muted">You can still call if needed; the numbers keep counting.</p>
        </div>
      ) : (
        <ActionForm action={endCallingDay} className="space-y-2 text-sm">
          <ul className="space-y-1 text-xs">
            <li className={s.leads || s.interested ? "text-emerald-700" : "text-red-600"}>{s.leads || s.interested ? `✓ ${s.interested} interested · ${s.leads} lead(s) made` : "✗ No lead made today"}</li>
            {endChk.missed.length ? endChk.missed.map((m) => <li key={m} className="text-red-600">✗ Target missed: {m}</li>) : goalRows.length ? <li className="text-emerald-700">✓ Daily targets met</li> : null}
          </ul>
          {endChk.needsReason && (
            <>
              <select name="reason" required defaultValue="" className="input h-9 text-sm" aria-label="Reason">
                <option value="" disabled>Why? Pick a reason…</option>
                {END_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <textarea name="note" rows={2} placeholder="More detail (needed for Other)" className="input text-sm" />
            </>
          )}
          <SubmitButton className="h-9 w-full" pendingText="Ending…">End my day</SubmitButton>
        </ActionForm>
      )}
    </Card>
  );

  const goalCard = goalRows.length > 0 && (
    <Card className="p-5">
      <h2 className="mb-3 text-xs font-normal uppercase tracking-wide text-muted">Today&apos;s target</h2>
      <ul className="space-y-3">
        {goalRows.map((g) => {
          const top = g.goal.max ?? g.goal.min;
          const pct = Math.min(100, Math.round((g.n / Math.max(1, top)) * 100));
          return (
            <li key={g.m}>
              <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{g.l}</span><span className="tabular-nums"><b className="text-base">{g.n}</b> <span className="text-muted">/ {goalLabel(g.goal)}</span></span></div>
              <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                <div className={`h-full rounded-full ${g.st === "below" ? "bg-amber-400" : g.st === "met" ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
                {g.goal.max != null && <span className="absolute top-0 h-full w-0.5 bg-ink/30" style={{ left: `${Math.round((g.goal.min / top) * 100)}%` }} title={`Minimum ${g.goal.min}`} />}
              </div>
              <p className="mt-1 text-xs text-muted">{g.st === "below" ? `${g.goal.min - g.n} more to reach the target` : g.st === "met" ? "Target met ✓" : "Above the range ✓"}</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );

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
      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-2 text-xs font-medium text-muted">Today&apos;s report</p>
        <CopyText text={report} />
        <a href={`https://wa.me/?text=${encodeURIComponent(report)}`} target="_blank" rel="noreferrer" className="mt-2 flex h-9 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-white hover:bg-[#1ebe5b]">
          <MessageCircle className="size-4" /> Send on WhatsApp (pick the group)
        </a>
      </div>
      <p className="mt-3 text-[11px] text-muted">Save your feedback first so it&apos;s in the report. It&apos;s also sent automatically when your shift ends.</p>
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
      {target && (
        // The campaign this number belongs to, at the top where the agent looks first.
        <Card className="mb-4 flex flex-wrap items-start gap-x-8 gap-y-2 border-l-4 border-l-navy-900 px-5 py-3">
          <div className="min-w-[18rem] flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Campaign</p>
            {queueCamps.length > 1 ? (
              // Several campaigns: switch here (All = numbers from every campaign, in queue order).
              <CampaignSwitch key={picked ?? "all"} action={setDialCampaign} value={picked ?? ""} options={[{ id: "", label: `All my campaigns (${queueCamps.reduce((a, c) => a + c.n, 0)})` }, ...queueCamps.map((c) => ({ id: c.id, label: `${c.name} (${c.n})` }))]} />
            ) : <p className="font-semibold">{target.campaign.name}</p>}
            {(picked === null && queueCamps.length > 1) && <p className="mt-0.5 text-xs text-muted">This number: <b className="font-medium text-ink">{target.campaign.name}</b></p>}
            {target.round === 2 && <span className="mt-1 inline-block"><Badge tone="amber">2nd round</Badge></span>}
            {target.bestHour != null && !off.has("calls-besttime") && <p className="mt-1 text-xs text-emerald-700">🕑 Usually picks up around {hourLabel(target.bestHour)}</p>}
            {target.campaign.description && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{target.campaign.description}</p>}
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            {target.campaign.sourceName && <div><dt className="inline">Source: </dt><dd className="inline font-medium text-ink">{target.campaign.sourceName}</dd></div>}
            {target.campaign.numbersFrom && <div><dt className="inline">Numbers from: </dt><dd className="inline font-medium text-ink">{target.campaign.numbersFrom}</dd></div>}
            {givenBy && <div><dt className="inline">Given to you by: </dt><dd className="inline font-medium text-ink">{givenBy.name}{givenBy.isSuperAdmin ? " (Super Admin)" : ""}{target.givenAt ? ` · ${format(target.givenAt, "d MMM")}` : ""}</dd></div>}
          </dl>
        </Card>
      )}
      {!target ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <Card><EmptyState title="Your queue is empty" description="No numbers are due right now. Your supervisor can give you a new batch, or check your callbacks." /></Card>
          <div className="space-y-4">{goalCard}{endCard}{todayCard}{lastCallsCard}{myCampaigns}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="p-6">
            <CallCard key={`${target.id}-${target.attempts}-${target.status}-${target.lastCalledAt?.getTime() ?? 0}`} target={target} mode={mode} dialPrefix={target.campaign.dialPrefix} details={Object.entries(extra).filter(([, v]) => String(v).trim())} outcomes={OUTCOMES.map((o) => ({ value: o.value, label: o.label, tone: o.tone }))} action={logCall} waText={waText} templates={templates} campaignId={target.campaignId}
              extraButton={isCsrAgent(user) && <ListingButton action={createCallListing} targetId={target.id} name={target.name} phone={target.phone} />} />
          </Card>
          <div className="space-y-4">
            {goalCard}
            {endCard}
            {todayCard}
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
            {lastCallsCard}
            {myCampaigns}
            <p className="text-center text-xs text-muted"><Link href="/calls/callbacks" className="hover:underline">My callbacks</Link> · <Link href="/calls/history" className="hover:underline">History</Link></p>
          </div>
        </div>
      )}
    </>
  );
}
