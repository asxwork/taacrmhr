// Calls → Reports → Agents: a detailed line per agent for a period (optionally one campaign), and one person's full
// report (totals, day by day, campaigns, outcomes, hours, latest calls). Karachi days.
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { outcome } from "./calls";

const PK = 5 * 3_600_000;
const pkDate = (d: Date) => new Date(+d + PK).toISOString().slice(0, 10);
const pkTime = (d: Date) => new Date(+d + PK).toISOString().slice(11, 16);

type Log = { agentId: string; outcome: string; durationSec: number | null; startedAt: Date; channel: string; campaignId: string | null };

/** The numbers for a set of calls (one agent, one day, one campaign…). */
function sum(ls: Log[]) {
  const calls = ls.filter((l) => l.channel !== "whatsapp");
  const n = (...v: string[]) => ls.filter((l) => v.includes(l.outcome)).length;
  const reached = calls.filter((l) => outcome(l.outcome)?.reached).length;
  const timed = calls.filter((l) => (l.durationSec ?? 0) > 0);
  const talk = ls.reduce((s, l) => s + (l.durationSec ?? 0), 0);
  const days = new Set(ls.map((l) => pkDate(l.startedAt))).size;
  const interested = n("interested");
  return {
    calls: calls.length, whatsapp: ls.length - calls.length, reached, reachPct: calls.length ? Math.round((reached / calls.length) * 100) : 0,
    interested, interestedPct: reached ? Math.round((interested / reached) * 100) : 0,
    callbacks: n("callback"), notInterested: n("not_interested", "do_not_call"), notAnswered: n("not_answered", "busy"), voicemail: n("voicemail"),
    switchedOff: n("switched_off"), wrong: n("wrong_number"), duplicate: n("already_customer"), inbound: n("inbound_answered", "inbound_missed"),
    talkMin: Math.round(talk / 60), avgSec: timed.length ? Math.round(timed.reduce((s, l) => s + (l.durationSec ?? 0), 0) / timed.length) : 0,
    days, perDay: days ? Math.round(calls.length / days) : 0,
  };
}
export type CallNumbers = ReturnType<typeof sum>;

const where = (from: Date, to: Date, o: { agentId?: string; campaignId?: string }): Prisma.CallLogWhereInput => ({
  startedAt: { gte: from, lt: to }, ...(o.agentId ? { agentId: o.agentId } : {}), ...(o.campaignId ? { campaignId: o.campaignId } : {}),
});
const SELECT = { agentId: true, outcome: true, durationSec: true, startedAt: true, channel: true, campaignId: true } as const;

/** One line per agent, most calls first, plus the team total. */
export async function agentsDetailed(from: Date, to: Date, o: { campaignId?: string } = {}) {
  const logs = await db.callLog.findMany({ where: where(from, to, o), select: SELECT });
  const by = new Map<string, Log[]>();
  for (const l of logs) { const a = by.get(l.agentId); if (a) a.push(l); else by.set(l.agentId, [l]); }
  const users = new Map((await db.user.findMany({ where: { id: { in: [...by.keys()] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const rows = [...by.entries()].map(([id, ls]) => ({ id, name: users.get(id) ?? "—", ...sum(ls) })).sort((a, b) => b.calls - a.calls);
  return { rows, total: sum(logs) };
}

/** One person's report for the period. */
export async function personReport(agentId: string, from: Date, to: Date, o: { campaignId?: string } = {}) {
  const logs = await db.callLog.findMany({ where: where(from, to, { ...o, agentId }), select: SELECT, orderBy: { startedAt: "asc" } });
  const byDay = new Map<string, Log[]>();
  for (const l of logs) { const k = pkDate(l.startedAt); const a = byDay.get(k); if (a) a.push(l); else byDay.set(k, [l]); }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, ls]) => ({ date, first: pkTime(ls[0]!.startedAt), last: pkTime(ls.at(-1)!.startedAt), ...sum(ls) }));
  const byCamp = new Map<string, Log[]>();
  for (const l of logs) { const k = l.campaignId ?? ""; const a = byCamp.get(k); if (a) a.push(l); else byCamp.set(k, [l]); }
  const names = new Map((await db.callCampaign.findMany({ where: { id: { in: [...byCamp.keys()].filter(Boolean) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const campaigns = [...byCamp.entries()].map(([id, ls]) => ({ id, name: id ? names.get(id) ?? "Deleted campaign" : "No campaign (keypad / inbound)", ...sum(ls) })).sort((a, b) => b.calls - a.calls);
  const outcomes = new Map<string, number>();
  for (const l of logs) { const k = outcome(l.outcome)?.label ?? l.outcome; outcomes.set(k, (outcomes.get(k) ?? 0) + 1); }
  const hours = Array.from({ length: 24 }, () => 0);
  for (const l of logs) if (l.channel !== "whatsapp") hours[new Date(+l.startedAt + PK).getUTCHours()]!++;
  const latest = await db.callLog.findMany({ where: where(from, to, { ...o, agentId }), orderBy: { startedAt: "desc" }, take: 50, include: { target: { select: { name: true, leadId: true } } } });
  return { total: sum(logs), days, campaigns, outcomes: [...outcomes.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n })), hours, latest };
}
