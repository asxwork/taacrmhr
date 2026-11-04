// Boss weekly email: every Monday (daily cron), last week's sales and HR numbers to everyone with the permission.
import { format, startOfDay, subDays } from "date-fns";
import { db } from "./db";
import { notify } from "./notify";
import { loadUserById } from "./auth";
import { can } from "./permissions";
import { disabledFeatures } from "./features";
import { fmtPKR } from "./crm-shared";

export async function weeklySummary() {
  const to = startOfDay(new Date());
  const from = subDays(to, 7);
  const range = { gte: from, lt: to };
  const [leads, sources, won, lost, calls, visits, joiners, leavers, headcount, pendingApprovals, topAgents] = await Promise.all([
    db.lead.count({ where: { createdAt: range } }),
    db.lead.groupBy({ by: ["sourceId"], where: { createdAt: range }, _count: { _all: true }, orderBy: { _count: { sourceId: "desc" } }, take: 3 }),
    db.deal.aggregate({ where: { stage: { kind: "won" }, closedAt: range }, _count: { _all: true }, _sum: { value: true } }),
    db.deal.count({ where: { stage: { kind: "lost" }, closedAt: range } }),
    db.activity.count({ where: { type: "call", createdAt: range } }),
    db.activity.count({ where: { type: "visit", OR: [{ doneAt: range }, { checkInAt: range }] } }),
    db.employee.count({ where: { joiningDate: range } }),
    db.employee.count({ where: { leftAt: range } }),
    db.employee.count({ where: { status: { not: "left" } } }),
    db.approvalRequest.count({ where: { status: "pending" } }),
    db.deal.groupBy({ by: ["ownerId"], where: { stage: { kind: "won" }, closedAt: range, ownerId: { not: null } }, _sum: { value: true }, orderBy: { _sum: { value: "desc" } }, take: 3 }),
  ]);
  const names = new Map((await db.leadSource.findMany({ where: { id: { in: sources.map((s) => s.sourceId).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const agents = new Map((await db.user.findMany({ where: { id: { in: topAgents.map((a) => a.ownerId!) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const lines = [
    `Week of ${format(from, "d MMM")} – ${format(subDays(to, 1), "d MMM yyyy")}`,
    "",
    "SALES",
    `• New leads: ${leads}${sources.length ? ` (top: ${sources.map((s) => `${names.get(s.sourceId ?? "") ?? "No source"} ${s._count._all}`).join(", ")})` : ""}`,
    `• Deals won: ${won._count._all} worth ${fmtPKR(won._sum.value ?? 0)} · lost: ${lost}`,
    `• Calls logged: ${calls} · site visits: ${visits}`,
    topAgents.length ? `• Top agents: ${topAgents.map((a) => `${agents.get(a.ownerId!) ?? "—"} (${fmtPKR(a._sum.value ?? 0)})`).join(", ")}` : null,
    "",
    "PEOPLE",
    `• Headcount: ${headcount} · joined: ${joiners} · left: ${leavers}`,
    `• Requests waiting for approval: ${pendingApprovals}`,
  ].filter((l) => l !== null) as string[];
  return { title: `Weekly summary: ${leads} leads, ${won._count._all} deals won (${fmtPKR(won._sum.value ?? 0)})`, body: lines.join("\n") };
}

/** Sends the summary to everyone with Boss weekly email → Read. Runs on Mondays from the daily job. */
export async function sendWeeklyEmail(force = false) {
  if ((await disabledFeatures()).has("weekly")) return 0;
  if (!force && new Date().getDay() !== 1) return 0;
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  let summary: Awaited<ReturnType<typeof weeklySummary>> | null = null;
  let sent = 0;
  for (const { id } of users) {
    const u = await loadUserById(id);
    if (!u || !(u.isBoss || can(u, "reports.weekly"))) continue; // the Boss always gets it
    summary ??= await weeklySummary();
    await notify(id, summary.title, { body: summary.body, link: "/boss", email: true });
    sent++;
  }
  return sent;
}
