// Calls → Wallboard and Reports: per-agent and per-campaign numbers from the call log (shared with CSV export).
import { db } from "./db";
import { OUTCOMES, outcome } from "./calls";

export async function agentStats(from: Date, to: Date) {
  const logs = await db.callLog.findMany({ where: { startedAt: { gte: from, lt: to } }, select: { agentId: true, outcome: true, durationSec: true, startedAt: true, channel: true } });
  const users = new Map((await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.agentId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const by = new Map<string, typeof logs>();
  for (const l of logs) by.set(l.agentId, [...(by.get(l.agentId) ?? []), l]);
  return [...by.entries()].map(([id, ls]) => {
    const calls = ls.filter((l) => l.channel !== "whatsapp");
    const reached = calls.filter((l) => outcome(l.outcome)?.reached).length;
    return {
      id, name: users.get(id) ?? "—", calls: calls.length, whatsapp: ls.length - calls.length, reached,
      interested: ls.filter((l) => l.outcome === "interested").length, callbacks: ls.filter((l) => l.outcome === "callback").length,
      talkMin: Math.round(ls.reduce((s, l) => s + (l.durationSec ?? 0), 0) / 60), last: ls.reduce<Date | null>((m, l) => (!m || l.startedAt > m ? l.startedAt : m), null),
      reachRate: calls.length ? Math.round((reached / calls.length) * 100) : 0,
    };
  }).sort((a, b) => b.calls - a.calls);
}

export async function outcomeStats(from: Date, to: Date) {
  const rows = await db.callLog.groupBy({ by: ["outcome"], where: { startedAt: { gte: from, lt: to } }, _count: true });
  return OUTCOMES.map((o) => ({ ...o, count: rows.find((r) => r.outcome === o.value)?._count ?? 0 })).filter((o) => o.count);
}

export async function campaignStats(from: Date, to: Date) {
  const rows = await db.callLog.groupBy({ by: ["campaignId", "outcome"], where: { startedAt: { gte: from, lt: to } }, _count: true });
  const names = new Map((await db.callCampaign.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const by = new Map<string, { calls: number; interested: number; reached: number }>();
  for (const r of rows) {
    const k = r.campaignId ?? "";
    const cur = by.get(k) ?? { calls: 0, interested: 0, reached: 0 };
    by.set(k, { calls: cur.calls + r._count, interested: cur.interested + (r.outcome === "interested" ? r._count : 0), reached: cur.reached + (outcome(r.outcome)?.reached ? r._count : 0) });
  }
  return [...by.entries()].map(([id, v]) => ({ id, name: names.get(id) ?? "—", ...v })).sort((a, b) => b.calls - a.calls);
}
