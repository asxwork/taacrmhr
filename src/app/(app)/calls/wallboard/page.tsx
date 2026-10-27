import { differenceInMinutes, format, startOfDay } from "date-fns";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { agentStats } from "@/lib/call-reports";
import { callAgents } from "@/lib/calls";
import { SpyButtons } from "@/components/calls/spy-buttons";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata = { title: "Wallboard" };

/** Calls → Wallboard: today's team at a glance, refreshing every 20 seconds. */
export default async function Wallboard() {
  await requirePermission("calls", "create");
  const today = startOfDay(new Date());
  const [stats, agents, queue, dueCallbacks, sip] = await Promise.all([
    agentStats(today, new Date(today.getTime() + 86_400_000)),
    callAgents(false),
    db.callTarget.count({ where: { status: { in: ["new", "retry"] }, assigneeId: { not: null }, campaign: { status: "active" } } }),
    db.callTarget.count({ where: { status: "callback", callbackAt: { lte: new Date() } } }),
    db.sipAccount.findMany({ where: { enabled: true } }),
  ]);
  // Live softphone state (heartbeat every minute); older than 2.5 minutes means the phone is closed.
  const live = new Map(sip.map((x) => [x.userId, x]));
  const phoneState = (id: string) => {
    const x = live.get(id);
    if (!x || !x.presence || x.presence === "offline" || !x.presenceAt || Date.now() - x.presenceAt.getTime() > 150_000) return null;
    return x;
  };
  // The calling team, plus anyone else (e.g. a Super Admin) who made calls today.
  const rows = [
    ...agents.map((a) => stats.find((s) => s.id === a.id) ?? { id: a.id, name: a.name, calls: 0, whatsapp: 0, reached: 0, interested: 0, callbacks: 0, talkMin: 0, last: null, reachRate: 0 }),
    ...stats.filter((s) => !agents.some((a) => a.id === s.id)),
  ];
  const total = (k: "calls" | "reached" | "interested" | "talkMin") => rows.reduce((s, r) => s + r[k], 0);
  const state = (last: Date | null) => !last ? { label: "Not started", tone: "bg-slate-400" } : differenceInMinutes(new Date(), last) <= 5 ? { label: "On calls", tone: "bg-emerald-500" } : differenceInMinutes(new Date(), last) <= 20 ? { label: "Idle", tone: "bg-amber-500" } : { label: "Away", tone: "bg-red-500" };

  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader title="Wallboard" description={`Today · updated ${format(new Date(), "h:mm:ss a")} · refreshes every 20 seconds`} />
      <DrillTiles className="mb-6 lg:grid-cols-5 xl:grid-cols-5" tiles={[
        { key: "c", label: "Calls today", tone: "navy", value: total("calls") },
        { key: "r", label: "Reached", tone: "green", value: total("reached"), sub: total("calls") ? `${Math.round((total("reached") / total("calls")) * 100)}%` : undefined },
        { key: "i", label: "Interested", tone: "gold", value: total("interested") },
        { key: "q", label: "Numbers waiting", tone: "sky", value: queue },
        { key: "cb", label: "Callbacks due", tone: "amber", value: dueCallbacks, href: "/calls/callbacks" },
      ]} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const p = phoneState(r.id);
          const s = p?.presence === "talking" ? { label: `On a call${p.presencePeer ? ` · ${p.presencePeer}` : ""}`, tone: "bg-red-500 animate-pulse" }
            : p?.presence === "ringing" ? { label: `Ringing${p.presencePeer ? ` · ${p.presencePeer}` : ""}`, tone: "bg-amber-500 animate-pulse" }
            : p ? { label: "Ready", tone: "bg-emerald-500" } : state(r.last);
          return (
            <Card key={r.id} className="p-5">
              <div className="mb-3 flex items-center gap-2"><span className={cn("size-2.5 rounded-full", s.tone)} /><p className="flex-1 font-semibold">{r.name}{live.get(r.id) && <span className="ml-1.5 text-xs font-normal text-muted">ext {live.get(r.id)!.extension}</span>}</p><span className="text-xs text-muted">{s.label}{!p && r.last ? ` · ${format(r.last, "h:mm a")}` : ""}</span></div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {([["Calls", r.calls], ["Reached", r.reached], ["Interested", r.interested], ["Talk min", r.talkMin]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-canvas/60 py-2"><p className="text-xl font-semibold tabular-nums">{v}</p><p className="text-[11px] text-muted">{k}</p></div>
                ))}
              </div>
              {p?.presence === "talking" && <SpyButtons extension={p.extension} />}
            </Card>
          );
        })}
      </div>
    </>
  );
}
