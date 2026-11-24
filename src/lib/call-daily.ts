// Calls: each agent's day in numbers, and the automatic end-of-shift report (sent to the agent, their manager and
// the call supervisors when the agent's shift ends).
import { db } from "./db";
import { notify } from "./notify";
import { outcome } from "./calls";

const PK = 5 * 3_600_000; // Karachi is UTC+5 all year
/** Karachi calendar day "yyyy-MM-dd" and its start/end as real instants. */
export function pkDay(d = new Date()) {
  const k = new Date(+d + PK);
  const date = k.toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${date}T00:00:00Z`) - PK);
  return { date, start, end: new Date(+start + 86_400_000 - 1) };
}
const pkTime = (d: Date) => new Date(+d + PK).toISOString().slice(11, 16);

export type DaySummary = {
  calls: number; reached: number; reachPct: number; talkMin: number; avgSec: number;
  interested: number; callbacks: number; notAnswered: number; wrong: number; whatsapp: number; inbound: number; missed: number;
  leads: number; first: string | null; last: string | null; longestGapMin: number;
  outcomes: { label: string; n: number }[]; hours: number[]; campaigns: { name: string; n: number }[];
};

/** One agent's calls between two instants, summarised. */
export async function agentDay(agentId: string, start: Date, end: Date): Promise<DaySummary> {
  const logs = await db.callLog.findMany({ where: { agentId, startedAt: { gte: start, lte: end } }, orderBy: { startedAt: "asc" }, select: { outcome: true, durationSec: true, startedAt: true, campaignId: true, direction: true } });
  const camps = await db.callCampaign.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.campaignId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
  const leads = await db.callTarget.count({ where: { assigneeId: agentId, leadId: { not: null }, lastCalledAt: { gte: start, lte: end } } });
  const count = (v: string) => logs.filter((l) => l.outcome === v).length;
  const reached = logs.filter((l) => outcome(l.outcome)?.reached).length;
  const talk = logs.reduce((s, l) => s + (l.durationSec ?? 0), 0);
  const timed = logs.filter((l) => (l.durationSec ?? 0) > 0);
  const hours = Array.from({ length: 24 }, () => 0);
  for (const l of logs) hours[new Date(+l.startedAt + PK).getUTCHours()]!++;
  let gap = 0;
  for (let i = 1; i < logs.length; i++) gap = Math.max(gap, (+logs[i]!.startedAt - +logs[i - 1]!.startedAt) / 60_000);
  const byOutcome = new Map<string, number>();
  for (const l of logs) { const k = outcome(l.outcome)?.label ?? l.outcome; byOutcome.set(k, (byOutcome.get(k) ?? 0) + 1); }
  const byCamp = new Map<string, number>();
  for (const l of logs) if (l.campaignId) byCamp.set(l.campaignId, (byCamp.get(l.campaignId) ?? 0) + 1);
  return {
    calls: logs.length, reached, reachPct: logs.length ? Math.round((reached / logs.length) * 100) : 0, talkMin: Math.round(talk / 60), avgSec: timed.length ? Math.round(talk / timed.length) : 0,
    interested: count("interested"), callbacks: count("callback"), notAnswered: count("not_answered") + count("busy") + count("voicemail") + count("switched_off"), wrong: count("wrong_number"),
    whatsapp: count("whatsapp_sent"), inbound: count("inbound_answered"), missed: count("inbound_missed"), leads,
    first: logs[0] ? pkTime(logs[0].startedAt) : null, last: logs.at(-1) ? pkTime(logs.at(-1)!.startedAt) : null, longestGapMin: Math.round(gap),
    outcomes: [...byOutcome.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n })), hours,
    campaigns: [...byCamp.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ name: camps.find((c) => c.id === id)?.name ?? "Campaign", n })),
  };
}

const two = (n: number) => String(n).padStart(2, "0");
/** The calls report as the team writes it (copied to WhatsApp): totals, connected, no answer, qualified, feedback. */
/**
 * The WhatsApp report, in the team's format (*bold* for WhatsApp):
 *   *INTERNATIONAL CALLING REPORT* / Total Calls = *515* / Connected = *81* / No Answer = *434* / Qualified = *00* /
 *   Feedback=… and, for one agent's own report, the totals block under it.
 */
export function callReportText(s: Pick<DaySummary, "calls" | "reached" | "notAnswered" | "interested">, feedback?: string | null, who?: string, opts: { title?: string; totals?: boolean } = {}) {
  return [
    opts.title ? `*${opts.title}*` : null,
    who ? `*${who}*` : null,
    `Total Calls = *${two(s.calls)}*`, `Connected = *${two(s.reached)}*`, `No Answer = *${two(s.notAnswered)}*`, `Qualified = *${two(s.interested)}*`,
    `Feedback=${feedback?.trim() || "—"}`,
    ...(opts.totals ? ["", callTotalsText([s])] : []),
  ].filter((x) => x !== null).join("\n");
}
/** The team block at the end of a day's reports. */
export function callTotalsText(rows: Pick<DaySummary, "calls" | "reached" | "interested">[]) {
  const t = rows.reduce((a, r) => ({ calls: a.calls + r.calls, reached: a.reached + r.reached, interested: a.interested + r.interested }), { calls: 0, reached: 0, interested: 0 });
  return [`*Total Calls = ${two(t.calls)}*`, `*Total Connected = ${two(t.reached)}*`, `*Total Qualified = ${two(t.interested)}*`].join("\n");
}

/** Calling agents: everyone with a softphone extension, plus anyone who logged a call today. */
async function callingAgents(start: Date, end: Date) {
  const [sip, called] = await Promise.all([
    db.sipAccount.findMany({ where: { enabled: true }, select: { userId: true } }),
    db.callLog.findMany({ where: { startedAt: { gte: start, lte: end } }, select: { agentId: true }, distinct: ["agentId"] }),
  ]);
  const ids = [...new Set([...sip.map((s) => s.userId), ...called.map((c) => c.agentId)])];
  return db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, name: true, email: true, managerId: true, employee: { select: { shift: { select: { start: true, end: true } } } } } });
}

/**
 * Every few minutes: for each calling agent whose shift has ended today (default 6 pm), make today's report once and
 * send it to the agent, their manager and the call supervisors (people who can assign call batches).
 */
export async function sendDueCallReports(now = new Date()) {
  const { date, start, end } = pkDay(now);
  const nowMin = new Date(+now + PK).getUTCHours() * 60 + new Date(+now + PK).getUTCMinutes();
  const agents = await callingAgents(start, end);
  const done = new Set((await db.callDailyReport.findMany({ where: { date }, select: { agentId: true } })).map((r) => r.agentId));
  let sent = 0;
  for (const a of agents) {
    if (done.has(a.id)) continue;
    const [h, m] = (a.employee?.shift?.end ?? "18:00").split(":").map(Number);
    if (nowMin < (h ?? 18) * 60 + (m ?? 0)) continue;
    const s = await agentDay(a.id, start, end);
    if (!s.calls && !(await db.sipAccount.findUnique({ where: { userId: a.id } }))) continue;
    const r = await db.callDailyReport.create({ data: { agentId: a.id, date, data: JSON.stringify(s) } });
    const note = await db.callDayNote.findUnique({ where: { agentId_date: { agentId: a.id, date } } });
    const line = callReportText(s, note?.feedback);
    const link = `/calls/reports/daily/${r.id}`;
    await notify(a.id, `Your calls today: ${s.calls} calls, ${s.interested} qualified`, { body: line, link, email: true }).catch(() => {});
    // The agent's own manager is told; call supervisors see all reports together in their morning summary instead.
    if (a.managerId && a.managerId !== a.id) await notify(a.managerId, `Daily calls report: ${a.name}`, { body: line, link }).catch(() => {});
    sent++;
  }
  return sent;
}
