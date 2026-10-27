import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { outcome } from "@/lib/calls";
import { toCsv } from "@/lib/payroll-reports";

/** CSV of the call log for a date range (supervisors): /api/calls/export?from=…&to=… */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "calls", "export")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const from = new Date(`${url.searchParams.get("from")}T00:00:00`);
  const to = new Date(`${url.searchParams.get("to")}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return new Response("Bad request", { status: 400 });
  const logs = await db.callLog.findMany({ where: { startedAt: { gte: from, lt: new Date(to.getTime() + 86_400_000) } }, include: { target: { select: { name: true, campaign: { select: { name: true } } } } }, orderBy: { startedAt: "asc" } });
  const agents = new Map((await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.agentId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const rows = logs.map((l) => [l.startedAt.toISOString().replace("T", " ").slice(0, 16), agents.get(l.agentId) ?? "", l.target?.campaign.name ?? "", l.target?.name ?? "", l.phone, l.channel, outcome(l.outcome)?.label ?? l.outcome, l.durationSec ?? "", l.notes ?? ""]);
  return new Response("﻿" + toCsv(["Time", "Agent", "Campaign", "Name", "Phone", "Channel", "Outcome", "Talk sec", "Notes"], rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="calls-${url.searchParams.get("from")}.csv"` } });
}
