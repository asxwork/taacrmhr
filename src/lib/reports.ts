import type { Prisma } from "@prisma/client";
import {
  differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, endOfDay, endOfMonth, endOfQuarter, endOfYear,
  format, startOfDay, startOfMonth, startOfQuarter, startOfWeek, startOfYear, subDays, subMonths,
} from "date-fns";
import { db } from "./db";
import { scopeWhere } from "./permissions";
import type { SessionUser } from "./auth";

export const PERIODS = [
  { value: "month", label: "This month" },
  { value: "lastmonth", label: "Last month" },
  { value: "30d", label: "Last 30 days" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
] as const;

export function resolvePeriod(period?: string, fromStr?: string, toStr?: string) {
  const now = new Date();
  switch (period) {
    case "lastmonth": { const m = subMonths(now, 1); return { from: startOfMonth(m), to: endOfMonth(m) }; }
    case "30d": return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "quarter": return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case "year": return { from: startOfYear(now), to: endOfYear(now) };
    case "custom": {
      const from = fromStr ? startOfDay(new Date(fromStr)) : startOfMonth(now);
      const to = toStr ? endOfDay(new Date(toStr)) : endOfDay(now);
      return Number.isNaN(+from) || Number.isNaN(+to) || from > to ? { from: startOfMonth(now), to: endOfMonth(now) } : { from, to };
    }
    default: return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

export type ReportFilters = { from: Date; to: Date; branchId?: string; ownerId?: string };

/** All CRM report datasets, limited to the user's reports.crm scope. Returns null when they have none. */
export async function crmReport(user: SessionUser, f: ReportFilters) {
  const scope = await scopeWhere(user, "reports.crm");
  if (!scope) return null;
  const narrow = { ...scope, ...(f.branchId && { branchId: f.branchId }), ...(f.ownerId && { ownerId: f.ownerId }) };
  const inPeriod = { gte: f.from, lte: f.to };
  const leadWhere: Prisma.LeadWhereInput = { ...narrow, createdAt: inPeriod };
  const wonWhere: Prisma.DealWhereInput = { ...narrow, stage: { kind: "won" }, closedAt: inPeriod };

  const [leads, converted, won, lost, openDeals, stages, activities, sources, people] = await Promise.all([
    db.lead.findMany({ where: leadWhere, select: { createdAt: true, sourceId: true, ownerId: true, convertedAt: true, status: { select: { kind: true } } } }),
    db.lead.count({ where: { ...narrow, convertedAt: inPeriod } }),
    db.deal.findMany({ where: wonWhere, select: { value: true, commissionPct: true, ownerId: true, createdAt: true, closedAt: true } }),
    db.deal.findMany({ where: { ...narrow, stage: { kind: "lost" }, closedAt: inPeriod }, select: { lostReason: true } }),
    db.deal.groupBy({ by: ["stageId"], where: { ...narrow, closedAt: null }, _count: true, _sum: { value: true } }),
    db.stage.findMany({ where: { kind: "open" }, include: { pipeline: true }, orderBy: [{ pipeline: { sortOrder: "asc" } }, { sortOrder: "asc" }] }),
    db.activity.groupBy({ by: ["ownerId", "type"], where: { ...(narrow as Prisma.ActivityWhereInput), type: { in: ["call", "meeting", "visit", "email"] }, OR: [{ doneAt: inPeriod }, { doneAt: null, dueAt: inPeriod }] }, _count: true }),
    db.leadSource.findMany({ orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  // Leads over time: daily up to ~2 months, weekly up to ~6 months, monthly beyond.
  const span = differenceInCalendarDays(f.to, f.from);
  const bucket = span <= 62 ? "day" : span <= 190 ? "week" : "month";
  const keyOf = (d: Date) => format(bucket === "day" ? d : bucket === "week" ? startOfWeek(d, { weekStartsOn: 1 }) : startOfMonth(d), "yyyy-MM-dd");
  const buckets = (bucket === "day" ? eachDayOfInterval({ start: f.from, end: f.to }) : bucket === "week" ? eachWeekOfInterval({ start: f.from, end: f.to }, { weekStartsOn: 1 }) : eachMonthOfInterval({ start: f.from, end: f.to }));
  const counts = new Map<string, number>();
  for (const l of leads) counts.set(keyOf(l.createdAt), (counts.get(keyOf(l.createdAt)) ?? 0) + 1);
  const overTime = buckets.map((d) => ({
    label: format(d, bucket === "month" ? "MMM yyyy" : "d MMM"),
    short: format(d, bucket === "month" ? "MMM" : "d"),
    value: counts.get(format(d, "yyyy-MM-dd")) ?? 0,
  }));

  const bySource = [...sources, { id: null as string | null, name: "No source" }]
    .map((s) => {
      const rows = leads.filter((l) => l.sourceId === s.id);
      return { name: s.name, leads: rows.length, converted: rows.filter((l) => l.convertedAt).length };
    })
    .filter((s) => s.leads > 0)
    .sort((a, b) => b.leads - a.leads);

  const pipeline = stages
    .map((s) => {
      const g = openDeals.find((o) => o.stageId === s.id);
      return { name: s.name, pipeline: s.pipeline.name, count: g?._count ?? 0, value: g?._sum.value ?? 0 };
    })
    .filter((s) => s.count > 0);

  const reasons = new Map<string, number>();
  for (const d of lost) reasons.set(d.lostReason?.trim() || "No reason given", (reasons.get(d.lostReason?.trim() || "No reason given") ?? 0) + 1);
  const lostReasons = [...reasons].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const ownerIds = new Set([...leads.map((l) => l.ownerId), ...won.map((d) => d.ownerId), ...activities.map((a) => a.ownerId)].filter(Boolean) as string[]);
  const leaderboard = [...ownerIds]
    .map((id) => {
      const mine = leads.filter((l) => l.ownerId === id);
      const wins = won.filter((d) => d.ownerId === id);
      const acts = activities.filter((a) => a.ownerId === id);
      const act = (t: string) => acts.find((a) => a.type === t)?._count ?? 0;
      return {
        id,
        name: people.find((p) => p.id === id)?.name ?? "Former user",
        leads: mine.length,
        converted: mine.filter((l) => l.convertedAt).length,
        calls: act("call"),
        meetings: act("meeting") + act("visit"),
        emails: act("email"),
        won: wins.length,
        wonValue: wins.reduce((s, d) => s + (d.value ?? 0), 0),
        commission: wins.reduce((s, d) => s + ((d.value ?? 0) * (d.commissionPct ?? 0)) / 100, 0),
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.won - a.won || b.leads - a.leads);

  const wonValue = won.reduce((s, d) => s + (d.value ?? 0), 0);
  const daysToClose = won.length ? won.reduce((s, d) => s + differenceInCalendarDays(d.closedAt!, d.createdAt), 0) / won.length : null;

  return {
    bucket,
    kpis: {
      newLeads: leads.length,
      converted,
      conversionRate: leads.length ? leads.filter((l) => l.convertedAt).length / leads.length : null,
      junk: leads.filter((l) => l.status.kind === "junk").length,
      won: won.length,
      wonValue,
      openValue: openDeals.reduce((s, o) => s + (o._sum.value ?? 0), 0),
      openCount: openDeals.reduce((s, o) => s + o._count, 0),
      daysToClose,
    },
    overTime,
    bySource,
    pipeline,
    lostReasons,
    leaderboard,
  };
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => {
    const s = c == null ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}
