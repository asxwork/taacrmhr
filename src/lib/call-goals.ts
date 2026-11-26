// Calls → Targets: each agent's daily goal (an exact number, or a range) for calls made, connected and interested,
// and how far they are today / on recent days. Karachi days.
import { db } from "./db";
import { outcome } from "./calls";
import { pkDay } from "./call-daily";

export const GOAL_METRICS = [["calls", "Calls made"], ["connected", "Connected"], ["interested", "Interested"]] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number][0];
export type Goal = { min: number; max: number | null };
export type Goals = Partial<Record<GoalMetric, Goal>>;

export async function goalsFor(agentIds: string[]): Promise<Map<string, Goals>> {
  const rows = await db.callGoal.findMany({ where: { agentId: { in: agentIds } } });
  const out = new Map<string, Goals>();
  for (const r of rows) out.set(r.agentId, { ...(out.get(r.agentId) ?? {}), [r.metric]: { min: r.min, max: r.max } });
  return out;
}

/** Calls made, connected and interested per agent per Karachi day, for the days given. */
export async function dailyCounts(agentIds: string[], days: string[]) {
  if (!agentIds.length || !days.length) return new Map<string, Record<GoalMetric, number>>();
  const from = pkDay(new Date(`${days[days.length - 1]}T12:00:00+05:00`)).start, to = pkDay(new Date(`${days[0]}T12:00:00+05:00`)).end;
  const logs = await db.callLog.findMany({ where: { agentId: { in: agentIds }, startedAt: { gte: from, lte: to } }, select: { agentId: true, startedAt: true, outcome: true, channel: true } });
  const out = new Map<string, Record<GoalMetric, number>>();
  for (const l of logs) {
    const key = `${l.agentId}|${pkDay(l.startedAt).date}`;
    const c = out.get(key) ?? { calls: 0, connected: 0, interested: 0 };
    if (l.channel !== "whatsapp") c.calls++;
    if (l.channel !== "whatsapp" && outcome(l.outcome)?.reached) c.connected++;
    if (l.outcome === "interested") c.interested++;
    out.set(key, c);
  }
  return out;
}

/** below: under the minimum · met: within the range (or at least the exact number) · over: above the range. */
export const goalState = (n: number, g: Goal) => (n < g.min ? "below" : g.max != null && n > g.max ? "over" : "met");
export const goalLabel = (g: Goal) => (g.max != null && g.max !== g.min ? `${g.min}–${g.max}` : String(g.min));

/** The last `n` Karachi days, newest first. */
export const lastDays = (n: number) => Array.from({ length: n }, (_, i) => pkDay(new Date(Date.now() - i * 86_400_000)).date);
