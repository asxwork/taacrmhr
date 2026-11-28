import Link from "@/components/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { dialerPeople, isCallSupervisor } from "@/lib/calls";
import { GOAL_METRICS, dailyCounts, goalLabel, goalState, goalsFor, lastDays, type Goal } from "@/lib/call-goals";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { saveCallGoals } from "../actions";

export const metadata = { title: "Call targets" };

const TONE = { below: "bg-amber-50 text-amber-800 border-amber-200", met: "bg-emerald-50 text-emerald-800 border-emerald-200", over: "bg-sky-50 text-sky-800 border-sky-200" } as const;
const DOT = { below: "bg-amber-400", met: "bg-emerald-500", over: "bg-sky-500" } as const;

/** Calls → Targets (supervisors): each agent's daily target, an exact number or a range, and how they're doing. */
export default async function CallTargetsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const viewer = await requirePermission("calls");
  if (!isCallSupervisor(viewer)) redirect("/no-access");
  const kind = (await searchParams).kind === "sales" ? "sales" : (await searchParams).kind === "all" ? "all" : "csr";
  const people = (await dialerPeople()).filter((p) => p.canLog && (kind === "all" || p.kind === kind));
  const ids = people.map((p) => p.id);
  const days = lastDays(7);
  const today = days[0]!;
  const [goals, counts, ends] = await Promise.all([goalsFor(ids), dailyCounts(ids, days), db.callDayNote.findMany({ where: { agentId: { in: ids }, date: today, endedAt: { not: null } } })]);
  const endBy = new Map(ends.map((e) => [e.agentId, e]));
  const val = (n: number | null | undefined) => (n == null ? "" : String(n));

  return (
    <>
      <PageHeader title="Call targets" description="Give each agent a daily target: an exact number (fill From only) or a range (From and To). Agents see their progress on the dialer; here you see today's numbers and the last 7 days." />
      <div className="mb-4 flex w-fit rounded-lg bg-black/5 p-0.5 text-sm">
        {([["csr", "CSR agents"], ["sales", "Sales agents"], ["all", "Everyone"]] as const).map(([k, l]) => (
          <Link key={k} href={k === "csr" ? "/calls/targets" : `/calls/targets?kind=${k}`} className={cn("rounded-md px-3 py-1.5", kind === k ? "bg-surface font-medium shadow-xs" : "text-muted hover:text-ink")}>{l}</Link>
        ))}
      </div>
      {people.length === 0 ? <Card><EmptyState title="No agents here" description="People with the dialer (Calls → Edit) show up here." /></Card> : (
        <ActionForm action={saveCallGoals} className="space-y-4">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                  {GOAL_METRICS.map(([, l]) => <th key={l} className="px-3 py-2.5 font-medium">{l} per day <span className="font-normal normal-case">(from – to)</span></th>)}
                  <th className="px-3 py-2.5 font-medium">Today</th>
                  <th className="px-3 py-2.5 font-medium">Day ended</th>
                  <th className="px-4 py-2.5 font-medium">Last 7 days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => {
                  const g = goals.get(p.id) ?? {};
                  const c = counts.get(`${p.id}|${today}`) ?? { calls: 0, connected: 0, interested: 0 };
                  const main = g.calls;
                  return (
                    <tr key={p.id} className="align-middle">
                      <td className="px-4 py-2.5"><input type="hidden" name="agent" value={p.id} /><span className="font-medium">{p.name}</span><span className="block text-xs text-muted">{p.kind === "csr" ? "CSR agent" : p.roles || "Sales"}</span></td>
                      {GOAL_METRICS.map(([m]) => (
                        <td key={m} className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <input name={`${m}_min_${p.id}`} defaultValue={val(g[m]?.min)} inputMode="numeric" placeholder="—" className="input h-8 w-20 text-center tabular-nums" aria-label={`${p.name} ${m} from`} />
                            <span className="text-muted">–</span>
                            <input name={`${m}_max_${p.id}`} defaultValue={val(g[m]?.max)} inputMode="numeric" placeholder="—" className="input h-8 w-20 text-center tabular-nums" aria-label={`${p.name} ${m} to`} />
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {GOAL_METRICS.map(([m, l]) => {
                            const goal = g[m] as Goal | undefined;
                            if (!goal && m !== "calls") return null;
                            const st = goal ? goalState(c[m], goal) : null;
                            return <span key={m} title={l} className={cn("rounded-md border px-1.5 py-0.5 text-xs tabular-nums", st ? TONE[st] : "border-line text-muted")}>{m === "calls" ? "" : `${l.split(" ")[0]} `}{c[m]}{goal ? ` / ${goalLabel(goal)}` : ""}</span>;
                          })}
                        </div>
                      </td>
                      <td className="max-w-56 px-3 py-2.5 text-xs">{(() => { const e = endBy.get(p.id); return e ? <span><span className="font-medium text-emerald-700">{format(e.endedAt!, "h:mm a")}</span>{e.endReason && <span className="block text-red-700">{e.endReason}{e.endNote ? ` — ${e.endNote}` : ""}</span>}</span> : <span className="text-muted">—</span>; })()}</td>
                      <td className="px-4 py-2.5">
                        {main ? (
                          <div className="flex gap-1">
                            {days.slice().reverse().map((d) => {
                              const n = counts.get(`${p.id}|${d}`)?.calls ?? 0;
                              const st = goalState(n, main);
                              return <span key={d} title={`${format(new Date(`${d}T12:00:00`), "EEE d MMM")}: ${n} calls (target ${goalLabel(main)})`} className={cn("flex size-6 items-center justify-center rounded text-[10px] font-medium text-white", n === 0 ? "bg-slate-200 text-slate-500" : DOT[st])}>{n}</span>;
                            })}
                          </div>
                        ) : <span className="text-xs text-muted">No calls target</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton>Save targets</SubmitButton>
            <span className="flex flex-wrap gap-3 text-xs text-muted">
              <span className="flex items-center gap-1"><span className={`size-2.5 rounded ${DOT.below}`} /> below target</span>
              <span className="flex items-center gap-1"><span className={`size-2.5 rounded ${DOT.met}`} /> target met</span>
              <span className="flex items-center gap-1"><span className={`size-2.5 rounded ${DOT.over}`} /> above the range</span>
              <span>Empty boxes = no target. Calls made don&apos;t count WhatsApp messages.</span>
            </span>
          </div>
        </ActionForm>
      )}
    </>
  );
}
